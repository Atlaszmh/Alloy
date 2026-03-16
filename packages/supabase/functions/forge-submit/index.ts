// Edge Function: POST /functions/v1/forge-submit
// Validates and stores a player's forge build. When both submitted, runs duel simulation.

import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUserId } from '../_shared/supabase.ts';

interface ForgeSubmitRequest {
  matchId: string;
  round: number;
  build: {
    weapon: unknown; // ForgedItem
    armor: unknown;  // ForgedItem
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse();

  const userId = getUserId(req);
  if (!userId) return errorResponse('Unauthorized', 401);

  const body: ForgeSubmitRequest = await req.json();

  // In production:
  // 1. Load match
  // const { data: match } = await supabase.from('matches').select('*').eq('id', body.matchId).single();

  // 2. Verify player is participant
  // const playerIndex = match.player1_id === userId ? 0 : 1;

  // 3. Verify match is in forge phase and correct round
  // if (match.phase !== 'forge' || match.round !== body.round) return errorResponse('Invalid phase');

  // 4. Validate build using engine
  // - Reconstruct player's stockpile from draft picks
  // - Verify all orbs in build belong to this player
  // - Verify flux budget not exceeded
  // - Verify all combinations are valid
  // - Verify slot constraints

  // 5. Store build
  // const buildColumn = playerIndex === 0 ? 'player1_build' : 'player2_build';
  // await supabase.from('match_rounds').update({ [buildColumn]: body.build })
  //   .eq('match_id', body.matchId).eq('round', body.round);

  // 6. Check if both submitted
  // const { data: round } = await supabase.from('match_rounds').select('player1_build, player2_build')
  //   .eq('match_id', body.matchId).eq('round', body.round).single();

  // if (round.player1_build && round.player2_build) {
  //   // BOTH SUBMITTED — run duel simulation
  //   const data = loadAndValidateData();
  //   const registry = new DataRegistry(...);
  //
  //   // Calculate stats
  //   const stats0 = calculateStats(round.player1_build, registry);
  //   const stats1 = calculateStats(round.player2_build, registry);
  //
  //   // Run duel
  //   const rng = new SeededRNG(match.pool_seed).fork(`duel_${body.round}`);
  //   const combatLog = simulate([stats0, stats1], [round.player1_build, round.player2_build], registry, rng, body.round);
  //
  //   // Store result
  //   await supabase.from('match_rounds').update({
  //     duel_event_log: combatLog,
  //     duel_winner: combatLog.result.winner,
  //   }).eq('match_id', body.matchId).eq('round', body.round);
  //
  //   // Update match scores
  //   const scores = JSON.parse(match.scores);
  //   scores[combatLog.result.winner]++;
  //   await supabase.from('matches').update({
  //     scores: JSON.stringify(scores),
  //     phase: 'duel',
  //   }).eq('id', body.matchId);
  //
  //   // Broadcast duel result with revealed builds
  //   await supabase.channel(`match:${body.matchId}`).send({
  //     type: 'broadcast',
  //     event: 'phase:duel',
  //     payload: {
  //       combatLog,
  //       builds: [round.player1_build, round.player2_build],
  //     },
  //   });
  // }

  return jsonResponse({ success: true });
}
