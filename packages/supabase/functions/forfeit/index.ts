// Edge Function: POST /functions/v1/forfeit
// Handles explicit forfeit — marks match as forfeited, other player wins.

import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId, loadMatchByRoomCode } from '../_shared/supabase.ts';
import type { MatchState, MatchPhase } from '@alloy/engine';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const userId = await getUserId(req);
    const { roomCode } = await req.json() as { roomCode: string };

    if (!roomCode) {
      return errorResponse('Missing roomCode', 400);
    }

    const client = getServiceClient();
    const match = await loadMatchByRoomCode(client, roomCode);

    // Must be a participant
    const playerIndex = match.player1_id === userId ? 0
      : match.player2_id === userId ? 1
      : -1;
    if (playerIndex === -1) {
      return errorResponse('Not a participant in this match', 403);
    }

    // Match must be active
    if (match.status !== 'active') {
      return errorResponse('Match is not active', 400);
    }

    const winner = (playerIndex === 0 ? 1 : 0) as 0 | 1;

    // Update game_state phase to complete
    const gameState = match.game_state as MatchState;
    const completePhase: MatchPhase = {
      kind: 'complete',
      winner,
      scores: gameState.roundResults.reduce(
        (acc, r) => {
          if (r.winner === 0) acc[0]++;
          else if (r.winner === 1) acc[1]++;
          return acc;
        },
        [0, 0] as [number, number],
      ),
    };

    const newState: MatchState = {
      ...gameState,
      phase: completePhase,
    };

    const { error: updateError } = await client
      .from('matches')
      .update({
        status: 'forfeited',
        result: 'forfeit',
        game_state: newState,
        completed_at: new Date().toISOString(),
        version: match.version + 1,
      })
      .eq('id', match.id)
      .eq('version', match.version);

    if (updateError) {
      return errorResponse('Failed to update match', 500);
    }

    // Broadcast forfeit event
    await client.channel(`match:${roomCode}`).send({
      type: 'broadcast',
      event: 'match_forfeited',
      payload: {
        forfeitingPlayer: playerIndex,
        winner,
      },
    });

    return jsonResponse({ ok: true, winner });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message.includes('not found') ? 404
      : message.includes('Unauthorized') || message.includes('token') ? 401
      : 500;
    return errorResponse(message, status);
  }
});
