/**
 * Run-mode simulation aggregator. Mirrors stats-collector.ts but for the
 * shipped `run_async` 10-round loop instead of single-match best-of-3.
 *
 * Emits "run shape" metrics: how far runs get, when builds peak, how often
 * each compound emerges across a run.
 */

export interface PerRoundSnapshot {
  round: number;                     // 1..N
  won: boolean;                      // did player 0 win this round
  livesAfter: number;
  fluxEarnedThisRound: number;
  fluxSpentThisRound: number;
  // Build snapshot at end of forge phase, before duel
  socketedGemCount: number;
  compoundCount: number;             // gems with sourceRecipe set (binary or ternary)
  capstoneCount: number;             // gems sourced from a signature3 recipe
  totalGemTier: number;              // sum of tier across socketed gems
  activeSynergyCount: number;
}

export interface RunReportV2 {
  seed: number;
  roundsReached: number;             // how many rounds were actually played
  goalReached: boolean;              // round >= goalRound at end
  finalLives: number;
  perRound: PerRoundSnapshot[];
  /** Map<compoundAffixId, round-of-first-appearance>. */
  compoundFirstAppearance: Map<string, number>;
  totalFluxEarned: number;
  totalFluxSpent: number;
}

export interface RunAggregateStats {
  runCount: number;
  goalReachRate: number;             // 0..1
  avgRoundsReached: number;
  /** Map<round, number-of-runs-that-died-at-that-round> (excludes runs that reached goal). */
  deathRoundHistogram: Map<number, number>;
  /** Indexed by round number (1..N). undefined if no run reached that round. */
  buildShapeByRound: Map<number, BuildShape>;
  /** Map<compoundAffixId, { firstSeenAvgRound, runsThatSawIt }>. */
  compoundEmergence: Map<string, { firstSeenAvgRound: number; runsThatSawIt: number }>;
  avgFluxEarned: number;
  avgFluxSpent: number;
  avgFinalLives: number;
}

export interface BuildShape {
  runsAtThisRound: number;
  avgSocketedGems: number;
  avgCompoundCount: number;
  avgCapstoneCount: number;
  avgTotalGemTier: number;
  avgActiveSynergies: number;
}

export function computeRunAggregateStats(reports: RunReportV2[]): RunAggregateStats {
  const runCount = reports.length;
  if (runCount === 0) {
    return emptyStats();
  }

  let totalRoundsReached = 0;
  let goalReachedCount = 0;
  let totalFluxEarned = 0;
  let totalFluxSpent = 0;
  let totalFinalLives = 0;
  const deathRoundHistogram = new Map<number, number>();
  // Map<round, accumulator>
  const buildAccum = new Map<number, BuildAccumulator>();
  const compoundFirstSeen = new Map<string, { totalRound: number; runs: number }>();

  for (const r of reports) {
    totalRoundsReached += r.roundsReached;
    totalFluxEarned += r.totalFluxEarned;
    totalFluxSpent += r.totalFluxSpent;
    totalFinalLives += r.finalLives;
    if (r.goalReached) {
      goalReachedCount++;
    } else {
      deathRoundHistogram.set(r.roundsReached, (deathRoundHistogram.get(r.roundsReached) ?? 0) + 1);
    }
    for (const snap of r.perRound) {
      const acc = buildAccum.get(snap.round) ?? newAccumulator();
      acc.runsAtThisRound++;
      acc.socketedGems += snap.socketedGemCount;
      acc.compoundCount += snap.compoundCount;
      acc.capstoneCount += snap.capstoneCount;
      acc.totalGemTier += snap.totalGemTier;
      acc.activeSynergies += snap.activeSynergyCount;
      buildAccum.set(snap.round, acc);
    }
    for (const [compoundId, round] of r.compoundFirstAppearance) {
      const entry = compoundFirstSeen.get(compoundId) ?? { totalRound: 0, runs: 0 };
      entry.totalRound += round;
      entry.runs++;
      compoundFirstSeen.set(compoundId, entry);
    }
  }

  const buildShapeByRound = new Map<number, BuildShape>();
  for (const [round, acc] of buildAccum) {
    buildShapeByRound.set(round, {
      runsAtThisRound: acc.runsAtThisRound,
      avgSocketedGems: acc.socketedGems / acc.runsAtThisRound,
      avgCompoundCount: acc.compoundCount / acc.runsAtThisRound,
      avgCapstoneCount: acc.capstoneCount / acc.runsAtThisRound,
      avgTotalGemTier: acc.totalGemTier / acc.runsAtThisRound,
      avgActiveSynergies: acc.activeSynergies / acc.runsAtThisRound,
    });
  }

  const compoundEmergence = new Map<string, { firstSeenAvgRound: number; runsThatSawIt: number }>();
  for (const [compoundId, entry] of compoundFirstSeen) {
    compoundEmergence.set(compoundId, {
      firstSeenAvgRound: entry.totalRound / entry.runs,
      runsThatSawIt: entry.runs,
    });
  }

  return {
    runCount,
    goalReachRate: goalReachedCount / runCount,
    avgRoundsReached: totalRoundsReached / runCount,
    deathRoundHistogram,
    buildShapeByRound,
    compoundEmergence,
    avgFluxEarned: totalFluxEarned / runCount,
    avgFluxSpent: totalFluxSpent / runCount,
    avgFinalLives: totalFinalLives / runCount,
  };
}

interface BuildAccumulator {
  runsAtThisRound: number;
  socketedGems: number;
  compoundCount: number;
  capstoneCount: number;
  totalGemTier: number;
  activeSynergies: number;
}

function newAccumulator(): BuildAccumulator {
  return {
    runsAtThisRound: 0,
    socketedGems: 0,
    compoundCount: 0,
    capstoneCount: 0,
    totalGemTier: 0,
    activeSynergies: 0,
  };
}

function emptyStats(): RunAggregateStats {
  return {
    runCount: 0,
    goalReachRate: 0,
    avgRoundsReached: 0,
    deathRoundHistogram: new Map(),
    buildShapeByRound: new Map(),
    compoundEmergence: new Map(),
    avgFluxEarned: 0,
    avgFluxSpent: 0,
    avgFinalLives: 0,
  };
}
