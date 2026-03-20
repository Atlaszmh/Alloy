import { Router, Request, Response } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

/** Extract common filter params from the query string. */
function parseFilters(query: Request['query']) {
  const runId = typeof query.runId === 'string' && query.runId ? query.runId : undefined;
  const configId = typeof query.configId === 'string' && query.configId ? query.configId : undefined;
  const source = typeof query.source === 'string' && query.source ? query.source : undefined;
  const dateFrom = typeof query.dateFrom === 'string' && query.dateFrom ? query.dateFrom : undefined;
  const dateTo = typeof query.dateTo === 'string' && query.dateTo ? query.dateTo : undefined;
  const winner =
    typeof query.winner === 'string' && query.winner !== ''
      ? Number(query.winner)
      : undefined;
  return { runId, configId, source, dateFrom, dateTo, winner };
}

/** Apply common filters to a Supabase query builder. */
function applyFilters<T>(
  q: T & {
    eq: (col: string, val: unknown) => T;
    gte: (col: string, val: string) => T;
    lte: (col: string, val: string) => T;
  },
  filters: ReturnType<typeof parseFilters>,
): T {
  if (filters.runId) q = q.eq('run_id', filters.runId);
  if (filters.configId) q = q.eq('config_id', filters.configId);
  if (filters.source) q = q.eq('source', filters.source);
  if (filters.winner !== undefined) q = q.eq('winner', filters.winner);
  if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom);
  if (filters.dateTo) q = q.lte('created_at', filters.dateTo);
  return q;
}

// GET /api/reports/overview
router.get('/overview', async (req: Request, res: Response) => {
  const filters = parseFilters(req.query);

  let q = supabase.from('match_results').select('winner, duration_ms, rounds');
  q = applyFilters(q as Parameters<typeof applyFilters>[0], filters);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const rows = (data ?? []) as Array<{ winner: number | null; duration_ms: number; rounds: number }>;
  const totalMatches = rows.length;
  const p0Wins = rows.filter(r => r.winner === 0).length;
  const p1Wins = rows.filter(r => r.winner === 1).length;
  const avgDurationMs = totalMatches > 0
    ? rows.reduce((sum, r) => sum + r.duration_ms, 0) / totalMatches
    : 0;

  // Most picked affix — requires a separate query
  let mostPickedAffix: string | null = null;
  try {
    const { data: affixData } = await supabase.rpc('affix_win_stats', {
      p_run_id: filters.runId ?? null,
    });
    if (affixData && affixData.length > 0) {
      const sorted = [...affixData].sort(
        (a: { pick_count: number }, b: { pick_count: number }) => b.pick_count - a.pick_count,
      );
      mostPickedAffix = sorted[0].affix_id ?? null;
    }
  } catch {
    // Non-fatal: affix function may not exist yet
  }

  res.json({
    totalMatches,
    p0WinRate: totalMatches > 0 ? p0Wins / totalMatches : null,
    p1WinRate: totalMatches > 0 ? p1Wins / totalMatches : null,
    avgDurationMs,
    mostPickedAffix,
  });
});

// GET /api/reports/affix-stats
router.get('/affix-stats', async (req: Request, res: Response) => {
  const filters = parseFilters(req.query);

  const { data, error } = await supabase.rpc('affix_win_stats', {
    p_run_id: filters.runId ?? null,
  });

  if (error) return res.status(500).json({ error: error.message });

  const rows = (data ?? []) as Array<{
    affix_id: string;
    pick_count: number;
    win_count: number;
  }>;

  const result = rows.map(r => ({
    affixId: r.affix_id,
    pickCount: r.pick_count,
    winCount: r.win_count,
    winRate: r.pick_count > 0 ? r.win_count / r.pick_count : null,
  }));

  res.json(result);
});

// GET /api/reports/matchups
// Placeholder: returns empty matrix until archetype tracking is implemented.
router.get('/matchups', async (_req: Request, res: Response) => {
  res.json({ archetypes: [], matrix: [] });
});

// GET /api/reports/round-stats
router.get('/round-stats', async (req: Request, res: Response) => {
  const filters = parseFilters(req.query);

  // Use Supabase embedded select to join match_round_details via match_results
  // without needing to collect all match IDs (which can exceed URL length limits).
  let q = supabase
    .from('match_results')
    .select('match_round_details(round, winner, duration_ticks, p0_damage_dealt, p1_damage_dealt)');
  q = applyFilters(q as Parameters<typeof applyFilters>[0], filters);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  type RoundRow = {
    round: number;
    winner: number;
    duration_ticks: number;
    p0_damage_dealt: number;
    p1_damage_dealt: number;
  };

  const byRound = new Map<
    number,
    { wins: number; total: number; totalTicks: number; totalDamage: number }
  >();

  for (const match of (data ?? []) as Array<{ match_round_details: RoundRow[] }>) {
    for (const r of match.match_round_details ?? []) {
      const entry = byRound.get(r.round) ?? { wins: 0, total: 0, totalTicks: 0, totalDamage: 0 };
      entry.total += 1;
      entry.totalTicks += r.duration_ticks;
      entry.totalDamage += r.p0_damage_dealt + r.p1_damage_dealt;
      byRound.set(r.round, entry);
    }
  }

  const result = Array.from(byRound.entries())
    .sort(([a], [b]) => a - b)
    .map(([round, s]) => ({
      round,
      matchCount: s.total,
      avgDurationTicks: s.total > 0 ? s.totalTicks / s.total : 0,
      avgTotalDamage: s.total > 0 ? s.totalDamage / s.total : 0,
    }));

  res.json(result);
});

// GET /api/reports/distributions
router.get('/distributions', async (req: Request, res: Response) => {
  const filters = parseFilters(req.query);

  let q = supabase.from('match_results').select('duration_ms, rounds');
  q = applyFilters(q as Parameters<typeof applyFilters>[0], filters);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const rows = (data ?? []) as Array<{ duration_ms: number; rounds: number }>;

  res.json({
    durationMs: rows.map(r => r.duration_ms),
    rounds: rows.map(r => r.rounds),
  });
});

// GET /api/reports/config-comparison
router.get('/config-comparison', async (req: Request, res: Response) => {
  const configIdsParam = typeof req.query.configIds === 'string' ? req.query.configIds : '';
  const configIds = configIdsParam
    ? configIdsParam.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  if (configIds.length === 0) {
    return res.status(400).json({ error: 'configIds query param is required' });
  }

  const { data, error } = await supabase
    .from('match_results')
    .select('config_id, winner, duration_ms')
    .in('config_id', configIds);

  if (error) return res.status(500).json({ error: error.message });

  const byConfig = new Map<
    string,
    { total: number; p0Wins: number; totalDuration: number }
  >();

  for (const r of (data ?? []) as Array<{
    config_id: string;
    winner: number | null;
    duration_ms: number;
  }>) {
    const entry = byConfig.get(r.config_id) ?? { total: 0, p0Wins: 0, totalDuration: 0 };
    entry.total += 1;
    if (r.winner === 0) entry.p0Wins += 1;
    entry.totalDuration += r.duration_ms;
    byConfig.set(r.config_id, entry);
  }

  const result = Array.from(byConfig.entries()).map(([configId, s]) => ({
    configId,
    totalMatches: s.total,
    p0WinRate: s.total > 0 ? s.p0Wins / s.total : null,
    avgDurationMs: s.total > 0 ? s.totalDuration / s.total : 0,
  }));

  res.json(result);
});

// GET /api/reports/matches
router.get('/matches', async (req: Request, res: Response) => {
  const filters = parseFilters(req.query);
  const limit = typeof req.query.limit === 'string' ? Math.min(parseInt(req.query.limit, 10) || 50, 200) : 50;
  const offset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) || 0 : 0;
  const seed = typeof req.query.seed === 'string' && req.query.seed ? parseInt(req.query.seed, 10) : undefined;

  let q = supabase
    .from('match_results')
    .select('id, seed, winner, rounds, duration_ms, run_id, config_id, created_at, match_player_stats(player_index, affix_ids, loadout)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  q = applyFilters(q as Parameters<typeof applyFilters>[0], filters);
  if (seed !== undefined && !isNaN(seed)) {
    q = (q as ReturnType<typeof applyFilters> & { eq: (col: string, val: unknown) => typeof q }).eq('seed', seed);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  // Flatten player stats into p0/p1 fields for the frontend
  const rows = (data ?? []).map((row: Record<string, unknown>) => {
    const players = (row.match_player_stats ?? []) as Array<{
      player_index: number; affix_ids: string[]; loadout: unknown;
    }>;
    const p0 = players.find(p => p.player_index === 0);
    const p1 = players.find(p => p.player_index === 1);
    const { match_player_stats: _, ...rest } = row;
    return {
      ...rest,
      p0_affixes: p0?.affix_ids ?? [],
      p1_affixes: p1?.affix_ids ?? [],
    };
  });

  res.json(rows);
});

// GET /api/reports/matches/:id
router.get('/matches/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data: matchData, error: matchErr } = await supabase
    .from('match_results')
    .select('id, seed, winner, rounds, duration_ms, run_id, config_id, created_at, match_player_stats(player_index, affix_ids, combination_ids, synergy_ids, loadout, final_hp, ai_tier)')
    .eq('id', id)
    .single();

  if (matchErr) return res.status(matchErr.code === 'PGRST116' ? 404 : 500).json({ error: matchErr.message });

  const { data: roundData } = await supabase
    .from('match_round_details')
    .select('round, winner, duration_ticks, p0_hp_final, p1_hp_final, p0_damage_dealt, p1_damage_dealt')
    .eq('match_id', id)
    .order('round', { ascending: true });

  // Flatten player stats into p0/p1 fields for the frontend
  const players = ((matchData as Record<string, unknown>).match_player_stats ?? []) as Array<{
    player_index: number; affix_ids: string[]; combination_ids: string[];
    synergy_ids: string[]; loadout: unknown; final_hp: number; ai_tier: number | null;
  }>;
  const p0 = players.find(p => p.player_index === 0);
  const p1 = players.find(p => p.player_index === 1);
  const { match_player_stats: _, ...rest } = matchData as Record<string, unknown>;

  res.json({
    ...rest,
    p0_affixes: p0?.affix_ids ?? [],
    p1_affixes: p1?.affix_ids ?? [],
    p0_loadout: p0?.loadout ?? null,
    p1_loadout: p1?.loadout ?? null,
    players,
    round_details: roundData ?? [],
  });
});

export default router;
