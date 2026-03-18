// Edge Function: POST /functions/v1/draft-pick
// Validates and records a draft pick, broadcasts to opponent.
// Uses optimistic locking with retry on version conflict.

import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId, loadMatchByRoomCode } from '../_shared/supabase.ts';
import { applyAction, DataRegistry, loadAndValidateData } from '@alloy/engine';
import type { MatchState } from '@alloy/engine';

// Module-scope cached registry for warm invocations
let registry: DataRegistry | null = null;

function getRegistry(): DataRegistry {
  if (registry) return registry;
  const data = loadAndValidateData();
  registry = new DataRegistry(
    data.affixes,
    data.combinations,
    data.synergies,
    data.baseItems,
    data.balance,
  );
  return registry;
}

const MAX_RETRIES = 3;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const userId = await getUserId(req);
    const { roomCode, orbUid } = await req.json() as { roomCode: string; orbUid: string };

    if (!roomCode || !orbUid) {
      return errorResponse('Missing roomCode or orbUid', 400);
    }

    const client = getServiceClient();
    const reg = getRegistry();

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Load match fresh each attempt
      const match = await loadMatchByRoomCode(client, roomCode);

      if (match.status !== 'active') {
        return errorResponse('Match is not active', 400);
      }

      // Authorize player
      const playerIndex = match.player1_id === userId ? 0
        : match.player2_id === userId ? 1
        : -1;
      if (playerIndex === -1) {
        return errorResponse('Not a participant in this match', 403);
      }

      const gameState = match.game_state as MatchState;

      // Apply the draft pick action via engine
      const result = applyAction(
        gameState,
        { kind: 'draft_pick', player: playerIndex as 0 | 1, orbUid },
        reg,
      );

      if (!result.ok) {
        return errorResponse(result.error, 400);
      }

      const newState = result.state;
      const phaseChanged = newState.phase.kind !== gameState.phase.kind;

      // Persist with optimistic locking
      const { data: updated, error: updateError } = await client
        .from('matches')
        .update({
          game_state: newState,
          phase: newState.phase.kind,
          version: match.version + 1,
        })
        .eq('id', match.id)
        .eq('version', match.version)
        .select()
        .single();

      if (updateError || !updated) {
        // Version conflict — retry from scratch
        if (attempt < MAX_RETRIES - 1) continue;
        return errorResponse('Version conflict — please retry', 409);
      }

      // Broadcast draft_pick event
      const channel = client.channel(`match:${roomCode}`);
      await channel.send({
        type: 'broadcast',
        event: 'draft_pick',
        payload: {
          player: playerIndex,
          orbUid,
          pool: newState.pool,
          stockpiles: [
            newState.players[0].stockpile,
            newState.players[1].stockpile,
          ],
        },
      });

      // If phase changed (draft -> forge), broadcast phase_changed
      if (phaseChanged) {
        await channel.send({
          type: 'broadcast',
          event: 'phase_changed',
          payload: {
            phase: newState.phase,
          },
        });
      }

      return jsonResponse({ ok: true, phase: newState.phase });
    }

    return errorResponse('Failed after retries', 500);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message.includes('not found') ? 404
      : message.includes('Unauthorized') || message.includes('token') ? 401
      : 500;
    return errorResponse(message, status);
  }
});
