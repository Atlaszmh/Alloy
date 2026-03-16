// Edge Function: GET /functions/v1/match-state?matchId={id}
// Returns current match state with visibility filtering

import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUserId } from '../_shared/supabase.ts';

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse();

  const userId = getUserId(req);
  if (!userId) return errorResponse('Unauthorized', 401);

  const url = new URL(req.url);
  const matchId = url.searchParams.get('matchId');
  if (!matchId) return errorResponse('matchId required');

  // In production:
  // 1. Load match
  // const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
  // if (!match) return errorResponse('Match not found', 404);

  // 2. Verify player is participant
  // const playerIndex = match.player1_id === userId ? 0 : match.player2_id === userId ? 1 : -1;
  // if (playerIndex === -1) return errorResponse('Not a participant', 403);

  // 3. Load current round
  // const { data: round } = await supabase.from('match_rounds').select('*')
  //   .eq('match_id', matchId).eq('round', match.round).single();

  // 4. Apply visibility filtering
  // During forge: opponent build = null
  // During/after duel: opponent build revealed
  // const opponentBuild = match.phase === 'forge' ? null :
  //   (playerIndex === 0 ? round.player2_build : round.player1_build);
  // const myBuild = playerIndex === 0 ? round.player1_build : round.player2_build;

  // 5. Mark used orbs in stockpiles
  // Used-orb marking: cross-reference stockpile against loadout slots
  // Each orb gets a `usedIn: 'weapon' | 'armor' | null` field

  // 6. Load all round results for score display
  // const { data: allRounds } = await supabase.from('match_rounds')
  //   .select('round, duel_winner, duel_event_log')
  //   .eq('match_id', matchId)
  //   .order('round');

  return jsonResponse({
    match: null,
    currentRound: 1,
    pool: [],
    myStockpile: [],
    opponentStockpile: [],
    myBuild: null,
    opponentBuild: null,
    combatLog: null,
  });
}
