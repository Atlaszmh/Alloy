// Edge Function: POST /functions/v1/matchmaking
// Handles queue join/leave and ELO-based matching

import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUserId } from '../_shared/supabase.ts';

interface MatchmakingRequest {
  action: 'join' | 'leave';
}

// ELO matching config
const INITIAL_WINDOW = 50;
const WINDOW_EXPANSION = 25;
const MAX_WINDOW = 200;
const EXPANSION_INTERVAL_MS = 5000;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse();

  const userId = getUserId(req);
  if (!userId) return errorResponse('Unauthorized', 401);

  const body: MatchmakingRequest = await req.json();

  if (body.action === 'leave') {
    // Remove from queue
    // await supabase.from('matchmaking_queue').delete().eq('player_id', userId);
    return jsonResponse({ status: 'left_queue' });
  }

  if (body.action === 'join') {
    // Get player's ELO and rank
    // const { data: profile } = await supabase.from('profiles').select('elo, rank_tier').eq('id', userId).single();

    // Insert into matchmaking queue
    // await supabase.from('matchmaking_queue').insert({ player_id: userId, elo: profile.elo, rank_tier: profile.rank_tier });

    // Try to find a match immediately
    // The pg_cron job handles periodic matching, but we can also check here
    // const match = await tryMatchPlayer(userId, profile.elo, profile.rank_tier);
    // if (match) return jsonResponse({ status: 'matched', matchId: match.id });

    return jsonResponse({ status: 'queued' });
  }

  return errorResponse('Invalid action');
}

// Matchmaking algorithm:
// 1. Initial window: ±50 ELO for first 5 seconds
// 2. Expansion: +25 ELO every 5 seconds, up to ±200 max
// 3. Rank tier constraint: ±1 rank tier
// 4. After 60s with no match: offer AI match option
//
// Implementation: pg_cron runs every 3 seconds, queries queue ordered by queued_at,
// pairs players within ELO range. On pairing, calls match-create and removes both from queue.
