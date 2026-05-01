import { describe, it, expect } from 'vitest';
import { computeRunAggregateStats, type RunReportV2 } from '../../src/balance/run-stats-collector.js';

const zeroMetaActionCounts = {
  boostCombine: 0,
  rerollPool: 0,
  guaranteeRarity: 0,
  transplantChooseAffix: 0,
};

describe('computeRunAggregateStats', () => {
  it('reports goal-reach rate, average rounds, death-round histogram', () => {
    const reports: RunReportV2[] = [
      { seed: 1, roundsReached: 10, goalReached: true, finalLives: 2, perRound: [], compoundFirstAppearance: new Map(), totalFluxEarned: 12, totalFluxSpent: 10, metaActionCounts: zeroMetaActionCounts },
      { seed: 2, roundsReached: 6, goalReached: false, finalLives: 0, perRound: [], compoundFirstAppearance: new Map(), totalFluxEarned: 6, totalFluxSpent: 4, metaActionCounts: zeroMetaActionCounts },
      { seed: 3, roundsReached: 10, goalReached: true, finalLives: 1, perRound: [], compoundFirstAppearance: new Map(), totalFluxEarned: 11, totalFluxSpent: 11, metaActionCounts: zeroMetaActionCounts },
    ];
    const stats = computeRunAggregateStats(reports);
    expect(stats.runCount).toBe(3);
    expect(stats.goalReachRate).toBeCloseTo(2 / 3, 2);
    expect(stats.avgRoundsReached).toBeCloseTo(26 / 3, 2);
    expect(stats.deathRoundHistogram.get(6)).toBe(1);
    expect(stats.avgFluxEarned).toBeCloseTo(29 / 3, 2);
  });

  it('averages metaActionCounts.boostCombine across runs', () => {
    const reports: RunReportV2[] = [
      { seed: 1, roundsReached: 10, goalReached: true, finalLives: 2, perRound: [], compoundFirstAppearance: new Map(), totalFluxEarned: 12, totalFluxSpent: 6, metaActionCounts: { boostCombine: 2, rerollPool: 0, guaranteeRarity: 0, transplantChooseAffix: 0 } },
      { seed: 2, roundsReached: 10, goalReached: true, finalLives: 3, perRound: [], compoundFirstAppearance: new Map(), totalFluxEarned: 10, totalFluxSpent: 0, metaActionCounts: { boostCombine: 0, rerollPool: 0, guaranteeRarity: 0, transplantChooseAffix: 0 } },
    ];
    const stats = computeRunAggregateStats(reports);
    expect(stats.avgMetaActions.boostCombine).toBeCloseTo(1.0, 5);
    expect(stats.avgMetaActions.rerollPool).toBe(0);
    expect(stats.avgMetaActions.guaranteeRarity).toBe(0);
    expect(stats.avgMetaActions.transplantChooseAffix).toBe(0);
  });
});
