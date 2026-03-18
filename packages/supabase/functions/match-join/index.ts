// Edge Function: POST /functions/v1/match-join
// Joins an existing match by room code.

import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId, loadMatchByRoomCode } from '../_shared/supabase.ts';

interface MatchJoinRequest {
  roomCode: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const userId = await getUserId(req);
    const body: MatchJoinRequest = await req.json();

    if (!body.roomCode || typeof body.roomCode !== 'string') {
      return errorResponse('Missing or invalid roomCode', 400);
    }

    const roomCode = body.roomCode.toUpperCase().trim();
    const client = getServiceClient();

    // --- Rate limiting: max 5 join attempts per IP per minute ---
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown';

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

    const { count: recentAttempts } = await client
      .from('join_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('created_at', oneMinuteAgo);

    if (recentAttempts !== null && recentAttempts >= 5) {
      return errorResponse('Too many join attempts. Try again in a minute.', 429);
    }

    // Record this attempt
    await client.from('join_attempts').insert({
      ip_address: ip,
      room_code: roomCode,
      user_id: userId,
    });

    // --- Load and validate match ---
    const match = await loadMatchByRoomCode(client, roomCode);

    if (match.status !== 'waiting') {
      return errorResponse('This match is no longer accepting players.', 409);
    }

    if (match.player1_id === userId) {
      return errorResponse('You cannot join your own match.', 409);
    }

    // Check room code expiry
    if (match.room_code_expires_at && new Date(match.room_code_expires_at) < new Date()) {
      return errorResponse('Room code has expired.', 410);
    }

    // --- Update match: assign player 2, set status to active ---
    const currentVersion = match.version;
    const gameState = match.game_state;

    // Set player 2 ID in game state
    gameState.players[1].id = userId;
    // Transition phase from 'waiting' to 'draft' round 1
    gameState.phase = { kind: 'draft', round: 1, pickIndex: 0, activePlayer: 0 };

    const { data: updated, error: updateError } = await client
      .from('matches')
      .update({
        player2_id: userId,
        status: 'active',
        game_state: gameState,
        version: currentVersion + 1,
      })
      .eq('id', match.id)
      .eq('version', currentVersion) // Optimistic locking
      .select()
      .single();

    if (updateError || !updated) {
      return errorResponse('Failed to join match — it may have been updated. Try again.', 409);
    }

    // --- Broadcast match_started event ---
    await client.channel(`match:${roomCode}`).send({
      type: 'broadcast',
      event: 'match_started',
      payload: {
        matchId: match.id,
        player2Id: userId,
        phase: gameState.phase,
      },
    });

    return jsonResponse({
      matchId: match.id,
      roomCode,
      phase: gameState.phase,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message.includes('not found') ? 404 : 401;
    return errorResponse(message, status);
  }
});
