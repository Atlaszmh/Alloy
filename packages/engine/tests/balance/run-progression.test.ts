import { describe, it, expect } from 'vitest';
import { runRunSimulationV2 } from '../../src/balance/simulation-runner.js';
import { loadAndValidateData } from '../../src/data/loader.js';
import { DataRegistry } from '../../src/data/registry.js';

describe('run-mode progression', () => {
  const data = loadAndValidateData();
  const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance, data.recipes);

  it('socketed gem count grows monotonically across rounds within a single run', () => {
    const result = runRunSimulationV2({
      runCount: 5,
      seed: 12345,
      aiTier: 5,
      opponentTier: 3,
      startingLives: 3,
      goalRound: 10,
      baseWeaponId: 'sword',
      baseArmorId: 'chainmail',
    }, registry);

    // Find a run that reached at least round 5 — assert sockets only grow
    const longRun = result.runs.find(r => r.roundsReached >= 5);
    expect(longRun, 'expected at least one run to reach round 5').toBeDefined();
    if (!longRun) return;
    let prev = 0;
    for (const snap of longRun.perRound) {
      expect(snap.socketedGemCount).toBeGreaterThanOrEqual(prev);
      prev = snap.socketedGemCount;
    }
  });
});
