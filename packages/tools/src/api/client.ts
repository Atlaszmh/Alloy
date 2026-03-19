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
