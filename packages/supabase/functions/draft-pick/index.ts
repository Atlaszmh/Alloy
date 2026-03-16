// Edge Function: POST /functions/v1/draft-pick
// Validates and records a draft pick, broadcasts to opponent

import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUserId } from '../_shared/supabase.ts';

interface DraftPickRequest {
  matchId: string;
  orbUid: string;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse();

  const userId = getUserId(req);
  if (!userId) return errorResponse('Unauthorized', 401);

  const body: DraftPickRequest = await req.json();

  // In production:
  // 1. Load match from DB
  // const { data: match } = await supabase.from('matches').select('*').eq('id', body.matchId).single();

  // 2. Verify it's this player's turn
  // const playerIndex = match.player1_id === userId ? 0 : match.player2_id === userId ? 1 : -1;
  // if (playerIndex === -1) return errorResponse('Not a participant');

  // 3. Verify match is in draft phase
  // if (match.phase !== 'draft') return errorResponse('Not in draft phase');

  // 4. Validate the pick using engine
  // - Reconstruct draft state from stored picks
  // - Call makePick() to validate
  // - If invalid, return error

  // 5. Store the pick
  // const { data: round } = await supabase.from('match_rounds').select('draft_picks')
  //   .eq('match_id', body.matchId).eq('round', 1).single();
  // const picks = round.draft_picks || [];
  // picks.push({ player: playerIndex, orbUid: body.orbUid, order: picks.length });
  // await supabase.from('match_rounds').update({ draft_picks: picks })
  //   .eq('match_id', body.matchId).eq('round', 1);

  // 6. Broadcast to channel
  // await supabase.channel(`match:${body.matchId}`).send({
  //   type: 'broadcast',
  //   event: 'draft:pick',
  //   payload: { player: playerIndex, orbUid: body.orbUid, pickOrder: picks.length },
  // });

  // 7. Check if draft is complete → transition to forge
  // if (allPicksMade) {
  //   await supabase.from('matches').update({ phase: 'forge' }).eq('id', body.matchId);
  //   await supabase.channel(`match:${body.matchId}`).send({
  //     type: 'broadcast',
  //     event: 'phase:forge',
  //     payload: { round: 1, timerEnd: Date.now() + 45000 },
  //   });
  // }

  return jsonResponse({ success: true, pickOrder: 0 });
}
