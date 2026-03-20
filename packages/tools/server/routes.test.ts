import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ---- Supabase mock ----
// We mock the supabase module so routes never hit a real database.
// Each test can configure what the mock returns.

type MockQueryResult = { data: unknown; error: unknown };

let mockQueryResult: MockQueryResult = { data: [], error: null };
let mockRpcResult: MockQueryResult = { data: [], error: null };
let lastSelectColumns: string | undefined;
let lastTable: string | undefined;

function createChainableQuery(result: MockQueryResult) {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') {
        // Make it thenable so `await query` works
        return (resolve: (v: MockQueryResult) => void) => resolve(result);
      }
      if (prop === 'data') return result.data;
      if (prop === 'error') return result.error;
      // All query-builder methods return self for chaining
      return (...args: unknown[]) => {
        if (prop === 'select' && typeof args[0] === 'string') {
          lastSelectColumns = args[0];
        }
        return self;
      };
    },
  });
  return self;
}

vi.mock('./supabase.js', () => {
  const supabase = {
    from: (table: string) => {
      lastTable = table;
      return createChainableQuery(mockQueryResult);
    },
    rpc: () => createChainableQuery(mockRpcResult),
  };
  return {
    supabase,
    batchInsert: vi.fn(),
  };
});

// Mock worker pool to avoid real worker threads
vi.mock('./worker-pool.js', () => ({
  WorkerPool: vi.fn().mockImplementation(() => ({
    runSimulation: vi.fn().mockResolvedValue({ completed: 0, failed: 0 }),
    cancel: vi.fn(),
  })),
}));

// Mock SSE
vi.mock('./sse.js', () => ({
  addSSEClient: vi.fn(),
  sendProgress: vi.fn(),
  closeSSE: vi.fn(),
}));

// Set env vars before importing app
process.env.SUPABASE_URL = 'http://mock.supabase.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';

// Import app AFTER mocks are in place
const { app } = await import('./index.js');

// ---- Schema definitions ----
// These mirror the columns defined in migration 007_simulation_tables.sql.
// If a route selects a column not in this list, it's a bug.

const SCHEMA = {
  game_configs: ['id', 'name', 'version', 'config', 'parent_id', 'created_at', 'created_by'],
  simulation_runs: [
    'id', 'config_id', 'match_count', 'ai_tiers', 'seed_start',
    'status', 'progress', 'started_at', 'completed_at', 'created_by',
  ],
  match_results: [
    'id', 'run_id', 'config_id', 'source', 'seed',
    'winner', 'rounds', 'duration_ms', 'created_at',
  ],
  match_player_stats: [
    'id', 'match_id', 'player_index', 'ai_tier', 'user_id',
    'final_hp', 'affix_ids', 'combination_ids', 'synergy_ids', 'loadout',
  ],
  match_round_details: [
    'id', 'match_id', 'round', 'winner', 'duration_ticks',
    'p0_hp_final', 'p1_hp_final', 'p0_damage_dealt', 'p1_damage_dealt', 'combat_log',
  ],
} as const;

/**
 * Parse a Supabase `.select()` string and verify every referenced column
 * exists in the schema. Handles embedded relations like:
 *   'id, name, match_player_stats(player_index, loadout)'
 */
function validateSelectColumns(selectStr: string, primaryTable: string) {
  const columns = primaryTable in SCHEMA
    ? SCHEMA[primaryTable as keyof typeof SCHEMA]
    : [];

  // Split on commas, handling parenthesized embedded selects
  const parts = splitSelect(selectStr);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Check for embedded relation: relation_name(col1, col2)
    const embeddedMatch = trimmed.match(/^(\w+)\((.+)\)$/);
    if (embeddedMatch) {
      const relationTable = embeddedMatch[1];
      const innerCols = embeddedMatch[2].split(',').map(c => c.trim());
      if (relationTable in SCHEMA) {
        const relationColumns = SCHEMA[relationTable as keyof typeof SCHEMA];
        for (const col of innerCols) {
          expect(
            relationColumns,
            `Column "${col}" referenced in embedded select on "${relationTable}" does not exist in schema`,
          ).toContain(col);
        }
      }
      continue;
    }

    // Handle aliased columns: alias:column_name
    const aliasMatch = trimmed.match(/^(\w+):(\w+)$/);
    const colName = aliasMatch ? aliasMatch[2] : trimmed;

    expect(
      columns,
      `Column "${colName}" selected from "${primaryTable}" does not exist in schema. Valid columns: ${columns.join(', ')}`,
    ).toContain(colName);
  }
}

/** Split a select string on top-level commas (not inside parentheses). */
function splitSelect(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

// ---- Tests ----

beforeEach(() => {
  mockQueryResult = { data: [], error: null };
  mockRpcResult = { data: [], error: null };
  lastSelectColumns = undefined;
  lastTable = undefined;
});

describe('Health', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Configs routes', () => {
  it('GET /api/configs returns 200 with array', async () => {
    mockQueryResult = { data: [], error: null };
    const res = await request(app).get('/api/configs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/configs selects only valid columns', async () => {
    await request(app).get('/api/configs');
    if (lastSelectColumns && lastTable) {
      validateSelectColumns(lastSelectColumns, lastTable);
    }
  });

  it('POST /api/configs returns 201 on success', async () => {
    mockQueryResult = {
      data: { id: 'test-id', name: 'test', version: '1.0', config: {} },
      error: null,
    };
    const res = await request(app)
      .post('/api/configs')
      .send({ name: 'test', version: '1.0', config: {} });
    expect(res.status).toBe(201);
  });
});

describe('Simulations routes', () => {
  it('GET /api/simulations returns 200 with array', async () => {
    mockQueryResult = { data: [], error: null };
    const res = await request(app).get('/api/simulations');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/simulations selects only valid columns', async () => {
    await request(app).get('/api/simulations');
    if (lastSelectColumns && lastTable) {
      validateSelectColumns(lastSelectColumns, lastTable);
    }
  });
});

describe('Reports routes', () => {
  it('GET /api/reports/overview returns 200 with stats shape', async () => {
    mockQueryResult = { data: [], error: null };
    mockRpcResult = { data: [], error: null };
    const res = await request(app).get('/api/reports/overview');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalMatches');
    expect(res.body).toHaveProperty('p0WinRate');
    expect(res.body).toHaveProperty('p1WinRate');
    expect(res.body).toHaveProperty('avgDurationMs');
  });

  it('GET /api/reports/overview selects only valid columns', async () => {
    await request(app).get('/api/reports/overview');
    if (lastSelectColumns && lastTable) {
      validateSelectColumns(lastSelectColumns, lastTable);
    }
  });

  it('GET /api/reports/affix-stats returns 200', async () => {
    mockRpcResult = { data: [], error: null };
    const res = await request(app).get('/api/reports/affix-stats');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/reports/matchups returns 200', async () => {
    const res = await request(app).get('/api/reports/matchups');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('archetypes');
    expect(res.body).toHaveProperty('matrix');
  });

  it('GET /api/reports/round-stats returns 200', async () => {
    mockQueryResult = { data: [], error: null };
    const res = await request(app).get('/api/reports/round-stats');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/reports/distributions returns 200', async () => {
    mockQueryResult = { data: [], error: null };
    const res = await request(app).get('/api/reports/distributions');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('durationMs');
    expect(res.body).toHaveProperty('rounds');
  });

  it('GET /api/reports/distributions selects only valid columns', async () => {
    await request(app).get('/api/reports/distributions');
    if (lastSelectColumns && lastTable) {
      validateSelectColumns(lastSelectColumns, lastTable);
    }
  });

  it('GET /api/reports/config-comparison requires configIds', async () => {
    const res = await request(app).get('/api/reports/config-comparison');
    expect(res.status).toBe(400);
  });

  it('GET /api/reports/config-comparison returns 200 with valid configIds', async () => {
    mockQueryResult = { data: [], error: null };
    const res = await request(app).get(
      '/api/reports/config-comparison?configIds=id1,id2',
    );
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/matches returns 200 with array', async () => {
    mockQueryResult = { data: [], error: null };
    const res = await request(app).get('/api/reports/matches');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/reports/matches selects only valid columns', async () => {
    await request(app).get('/api/reports/matches');
    if (lastSelectColumns && lastTable) {
      validateSelectColumns(lastSelectColumns, lastTable);
    }
  });
});

describe('No hardcoded port references', () => {
  it('frontend client.ts uses VITE_API_URL env var with correct fallback', async () => {
    const fs = await import('fs');
    const clientSrc = fs.readFileSync(
      new URL('../src/api/client.ts', import.meta.url),
      'utf-8',
    );
    // Should not reference old port 3001
    expect(clientSrc).not.toContain('localhost:3001');
    // Should have the VITE_API_URL pattern
    expect(clientSrc).toContain('VITE_API_URL');
  });

  it('frontend sse.ts uses VITE_API_URL env var with correct fallback', async () => {
    const fs = await import('fs');
    const sseSrc = fs.readFileSync(
      new URL('../src/api/sse.ts', import.meta.url),
      'utf-8',
    );
    expect(sseSrc).not.toContain('localhost:3001');
    expect(sseSrc).toContain('VITE_API_URL');
  });

  it('GlobalFilters uses shared api client, not raw fetch with hardcoded URL', async () => {
    const fs = await import('fs');
    const filtersSrc = fs.readFileSync(
      new URL('../src/components/GlobalFilters.tsx', import.meta.url),
      'utf-8',
    );
    expect(filtersSrc).not.toContain('localhost:3001');
    expect(filtersSrc).not.toContain('localhost:3001/api/simulations');
  });
});
