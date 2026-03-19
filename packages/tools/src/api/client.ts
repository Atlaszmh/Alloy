const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  configs: {
    list: () => request<ConfigSummary[]>('/api/configs'),
    get: (id: string) => request<ConfigRow>(`/api/configs/${id}`),
    create: (body: CreateConfigBody) =>
      request<ConfigRow>('/api/configs', { method: 'POST', body: JSON.stringify(body) }),
  },
  simulations: {
    start: (body: StartSimulationBody) =>
      request<SimulationRun>('/api/simulations', { method: 'POST', body: JSON.stringify(body) }),
    get: (id: string) => request<SimulationRun>(`/api/simulations/${id}`),
    cancel: (id: string) =>
      request<{ status: string }>(`/api/simulations/${id}/cancel`, { method: 'POST' }),
  },
  reports: {
    overview: (filters?: Record<string, string>) =>
      request<OverviewStats>(
        `/api/reports/overview?${new URLSearchParams(filters)}`,
      ),
    affixStats: (runId?: string) =>
      request<AffixStat[]>(
        `/api/reports/affix-stats?${new URLSearchParams({ runId: runId || '' })}`,
      ),
    matchups: (runId?: string) =>
      request<MatchupData>(
        `/api/reports/matchups?${new URLSearchParams({ runId: runId || '' })}`,
      ),
    roundStats: (runId?: string) =>
      request<RoundStat[]>(
        `/api/reports/round-stats?${new URLSearchParams({ runId: runId || '' })}`,
      ),
    distributions: (runId?: string) =>
      request<DistributionData>(
        `/api/reports/distributions?${new URLSearchParams({ runId: runId || '' })}`,
      ),
    configComparison: (configIds: string[]) =>
      request<ConfigComparisonResult[]>(
        `/api/reports/config-comparison?configIds=${configIds.join(',')}`,
      ),
    matches: (params: { runId?: string; limit?: number; offset?: number; seed?: number; winner?: number }) => {
      const p = new URLSearchParams();
      if (params.runId) p.set('runId', params.runId);
      if (params.limit !== undefined) p.set('limit', String(params.limit));
      if (params.offset !== undefined) p.set('offset', String(params.offset));
      if (params.seed !== undefined) p.set('seed', String(params.seed));
      if (params.winner !== undefined) p.set('winner', String(params.winner));
      return request<MatchListItem[]>(`/api/reports/matches?${p}`);
    },
    matchDetail: (id: string) => request<MatchDetail>(`/api/reports/matches/${id}`),
  },
};

export interface ConfigSummary {
  id: string;
  name: string;
  version: string;
  parent_id?: string;
  created_at: string;
}

export interface ConfigRow extends ConfigSummary {
  config: unknown;
}

export interface CreateConfigBody {
  name: string;
  version: string;
  config: unknown;
  parent_id?: string;
}

export interface StartSimulationBody {
  configId: string;
  matchCount: number;
  aiTiers: [number, number];
  seedStart: number;
  mode?: string;
  baseWeaponId?: string;
  baseArmorId?: string;
}

export interface SimulationRun {
  id: string;
  config_id: string;
  match_count: number;
  status: string;
  progress: number;
  started_at: string;
  completed_at?: string;
}

// Report types

export interface OverviewStats {
  totalMatches: number;
  p0WinRate: number | null;
  p1WinRate: number | null;
  avgDurationMs: number;
  mostPickedAffix: string | null;
}

export interface AffixStat {
  affixId: string;
  pickCount: number;
  winCount: number;
  winRate: number | null;
}

export interface MatchupData {
  archetypes: string[];
  matrix: number[][];
}

export interface RoundStat {
  round: number;
  matchCount: number;
  avgDurationTicks: number;
  avgTotalDamage: number;
}

export interface DistributionData {
  durationMs: number[];
  rounds: number[];
}

export interface ConfigComparisonResult {
  configId: string;
  totalMatches: number;
  p0WinRate: number | null;
  avgDurationMs: number;
}

export interface MatchListItem {
  id: string;
  seed: number;
  winner: number | null;
  rounds: number;
  duration_ms: number;
  p0_affixes: string[] | null;
  p1_affixes: string[] | null;
  run_id: string | null;
  config_id: string | null;
  created_at: string;
}

export interface MatchDetail extends MatchListItem {
  p0_loadout: unknown;
  p1_loadout: unknown;
  round_details: Array<{
    round: number;
    winner: number | null;
    duration_ticks: number;
    p0_damage_dealt: number;
    p1_damage_dealt: number;
  }>;
  combat_log: unknown | null;
}
