// Edge Function: POST /functions/v1/ai-match-create
// Creates an AI match with server-generated seed for stat tracking

import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUserId } from '../_shared/supabase.ts';

interface AIMatchRequest {
  difficulty: 1 | 2 | 3 | 4 | 5;
  mode: 'quick' | 'unranked';
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse();

  const userId = getUserId(req);
  if (!userId) return errorResponse('Unauthorized', 401);

  const body: AIMatchRequest = await req.json();

  // Generate seed server-side for integrity
  const poolSeed = Math.floor(Math.random() * 2147483647);
  const baseWeaponId = 'sword';
  const baseArmorId = 'chainmail';

  // In production:
  // 1. Create match record
  // const { data: match } = await supabase.from('matches').insert({
  //   player1_id: userId,
  //   player2_id: null,
  //   is_ai_match: true,
  //   ai_difficulty: body.difficulty,
  //   mode: body.mode,
  //   pool_seed: poolSeed,
  //   base_weapon_id: baseWeaponId,
  //   base_armor_id: baseArmorId,
  // }).select().single();

  // 2. Match runs entirely client-side (offline capable)
  // 3. Results posted back via match-complete for stat tracking

  const matchId = crypto.randomUUID();

  return jsonResponse({
    matchId,
    poolSeed,
    baseWeaponId,
    baseArmorId,
  });
}
