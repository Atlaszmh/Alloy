// Edge Function: POST /functions/v1/run-match
// Matches payloads for async duel matchmaking.
// Finds an opponent payload from the queue with similar round and power bracket.

import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId } from '../_shared/supabase.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

interface RunMatchRequest {
  runId: string;
  roundNumber: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const userId = await getUserId(req);
    const client = getServiceClient();

    const rateLimited = await checkRateLimit(client, userId, 'run-match');
    if (rateLimited) return rateLimited;

    const body: RunMatchRequest = await req.json();

    if (!body.runId || body.roundNumber == null) {
      return errorResponse('runId and roundNumber are required', 400);
    }

    // Load the run and verify ownership
    const { data: run, error: runError } = await client
      .from('runs')
      .select('*')
      .eq('id', body.runId)
      .eq('player_id', userId)
      .single();

    if (runError || !run) {
      return errorResponse('Run not found or not owned by user', 404);
    }

    // Get the player's own queue entry to find their power bracket
    const { data: ownEntry, error: ownError } = await client
      .from('payload_queue')
      .select('*')
      .eq('run_id', body.runId)
      .eq('run_round', body.roundNumber)
      .single();

    if (ownError || !ownEntry) {
      return errorResponse('No payload submitted for this round', 404);
    }

    const playerBracket = ownEntry.power_bracket as number;

    // Search for an opponent: different player, round delta <= 2, bracket delta <= 1, unmatched
    const minRound = body.roundNumber - 2;
    const maxRound = body.roundNumber + 2;
    const minBracket = Math.max(0, playerBracket - 1);
    const maxBracket = playerBracket + 1;

    const { data: candidates, error: matchError } = await client
      .from('payload_queue')
      .select('*')
      .neq('player_id', userId)
      .is('matched_at', null)
      .gte('run_round', minRound)
      .lte('run_round', maxRound)
      .gte('power_bracket', minBracket)
      .lte('power_bracket', maxBracket)
      .order('created_at', { ascending: true })
      .limit(1);

    if (matchError) {
      console.error('Matchmaking query failed:', matchError.message);
      return errorResponse('Matchmaking query failed', 500);
    }

    if (!candidates || candidates.length === 0) {
      return jsonResponse({ matched: false });
    }

    const opponent = candidates[0];

    // Mark both entries as matched
    const now = new Date().toISOString();
    const { error: updateOwnError } = await client
      .from('payload_queue')
      .update({ matched_at: now })
      .eq('id', ownEntry.id);

    const { error: updateOppError } = await client
      .from('payload_queue')
      .update({ matched_at: now })
      .eq('id', opponent.id);

    if (updateOwnError || updateOppError) {
      console.error('Failed to mark entries as matched:', updateOwnError?.message, updateOppError?.message);
      // Non-fatal: we still have the opponent data
    }

    return jsonResponse({
      matched: true,
      opponentPayload: opponent.payload_json,
      opponentRound: opponent.run_round,
      opponentBracket: opponent.power_bracket,
    });
  } catch (err) {
    console.error('run-match error:', err);
    const message = err instanceof Error ? err.message : '';
    const isAuth = message.includes('Authorization') || message.includes('token');
    return errorResponse(isAuth ? 'Unauthorized' : 'Internal server error', isAuth ? 401 : 500);
  }
});
