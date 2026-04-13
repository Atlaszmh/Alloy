import { describe, it, expect } from 'vitest';
import { defaultConfig } from '../src/data/game-config.js';
import { DataRegistry } from '../src/data/registry.js';
import {
  runRunSimulation,
  type RunSimulationConfig,
} from '../src/balance/simulation-runner.js';
import type { AITier } from '../src/types/ai.js';

const config = defaultConfig();
const registry = new DataRegistry(
  config.affixes, config.combinations, config.synergies,
  config.baseItems, config.balance,
);

function makeRunConfig(overrides?: Partial<RunSimulationConfig>): RunSimulationConfig {
  return {
    runCount: 2,
    maxRounds: 5,       // Keep low -- each round is a full AI match
    startingLives: 2,
    goalRound: 4,
    seed: 42,
    aiTier: 1 as AITier,
    mode: 'quick',
    baseWeaponId: 'sword',
    baseArmorId: 'chainmail',
    ...overrides,
  };
}

describe('RunSimulation', () => {
  it('produces results with the right shape', () => {
    const cfg = makeRunConfig({ runCount: 2 });
    const result = runRunSimulation(cfg, registry);

    expect(result).toBeDefined();
    expect(result.runs).toHaveLength(2);
    expect(typeof result.averageRunLength).toBe('number');
    expect(typeof result.winRate).toBe('number');
    expect(typeof result.averageGemsPerRound).toBe('number');
    expect(typeof result.legendaryAchievementRate).toBe('number');

    // Each run report has the required fields
    for (const run of result.runs) {
      expect(typeof run.seed).toBe('number');
      expect(typeof run.roundsPlayed).toBe('number');
      expect(typeof run.won).toBe('boolean');
      expect(typeof run.livesRemaining).toBe('number');
      expect(Array.isArray(run.roundDetails)).toBe(true);
      expect(run.roundsPlayed).toBeGreaterThan(0);

      // Each round detail has required metrics
      for (const rd of run.roundDetails) {
        expect(typeof rd.gemsSocketed).toBe('number');
        expect(typeof rd.combineCount).toBe('number');
        expect(typeof rd.avgGemQuality).toBe('number');
        expect(rd.gemsSocketed).toBeGreaterThanOrEqual(0);
        expect(rd.combineCount).toBeGreaterThanOrEqual(0);
        expect(rd.avgGemQuality).toBeGreaterThanOrEqual(0);
      }
    }
  }, 60_000);

  it('averageRunLength is > 0', () => {
    const cfg = makeRunConfig({ runCount: 1 });
    const result = runRunSimulation(cfg, registry);
    expect(result.averageRunLength).toBeGreaterThan(0);
  }, 30_000);

  it('winRate is between 0 and 100', () => {
    const cfg = makeRunConfig({ runCount: 1 });
    const result = runRunSimulation(cfg, registry);
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(100);
  }, 30_000);

  it('deterministic: same seed produces same results', () => {
    const cfg = makeRunConfig({ runCount: 1, seed: 9999, maxRounds: 4, goalRound: 3 });
    const result1 = runRunSimulation(cfg, registry);
    const result2 = runRunSimulation(cfg, registry);

    expect(result1.runs.length).toBe(result2.runs.length);
    expect(result1.averageRunLength).toBe(result2.averageRunLength);
    expect(result1.winRate).toBe(result2.winRate);
    expect(result1.averageGemsPerRound).toBe(result2.averageGemsPerRound);
    expect(result1.legendaryAchievementRate).toBe(result2.legendaryAchievementRate);

    for (let i = 0; i < result1.runs.length; i++) {
      expect(result1.runs[i].seed).toBe(result2.runs[i].seed);
      expect(result1.runs[i].roundsPlayed).toBe(result2.runs[i].roundsPlayed);
      expect(result1.runs[i].won).toBe(result2.runs[i].won);
      expect(result1.runs[i].livesRemaining).toBe(result2.runs[i].livesRemaining);
    }
  }, 60_000);

  it('different seeds produce different results', () => {
    const result1 = runRunSimulation(makeRunConfig({ seed: 1000, runCount: 1 }), registry);
    const result2 = runRunSimulation(makeRunConfig({ seed: 2000, runCount: 1 }), registry);

    const seeds1 = result1.runs.map(r => r.seed);
    const seeds2 = result2.runs.map(r => r.seed);
    expect(seeds1).not.toEqual(seeds2);
  }, 60_000);
});
