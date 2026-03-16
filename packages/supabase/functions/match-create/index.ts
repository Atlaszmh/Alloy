// Edge Function: POST /functions/v1/match-create
// Creates a new match between two players (called by matchmaking or AI match flow)

import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';

interface MatchCreateRequest {
  player1Id: string;
  player2Id: string | null;  // null for AI matches
  mode: 'quick' | 'unranked' | 'ranked';
  isAiMatch?: boolean;
  aiDifficulty?: number;
  seasonId?: number;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse();

  const body: MatchCreateRequest = await req.json();

  // Generate deterministic seed
  const poolSeed = Math.floor(Math.random() * 2147483647);

  // Select base weapon/armor (for now, always sword + chainmail)
  const baseWeaponId = 'sword';
  const baseArmorId = 'chainmail';

  // In production:
  // 1. Insert match row
  // const { data: match } = await supabase.from('matches').insert({
  //   player1_id: body.player1Id,
  //   player2_id: body.player2Id,
  //   is_ai_match: body.isAiMatch ?? false,
  //   ai_difficulty: body.aiDifficulty,
  //   mode: body.mode,
  //   season_id: body.seasonId,
  //   pool_seed: poolSeed,
  //   base_weapon_id: baseWeaponId,
  //   base_armor_id: baseArmorId,
  // }).select().single();

  // 2. Create match_rounds row for round 1
  // await supabase.from('match_rounds').insert({
  //   match_id: match.id,
  //   round: 1,
  // });

  // 3. Generate pool using engine and validate archetypes
  // const data = loadAndValidateData();
  // const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
  // const pool = generatePool(poolSeed, body.mode, registry);

  // 4. Broadcast match start to both players
  // await supabase.channel(`match:${match.id}`).send({
  //   type: 'broadcast',
  //   event: 'match:start',
  //   payload: { matchId: match.id, poolSeed, baseWeaponId, baseArmorId, pool },
  // });

  const matchId = crypto.randomUUID();

  return jsonResponse({
    matchId,
    poolSeed,
    baseWeaponId,
    baseArmorId,
  });
}
