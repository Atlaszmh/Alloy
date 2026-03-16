// Edge Function: POST /functions/v1/match-complete
// Handles post-duel logic: ELO update, progression, phase advancement

import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUserId } from '../_shared/supabase.ts';

interface MatchCompleteRequest {
  matchId: string;
  round: number;
}

// Standard ELO calculation (K=32)
function calculateEloDelta(playerElo: number, opponentElo: number, won: boolean): number {
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  const actual = won ? 1 : 0;
  return Math.round(32 * (actual - expected));
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse();

  const userId = getUserId(req);
  if (!userId) return errorResponse('Unauthorized', 401);

  const body: MatchCompleteRequest = await req.json();

  // In production:
  // 1. Load match and check if it should advance
  // const { data: match } = await supabase.from('matches')...

  // 2. Determine if match is decided (player has 2 wins, or round 3 complete)
  // const scores = JSON.parse(match.scores);
  // const matchDecided = scores[0] >= 2 || scores[1] >= 2 || body.round >= 3;

  // if (matchDecided) {
  //   // 3. Calculate winner
  //   const winner = scores[0] > scores[1] ? 0 : scores[1] > scores[0] ? 1 : null;
  //   const result = winner === 0 ? 'player1_win' : winner === 1 ? 'player2_win' : 'draw';
  //
  //   // 4. ELO update (ranked matches only)
  //   if (match.mode === 'ranked' && !match.is_ai_match) {
  //     const { data: p1 } = await supabase.from('profiles').select('elo').eq('id', match.player1_id).single();
  //     const { data: p2 } = await supabase.from('profiles').select('elo').eq('id', match.player2_id).single();
  //     const delta = calculateEloDelta(p1.elo, p2.elo, winner === 0);
  //     await supabase.from('profiles').update({ elo: p1.elo + delta, matches_played: p1.matches_played + 1, matches_won: p1.matches_won + (winner === 0 ? 1 : 0) }).eq('id', match.player1_id);
  //     await supabase.from('profiles').update({ elo: p2.elo - delta, matches_played: p2.matches_played + 1, matches_won: p2.matches_won + (winner === 1 ? 1 : 0) }).eq('id', match.player2_id);
  //   }
  //
  //   // 5. Update mastery tracks based on affixes used
  //   // ... iterate loadout slots, find affix categories, award mastery XP
  //
  //   // 6. Check for level-up unlocks
  //   // ... check player level, unlock new weapons/armor at thresholds
  //
  //   // 7. Mark match complete
  //   await supabase.from('matches').update({
  //     phase: 'complete',
  //     result,
  //     elo_delta: delta,
  //     completed_at: new Date().toISOString(),
  //   }).eq('id', body.matchId);
  //
  //   // 8. Broadcast completion
  //   await supabase.channel(`match:${body.matchId}`).send({
  //     type: 'broadcast',
  //     event: 'match:complete',
  //     payload: { result, scores, eloDelta: delta },
  //   });
  //
  //   return jsonResponse({ matchResult: result, eloDelta: delta, xpGained: 50 });
  // }

  // If not decided, advance to next round (forge/adapt phase)
  // const nextRound = body.round + 1;
  // await supabase.from('matches').update({ phase: 'forge', round: nextRound }).eq('id', body.matchId);
  // await supabase.from('match_rounds').insert({ match_id: body.matchId, round: nextRound });
  //
  // Broadcast phase change
  // await supabase.channel(`match:${body.matchId}`).send({
  //   type: 'broadcast',
  //   event: 'phase:forge',
  //   payload: { round: nextRound },
  // });

  return jsonResponse({ advancing: true, nextRound: body.round + 1 });
}
