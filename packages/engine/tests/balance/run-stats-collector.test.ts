import { describe, it, expect } from 'vitest';
import { computeRunAggregateStats, type RunReportV2 } from '../../src/balance/run-stats-collector.js';

describe('computeRunAggregateStats', () => {
  it('reports goal-reach rate, average rounds, death-round histogram', () => {
    const reports: RunReportV2[] = [
      { seed: 1, roundsReached: 10, goalReached: true, finalLives: 2, perRound: [], compoundFirstAppearance: new Map(), totalFluxEarned: 12, totalFluxSpent: 10 },
      { seed: 2, roundsReached: 6, goalReached: false, finalLives: 0, perRound: [], compoundFirstAppearance: new Map(), totalFluxEarned: 6, totalFluxSpent: 4 },
      { seed: 3, roundsReached: 10, goalReached: true, finalLives: 1, perRound: [], compoundFirstAppearance: new Map(), totalFluxEarned: 11, totalFluxSpent: 11 },
    ];
    const stats = computeRunAggregateStats(reports);
    expect(stats.runCount).toBe(3);
    expect(stats.goalReachRate).toBeCloseTo(2 / 3, 2);
    expect(stats.avgRoundsReached).toBeCloseTo(26 / 3, 2);
    expect(stats.deathRoundHistogram.get(6)).toBe(1);
    expect(stats.avgFluxEarned).toBeCloseTo(29 / 3, 2);
  });
});
