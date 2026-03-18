// Edge Function: POST /functions/v1/match-create
// Creates a new match with a room code for the authenticated user.

import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId } from '../_shared/supabase.ts';
import { createMatch } from '@alloy/engine';
import type { MatchMode } from '@alloy/engine';

interface MatchCreateRequest {
  mode: 'quick' | 'unranked' | 'ranked';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const userId = await getUserId(req);
    const body: MatchCreateRequest = await req.json();

    if (!body.mode || !['quick', 'unranked', 'ranked'].includes(body.mode)) {
      return errorResponse('Invalid mode. Must be quick, unranked, or ranked.', 400);
    }

    const client = getServiceClient();

    // Generate a unique room code via database function
    const { data: roomCode, error: rpcError } = await client.rpc('generate_room_code');
    if (rpcError || !roomCode) {
      return errorResponse('Failed to generate room code', 500);
    }

    // Generate random seed for deterministic game state
    const seed = Math.floor(Math.random() * 2147483647);

    // Create initial engine match state
    // Player 2 is a placeholder until someone joins
    const matchId = crypto.randomUUID();
    const baseWeaponId = 'sword';
    const baseArmorId = 'chainmail';

    // We store a minimal game_state that will be fully initialized when player 2 joins.
    // The engine's createMatch() requires a DataRegistry which isn't available in the
    // edge function yet — so we store the seed and parameters for deferred initialization.
    const gameState = {
      matchId,
      seed,
      mode: body.mode as MatchMode,
      baseWeaponId,
      baseArmorId,
      phase: { kind: 'waiting' as const },
      players: [
        { id: userId, stockpile: [], loadout: null },
        { id: null, stockpile: [], loadout: null },
      ],
      roundResults: [],
      duelLogs: [],
    };

    // Room code expires in 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { data: match, error: insertError } = await client
      .from('matches')
      .insert({
        id: matchId,
        room_code: roomCode,
        mode: body.mode,
        status: 'waiting',
        player1_id: userId,
        game_state: gameState,
        version: 0,
        seed,
        base_weapon_id: baseWeaponId,
        base_armor_id: baseArmorId,
        room_code_expires_at: expiresAt,
      })
      .select()
      .single();

    if (insertError || !match) {
      return errorResponse(`Failed to create match: ${insertError?.message ?? 'unknown'}`, 500);
    }

    return jsonResponse({ roomCode, matchId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errorResponse(message, 401);
  }
});
