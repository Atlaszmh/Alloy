// Edge Function: POST /functions/v1/match-complete
// Receives a completed MatchState from a live match, extracts a standardized
// MatchReport, and inserts it into the match_results, match_player_stats, and
// match_round_details reporting tables.

import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { extractMatchReport } from '@alloy/engine';
import type { MatchState } from '@alloy/engine';

/** Attempt to resolve the authenticated user ID from the Authorization header.
 *  Returns null (rather than throwing) so live matches without auth still work. */
async function tryGetUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) return null;

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const anonClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await anonClient.auth.getUser(token);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const body = await req.json() as { state: MatchState; seed?: number };
    const { state, seed } = body;

    if (!state) {
      return errorResponse('Missing state in request body', 400);
    }

    if (state.phase?.kind !== 'complete') {
      return errorResponse('Match is not in complete phase', 400);
    }

    const report = extractMatchReport(state, 'live', seed);

    const client = getServiceClient();
    const userId = await tryGetUserId(req);

    // Insert into match_results
    const { data: matchRow, error: matchError } = await client
      .from('match_results')
      .insert({
        source: 'live',
        seed: report.seed ?? null,
        winner: report.winner,
        rounds: report.rounds,
        duration_ms: report.durationMs,
      })
      .select('id')
      .single();

    if (matchError || !matchRow) {
      console.error('match_results insert failed:', matchError);
      return errorResponse('Failed to insert match result', 500);
    }

    const matchId: string = matchRow.id;

    // Insert into match_player_stats (one row per player)
    const playerRows = report.players.map((p) => ({
      match_id: matchId,
      player_index: p.playerIndex,
      user_id: p.playerIndex === 0 ? (userId ?? null) : null,
      final_hp: p.finalHP,
      affix_ids: p.affixIds,
      combination_ids: p.combinationIds,
      synergy_ids: p.synergyIds,
      loadout: p.loadout,
    }));

    const { error: statsError } = await client
      .from('match_player_stats')
      .insert(playerRows);

    if (statsError) {
      console.error('match_player_stats insert failed:', statsError);
      // Non-fatal: still return the match ID
    }

    // Insert into match_round_details (one row per round)
    const roundRows = report.roundDetails.map((rd) => ({
      match_id: matchId,
      round: rd.round,
      winner: rd.winner,
      duration_ticks: rd.durationTicks,
      p0_hp_final: rd.p0HpFinal,
      p1_hp_final: rd.p1HpFinal,
      p0_damage_dealt: rd.p0DamageDealt,
      p1_damage_dealt: rd.p1DamageDealt,
    }));

    const { error: roundsError } = await client
      .from('match_round_details')
      .insert(roundRows);

    if (roundsError) {
      console.error('match_round_details insert failed:', roundsError);
      // Non-fatal: still return the match ID
    }

    return jsonResponse({ ok: true, matchId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errorResponse(message, 500);
  }
});
