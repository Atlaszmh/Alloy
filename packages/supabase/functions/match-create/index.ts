// Edge Function: POST /functions/v1/match-create
// Creates a new match with a room code for the authenticated user.

import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId } from '../_shared/supabase.ts';
import { createMatch, DataRegistry, loadAndValidateData } from '@alloy/engine';
import type { MatchMode } from '@alloy/engine';

let registry: DataRegistry | null = null;
function getRegistry(): DataRegistry {
  if (!registry) {
    const data = loadAndValidateData();
    registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
  }
  return registry;
}

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
    const seed = Math.floor(Math.random() * 999999999);

    // Create initial engine match state
    // Player 2 is a placeholder until someone joins
    const matchId = crypto.randomUUID();
    const baseWeaponId = 'sword';
    const baseArmorId = 'chainmail';

    const reg = getRegistry();
    const gameState = createMatch(matchId, seed, body.mode as MatchMode, [userId, ''], baseWeaponId, baseArmorId, reg);

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
