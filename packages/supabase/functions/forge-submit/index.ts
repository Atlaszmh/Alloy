// Edge Function: POST /functions/v1/forge-submit
// Validates and stores a player's forge loadout. When both submitted, runs duel simulation.
// Handles Elo updates when match completes.

import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId, loadMatchByRoomCode } from '../_shared/supabase.ts';
import { applyAction, DataRegistry, loadAndValidateData } from '@alloy/engine';
import type { MatchState, Loadout } from '@alloy/engine';

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

/** Standard Elo calculation with variable K-factor */
function calculateEloDelta(
  playerElo: number,
  opponentElo: number,
  won: boolean,
  matchesPlayed: number,
): number {
  const K = matchesPlayed < 30 ? 32 : 16;
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  const actual = won ? 1 : 0;
  return Math.round(K * (actual - expected));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const userId = await getUserId(req);
    const { roomCode, loadout } = await req.json() as { roomCode: string; loadout: Loadout };

    if (!roomCode || !loadout) {
      return errorResponse('Missing roomCode or loadout', 400);
    }

    const client = getServiceClient();
    const reg = getRegistry();

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const match = await loadMatchByRoomCode(client, roomCode);

      if (match.status !== 'active') {
        return errorResponse('Match is not active', 400);
      }

      const playerIndex = match.player1_id === userId ? 0
        : match.player2_id === userId ? 1
        : -1;
      if (playerIndex === -1) {
        return errorResponse('Not a participant in this match', 403);
      }

      const gameState = match.game_state as MatchState;

      if (gameState.phase.kind !== 'forge') {
        return errorResponse('Not in forge phase', 400);
      }

      // Mark this player as forge-complete
      const forgeResult = applyAction(
        gameState,
        { kind: 'forge_complete', player: playerIndex as 0 | 1 },
        reg,
      );

      if (!forgeResult.ok) {
        return errorResponse(forgeResult.error, 400);
      }

      let newState = forgeResult.state;

      // Apply the player's loadout
      newState = {
        ...newState,
        players: newState.players.map((p, i) =>
          i === playerIndex ? { ...p, loadout } : p,
        ) as [typeof newState.players[0], typeof newState.players[1]],
      };

      const bothDone = newState.phase.kind === 'duel';

      // If both players submitted, run the duel simulation and advance
      if (bothDone) {
        const duelResult = applyAction(
          newState,
          { kind: 'advance_phase' },
          reg,
        );
        if (duelResult.ok) {
          newState = duelResult.state;
          const cont = applyAction(newState, { kind: 'duel_continue' }, reg);
          if (cont.ok) {
            newState = cont.state;
          }
        }
      }

      // Store build in match_rounds for history
      const buildColumn = playerIndex === 0 ? 'player1_build' : 'player2_build';
      const round = gameState.phase.kind === 'forge' ? gameState.phase.round : 1;
      await client
        .from('match_rounds')
        .upsert({
          match_id: match.id,
          round,
          [buildColumn]: loadout,
        }, { onConflict: 'match_id,round' });

      // Persist with optimistic locking
      const updatePayload: Record<string, unknown> = {
        game_state: newState,
        phase: newState.phase.kind,
        version: match.version + 1,
      };

      // If match is complete, mark it
      const matchComplete = newState.phase.kind === 'complete';
      if (matchComplete) {
        updatePayload.status = 'completed';
        updatePayload.completed_at = new Date().toISOString();

        const phase = newState.phase as { kind: 'complete'; winner: 0 | 1 | 'draw'; scores: [number, number] };
        updatePayload.result = phase.winner === 0 ? 'player1_win'
          : phase.winner === 1 ? 'player2_win'
          : 'draw';
      }

      const { data: updated, error: updateError } = await client
        .from('matches')
        .update(updatePayload)
        .eq('id', match.id)
        .eq('version', match.version)
        .select()
        .single();

      if (updateError || !updated) {
        if (attempt < MAX_RETRIES - 1) continue;
        return errorResponse('Version conflict — please retry', 409);
      }

      // Broadcast events
      const channel = client.channel(`match:${roomCode}`);

      if (!bothDone) {
        // Still in forge phase — just notify that this player submitted
        await channel.send({
          type: 'broadcast',
          event: 'forge_submitted',
          payload: { player: playerIndex },
        });
      } else {
        // Phase changed — reveal builds and combat log
        const latestLog = newState.duelLogs[newState.duelLogs.length - 1] ?? null;
        await channel.send({
          type: 'broadcast',
          event: 'phase_changed',
          payload: {
            phase: newState.phase,
            combatLog: latestLog,
            builds: [
              newState.players[0].loadout,
              newState.players[1].loadout,
            ],
          },
        });
      }

      // If match is complete, calculate Elo updates
      if (matchComplete) {
        const phase = newState.phase as { kind: 'complete'; winner: 0 | 1 | 'draw'; scores: [number, number] };

        try {
          const { data: p1 } = await client
            .from('profiles')
            .select('id, elo, matches_played, matches_won')
            .eq('id', match.player1_id)
            .single();

          const { data: p2 } = await client
            .from('profiles')
            .select('id, elo, matches_played, matches_won')
            .eq('id', match.player2_id)
            .single();

          if (p1 && p2 && phase.winner !== 'draw') {
            const p1Won = phase.winner === 0;
            const delta1 = calculateEloDelta(p1.elo, p2.elo, p1Won, p1.matches_played);
            const delta2 = calculateEloDelta(p2.elo, p1.elo, !p1Won, p2.matches_played);

            await client
              .from('profiles')
              .update({
                elo: p1.elo + delta1,
                matches_played: p1.matches_played + 1,
                matches_won: p1.matches_won + (p1Won ? 1 : 0),
              })
              .eq('id', p1.id);

            await client
              .from('profiles')
              .update({
                elo: p2.elo + delta2,
                matches_played: p2.matches_played + 1,
                matches_won: p2.matches_won + (!p1Won ? 1 : 0),
              })
              .eq('id', p2.id);

            // Store elo delta on match
            await client
              .from('matches')
              .update({ elo_delta: delta1 })
              .eq('id', match.id);
          } else if (p1 && p2) {
            // Draw — both get +1 match played, no elo change
            await client
              .from('profiles')
              .update({ matches_played: p1.matches_played + 1 })
              .eq('id', p1.id);
            await client
              .from('profiles')
              .update({ matches_played: p2.matches_played + 1 })
              .eq('id', p2.id);
          }
        } catch (_eloErr) {
          // Elo update failure should not fail the whole request
          console.error('Elo update failed:', _eloErr);
        }
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
