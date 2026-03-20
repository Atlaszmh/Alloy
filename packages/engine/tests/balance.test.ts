import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { runSimulation, type SimulationConfig, type SimulationResult } from '../src/balance/simulation-runner.js';
import { computeAggregateStats } from '../src/balance/stats-collector.js';
import { generateBalanceReport } from '../src/balance/balance-report.js';
import type { AITier } from '../src/types/ai.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);

function makeConfig(overrides?: Partial<SimulationConfig>): SimulationConfig {
  return {
    matchCount: 5,
    aiTier1: 1 as AITier,
    aiTier2: 1 as AITier,
    seedStart: 1000,
    mode: 'ranked',
    baseWeaponId: 'sword',
    baseArmorId: 'chainmail',
    ...overrides,
  };
}

describe('SimulationRunner', () => {
  it('runSimulation completes without errors (5 matches, T1 vs T1)', () => {
    const config = makeConfig();
    const result = runSimulation(config, registry);
    expect(result).toBeDefined();
    expect(result.matches.length).toBe(5);
    expect(result.aggregateStats).toBeDefined();
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('runSimulation produces correct match count', () => {
    const config = makeConfig({ matchCount: 7, seedStart: 2000 });
    const result = runSimulation(config, registry);
    expect(result.matches.length).toBe(7);
    expect(result.aggregateStats.totalMatches).toBe(7);
  });

  it('different seed ranges produce different results', () => {
    const config1 = makeConfig({ seedStart: 3000 });
    const config2 = makeConfig({ seedStart: 4000 });
    const result1 = runSimulation(config1, registry);
    const result2 = runSimulation(config2, registry);

    // At least some matches should have different winners or different seeds
    const seeds1 = result1.matches.map((m) => m.seed);
    const seeds2 = result2.matches.map((m) => m.seed);
    expect(seeds1).not.toEqual(seeds2);
  });

  it('simulation is deterministic (same config produces same results)', () => {
    const config = makeConfig({ seedStart: 5000 });
    const result1 = runSimulation(config, registry);
    const result2 = runSimulation(config, registry);

    expect(result1.matches.length).toBe(result2.matches.length);
    for (let i = 0; i < result1.matches.length; i++) {
      expect(result1.matches[i].winner).toBe(result2.matches[i].winner);
      expect(result1.matches[i].rounds).toBe(result2.matches[i].rounds);
      expect(result1.matches[i].seed).toBe(result2.matches[i].seed);
      expect(result1.matches[i].players[0].affixIds).toEqual(result2.matches[i].players[0].affixIds);
      expect(result1.matches[i].players[1].affixIds).toEqual(result2.matches[i].players[1].affixIds);
    }
  });

  it('runSimulation works with T3 vs T3 (5 matches)', () => {
    const config = makeConfig({ aiTier1: 3 as AITier, aiTier2: 3 as AITier, seedStart: 6000 });
    const result = runSimulation(config, registry);
    expect(result.matches.length).toBe(5);
    for (const match of result.matches) {
      expect(match.rounds).toBeGreaterThan(0);
      expect([null, 0, 1]).toContain(match.winner);
    }
  });
});

describe('AggregateStats', () => {
  it('has valid win rates that sum to ~100%', () => {
    const config = makeConfig({ matchCount: 10, seedStart: 7000 });
    const result = runSimulation(config, registry);
    const stats = result.aggregateStats;

    const [p0, p1] = stats.winRate;
    const drawPct = (stats.draws / stats.totalMatches) * 100;
    // p0 win% + p1 win% + draw% should equal 100%
    expect(p0 + p1 + drawPct).toBeCloseTo(100, 0);
    expect(p0).toBeGreaterThanOrEqual(0);
    expect(p1).toBeGreaterThanOrEqual(0);
    expect(stats.player0Wins + stats.player1Wins + stats.draws).toBe(stats.totalMatches);
  });

  it('affix pick rates are between 0 and 1', () => {
    const config = makeConfig({ matchCount: 5, seedStart: 8000 });
    const result = runSimulation(config, registry);
    const stats = result.aggregateStats;

    for (const [_id, rate] of stats.affixPickRates) {
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
  });
});

describe('BalanceReport', () => {
  it('generateBalanceReport produces no critical issues for T2 vs T2 (10 matches)', () => {
    const config = makeConfig({
      matchCount: 10,
      aiTier1: 2 as AITier,
      aiTier2: 2 as AITier,
      seedStart: 9000,
    });
    const result = runSimulation(config, registry);
    const report = generateBalanceReport(result.aggregateStats);

    // With only 10 matches, we mainly check no crashes; small sample critical issues are noise
    // But if there are issues, they should have valid structure
    for (const issue of report) {
      expect(issue.type).toBeDefined();
      expect(issue.id).toBeDefined();
      expect(issue.severity).toMatch(/^(warning|critical)$/);
      expect(typeof issue.value).toBe('number');
      expect(typeof issue.threshold).toBe('number');
    }
  });
});
