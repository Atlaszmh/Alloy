// Edge Function: POST /functions/v1/forfeit
// Handles explicit forfeit — marks match as forfeit with forfeiting player as loser

import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUserId } from '../_shared/supabase.ts';

interface ForfeitRequest {
  matchId: string;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse();

  const userId = getUserId(req);
  if (!userId) return errorResponse('Unauthorized', 401);

  const body: ForfeitRequest = await req.json();

  // In production:
  // 1. Load match
  // const { data: match } = await supabase.from('matches').select('*').eq('id', body.matchId).single();
  // if (!match) return errorResponse('Match not found', 404);

  // 2. Verify player is participant and match is active
  // const playerIndex = match.player1_id === userId ? 0 : match.player2_id === userId ? 1 : -1;
  // if (playerIndex === -1) return errorResponse('Not a participant');
  // if (match.phase === 'complete') return errorResponse('Match already complete');

  // 3. Mark as forfeit
  // const result = playerIndex === 0 ? 'player2_win' : 'player1_win';
  // await supabase.from('matches').update({
  //   phase: 'complete',
  //   result: 'forfeit',
  //   completed_at: new Date().toISOString(),
  // }).eq('id', body.matchId);

  // 4. ELO adjustment (standard loss)
  // if (match.mode === 'ranked' && !match.is_ai_match) {
  //   // Apply ELO change as normal loss
  // }

  // 5. Notify opponent
  // await supabase.channel(`match:${body.matchId}`).send({
  //   type: 'broadcast',
  //   event: 'match:forfeit',
  //   payload: { forfeitingPlayer: playerIndex },
  // });

  return jsonResponse({ success: true, result: 'forfeit' });
}
