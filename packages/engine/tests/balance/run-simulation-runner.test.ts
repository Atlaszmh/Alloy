import { describe, it, expect } from 'vitest';
import { runRunSimulationV2, type RunSimulationConfigV2 } from '../../src/balance/simulation-runner.js';
import { loadAndValidateData } from '../../src/data/loader.js';
import { DataRegistry } from '../../src/data/registry.js';

describe('runRunSimulationV2', () => {
  const data = loadAndValidateData();
  const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance, data.recipes);

  it('drives a real run_async match through the full 10-round loop', () => {
    const config: RunSimulationConfigV2 = {
      runCount: 3,
      seed: 1000,
      aiTier: 5,
      opponentTier: 3,
      startingLives: 3,
      goalRound: 10,
      baseWeaponId: 'sword',
      baseArmorId: 'chainmail',
    };
    const result = runRunSimulationV2(config, registry);
    expect(result.runs).toHaveLength(3);
    for (const run of result.runs) {
      expect(run.roundsReached).toBeGreaterThan(0);
      expect(run.perRound.length).toBe(run.roundsReached);
      // Each per-round snapshot has a build shape
      for (const snap of run.perRound) {
        expect(snap.round).toBeGreaterThan(0);
        expect(snap.socketedGemCount).toBeGreaterThanOrEqual(0);
      }
    }
    expect(result.aggregateStats.runCount).toBe(3);
  });

  it('is deterministic — same seed produces identical reports', () => {
    const config: RunSimulationConfigV2 = {
      runCount: 2,
      seed: 555,
      aiTier: 4,
      opponentTier: 3,
      startingLives: 3,
      goalRound: 10,
      baseWeaponId: 'sword',
      baseArmorId: 'chainmail',
    };
    const a = runRunSimulationV2(config, registry);
    const b = runRunSimulationV2(config, registry);
    expect(a.runs[0].roundsReached).toBe(b.runs[0].roundsReached);
    expect(a.runs[0].totalFluxEarned).toBe(b.runs[0].totalFluxEarned);
  });
});
