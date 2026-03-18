// Edge Function: GET /functions/v1/match-state?roomCode=HK7P2Q
// Returns current match state with visibility filtering (hides opponent loadout during forge).

import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId, loadMatchByRoomCode } from '../_shared/supabase.ts';
import type { MatchState } from '@alloy/engine';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const userId = await getUserId(req);

    const url = new URL(req.url);
    const roomCode = url.searchParams.get('roomCode');
    if (!roomCode) {
      return errorResponse('roomCode query parameter required', 400);
    }

    const client = getServiceClient();
    const match = await loadMatchByRoomCode(client, roomCode);

    // Authorize: must be a participant
    const playerIndex = match.player1_id === userId ? 0
      : match.player2_id === userId ? 1
      : -1;
    if (playerIndex === -1) {
      return errorResponse('Not a participant in this match', 403);
    }

    const gameState = match.game_state as MatchState;

    // Visibility filtering: during forge phase, hide opponent's loadout
    const filteredState = { ...gameState };
    if (gameState.phase.kind === 'forge') {
      const opponentIndex = playerIndex === 0 ? 1 : 0;
      filteredState.players = gameState.players.map((p, i) =>
        i === opponentIndex ? { ...p, loadout: null as unknown as typeof p.loadout } : p,
      ) as [typeof gameState.players[0], typeof gameState.players[1]];
    }

    return jsonResponse({
      matchId: match.id,
      roomCode: match.room_code,
      status: match.status,
      state: filteredState,
      playerIndex,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message.includes('not found') ? 404
      : message.includes('Unauthorized') || message.includes('token') ? 401
      : 500;
    return errorResponse(message, status);
  }
});
