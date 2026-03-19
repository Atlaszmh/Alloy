// packages/tools/server/integration.test.ts
//
// End-to-end integration test for the simulation server.
//
// Prerequisites:
//   1. Supabase running locally: `cd packages/supabase && supabase start`
//   2. Migration 007 applied: `supabase db reset`
//   3. Server running: `cd packages/tools && pnpm server`
//   4. .env configured with local Supabase URL and service role key
//
// Run with:
//   cd packages/tools && TEST_API_URL=http://localhost:3001 pnpm vitest run server/integration.test.ts

import { describe, it, expect } from 'vitest';
import { defaultConfig } from '@alloy/engine';

describe('End-to-end simulation flow', () => {
  const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3001';

  it('creates a config, runs a small simulation, and queries results', async () => {
    // 1. Create a config
    const config = defaultConfig();
    const configRes = await fetch(`${BASE_URL}/api/configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'integration-test', version: '1.0.0', config }),
    });
    expect(configRes.status).toBe(201);
    const configData = await configRes.json();
    expect(configData.id).toBeDefined();
    const configId = configData.id;

    // 2. Start a small simulation (10 matches)
    const simRes = await fetch(`${BASE_URL}/api/simulations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configId,
        matchCount: 10,
        aiTiers: [3, 3],
        seedStart: 0,
      }),
    });
    expect(simRes.status).toBe(201);
    const simData = await simRes.json();
    expect(simData.id).toBeDefined();
    const runId = simData.id;

    // 3. Poll until complete (max 60 seconds)
    let status = 'running';
    for (let i = 0; i < 30 && status === 'running'; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(`${BASE_URL}/api/simulations/${runId}`);
      const run = await pollRes.json();
      status = run.status;
    }
    expect(status).toBe('complete');

    // 4. Query overview
    const overviewRes = await fetch(`${BASE_URL}/api/reports/overview?runId=${runId}`);
    expect(overviewRes.status).toBe(200);
    const overview = await overviewRes.json();
    expect(overview.totalMatches).toBe(10);
    expect(overview.p0WinRate).toBeGreaterThanOrEqual(0);
    expect(overview.p0WinRate).toBeLessThanOrEqual(1);

    // 5. Query affix stats
    const affixRes = await fetch(`${BASE_URL}/api/reports/affix-stats?runId=${runId}`);
    expect(affixRes.status).toBe(200);
    const affixStats = await affixRes.json();
    expect(Array.isArray(affixStats)).toBe(true);

    // 6. Query round stats
    const roundRes = await fetch(`${BASE_URL}/api/reports/round-stats?runId=${runId}`);
    expect(roundRes.status).toBe(200);
    const roundStats = await roundRes.json();
    expect(Array.isArray(roundStats)).toBe(true);

    // 7. Verify simulation status shows complete
    const finalRes = await fetch(`${BASE_URL}/api/simulations/${runId}`);
    const finalRun = await finalRes.json();
    expect(finalRun.status).toBe('complete');
    expect(finalRun.progress).toBe(1);
  }, 120_000); // 2 minute timeout

  it('health check works', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  it('returns 400 for simulation with invalid config', async () => {
    const res = await fetch(`${BASE_URL}/api/simulations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configId: '00000000-0000-0000-0000-000000000000',
        matchCount: 1,
        aiTiers: [1, 1],
        seedStart: 0,
      }),
    });
    expect(res.status).toBe(400);
  });
});
