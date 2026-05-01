/**
 * One-shot balance simulation script. Runs N AI-vs-AI matches, computes
 * aggregate stats, and pretty-prints high-level balance findings — including
 * the new compound-aware metrics (proc rates, attributed damage, compound-
 * heavy build slice).
 *
 * Usage: pnpm --filter @alloy/tools exec tsx scripts/run-balance-simulation.ts
 *
 * Adjust the CONFIG block below to vary tier, mode, count, etc.
 */

import {
  DataRegistry,
  loadAndValidateData,
  runSimulation,
  runRunSimulationV2,
  type SimulationConfig,
  type RunSimulationConfigV2,
} from '@alloy/engine';

// -----------------------------------------------------------------------------
// CONFIG — tweak these to explore different slices.
// -----------------------------------------------------------------------------

const MATCH_BATCHES: { label: string; config: SimulationConfig }[] = [
  {
    label: 'Tier 5 vs Tier 5 (ranked, 100 matches)',
    config: {
      matchCount: 100,
      aiTier1: 5,
      aiTier2: 5,
      seedStart: 1000,
      mode: 'ranked',
      baseWeaponId: 'sword',
      baseArmorId: 'chainmail',
    },
  },
  {
    label: 'Tier 3 vs Tier 5 (asymmetry check, 50 matches)',
    config: {
      matchCount: 50,
      aiTier1: 3,
      aiTier2: 5,
      seedStart: 2000,
      mode: 'ranked',
      baseWeaponId: 'sword',
      baseArmorId: 'chainmail',
    },
  },
  {
    label: 'Tier 5 vs Tier 5 (quick mode, 100 matches)',
    config: {
      matchCount: 100,
      aiTier1: 5,
      aiTier2: 5,
      seedStart: 3000,
      mode: 'quick',
      baseWeaponId: 'sword',
      baseArmorId: 'chainmail',
    },
  },
];

const RUN_BATCHES: { label: string; config: RunSimulationConfigV2 }[] = [
  {
    label: 'Tier 5 player vs Tier 3 opponent (100 runs, 10-round goal)',
    config: {
      runCount: 100,
      seed: 5000,
      aiTier: 5,
      opponentTier: 3,
      startingLives: 3,
      goalRound: 10,
      baseWeaponId: 'sword',
      baseArmorId: 'chainmail',
    },
  },
  {
    label: 'Tier 3 player vs Tier 3 opponent (100 runs, 10-round goal)',
    config: {
      runCount: 100,
      seed: 6000,
      aiTier: 3,
      opponentTier: 3,
      startingLives: 3,
      goalRound: 10,
      baseWeaponId: 'sword',
      baseArmorId: 'chainmail',
    },
  },
  {
    label: 'Tier 1 player vs Tier 1 opponent (100 runs, 10-round goal)',
    config: {
      runCount: 100,
      seed: 7000,
      aiTier: 1,
      opponentTier: 1,
      startingLives: 3,
      goalRound: 10,
      baseWeaponId: 'sword',
      baseArmorId: 'chainmail',
    },
  },
];

// -----------------------------------------------------------------------------

function buildRegistry(): DataRegistry {
  const data = loadAndValidateData();
  return new DataRegistry(
    data.affixes,
    data.combinations,
    data.synergies,
    data.baseItems,
    data.balance,
    data.recipes,
  );
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function printSection(title: string): void {
  console.log('');
  console.log('─'.repeat(72));
  console.log(title);
  console.log('─'.repeat(72));
}

function printBatch(label: string, config: SimulationConfig, registry: DataRegistry): void {
  printSection(label);
  console.log(`  matchCount=${config.matchCount}  tiers=${config.aiTier1}v${config.aiTier2}  mode=${config.mode}  seedStart=${config.seedStart}`);

  const t0 = Date.now();
  const result = runSimulation(config, registry);
  const elapsed = Date.now() - t0;

  const stats = result.aggregateStats;
  console.log('');
  console.log(`  Duration: ${elapsed}ms (${(elapsed / config.matchCount).toFixed(1)}ms/match)`);
  console.log(`  Outcomes: P0=${stats.player0Wins}  P1=${stats.player1Wins}  draws=${stats.draws}`);
  console.log(`  Win rate: P0=${stats.winRate[0].toFixed(1)}%  P1=${stats.winRate[1].toFixed(1)}%`);
  console.log(`  Avg match length: ${stats.avgMatchDuration.toFixed(2)} rounds`);
  console.log(`  Avg duel duration: ${stats.avgDuelDuration.toFixed(2)}s`);
  console.log(`  Avg generic upgrades / player: ${stats.avgGenericUpgradesPerPlayer.toFixed(2)}`);

  // Compound-heavy slice
  console.log('');
  console.log('  Compound-heavy builds (≥2 socketed compounds):');
  if (stats.compoundHeavyMatchCount === 0) {
    console.log('    (none — sim AI did not build compound-heavy this batch)');
  } else {
    console.log(`    matches: ${stats.compoundHeavyMatchCount}`);
    console.log(`    win rate: ${stats.compoundHeavyWinRate != null ? pct(stats.compoundHeavyWinRate) : 'n/a'}`);
  }

  // Compound usage (built into a build at all)
  if (stats.combinationUsageRates.size === 0) {
    console.log('');
    console.log('  Combinations used: NONE — AI did not build any compounds.');
  } else {
    console.log('');
    console.log('  Compound usage rates (% of player-instances with compound socketed):');
    const usageRows = [...stats.combinationUsageRates.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    for (const [id, usage] of usageRows) {
      const winRate = stats.combinationWinRates.get(id);
      const winLabel = winRate != null ? pct(winRate) : 'n/a';
      console.log(`    ${id.padEnd(28)}  usage=${pct(usage).padStart(7)}   win-when-used=${winLabel}`);
    }
  }

  // Per-compound runtime metrics — proc counts + attributed damage
  if (stats.compoundRuntime.size === 0) {
    console.log('');
    console.log('  Compound runtime: NO compound triggers fired this batch.');
  } else {
    console.log('');
    console.log('  Compound runtime metrics (combat-log derived):');
    const runtimeRows = [...stats.compoundRuntime.entries()].sort(
      (a, b) => b[1].totalProcs - a[1].totalProcs,
    );
    for (const [id, m] of runtimeRows) {
      const dmgPerProc = m.totalProcs > 0 ? (m.attributedDotDamage / m.totalProcs).toFixed(1) : '—';
      console.log(
        `    ${id.padEnd(28)}  procs=${String(m.totalProcs).padStart(5)}   matches-with-proc=${String(m.matchesWithProc).padStart(4)}   total-dot-dmg=${m.attributedDotDamage.toFixed(0).padStart(7)}   avg-dmg/proc=${dmgPerProc}`,
      );
    }
  }

  // Top 10 affixes by usage
  console.log('');
  console.log('  Top affixes by pick rate (top 10):');
  const affixRows = [...stats.affixPickRates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [id, rate] of affixRows) {
    const winRate = stats.affixWinRates.get(id);
    const winLabel = winRate != null ? pct(winRate) : 'n/a';
    console.log(`    ${id.padEnd(28)}  pick=${pct(rate).padStart(7)}   win-when-picked=${winLabel}`);
  }

  // Active synergies
  if (stats.synergyActivationRates.size > 0) {
    console.log('');
    console.log('  Synergies activated (top 10):');
    const synergyRows = [...stats.synergyActivationRates.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    for (const [id, rate] of synergyRows) {
      const winRate = stats.synergyWinRates.get(id);
      const winLabel = winRate != null ? pct(winRate) : 'n/a';
      console.log(`    ${id.padEnd(28)}  active=${pct(rate).padStart(7)}   win-when-active=${winLabel}`);
    }
  }
}

function printRunBatch(label: string, config: RunSimulationConfigV2, registry: DataRegistry): void {
  printSection(label);
  console.log(`  runCount=${config.runCount}  player=T${config.aiTier}  opponent=T${config.opponentTier}  goal=round ${config.goalRound}  lives=${config.startingLives}`);

  const t0 = Date.now();
  const result = runRunSimulationV2(config, registry);
  const elapsed = Date.now() - t0;

  const s = result.aggregateStats;
  console.log('');
  console.log(`  Duration: ${elapsed}ms (${(elapsed / config.runCount).toFixed(1)}ms/run)`);
  console.log(`  Goal-reach rate: ${pct(s.goalReachRate)}`);
  console.log(`  Avg rounds reached: ${s.avgRoundsReached.toFixed(2)}`);
  console.log(`  Avg final lives: ${s.avgFinalLives.toFixed(2)}`);
  console.log(`  Avg flux earned/spent: ${s.avgFluxEarned.toFixed(1)} / ${s.avgFluxSpent.toFixed(1)}`);

  // Death-round histogram
  if (s.deathRoundHistogram.size > 0) {
    console.log('');
    console.log('  Death round histogram (runs that did not reach goal):');
    const rows = [...s.deathRoundHistogram.entries()].sort((a, b) => a[0] - b[0]);
    for (const [round, count] of rows) {
      console.log(`    round ${round.toString().padStart(2)}: ${count} runs`);
    }
  }

  // Build shape per round
  if (s.buildShapeByRound.size > 0) {
    console.log('');
    console.log('  Build shape by round (avg across runs that reached the round):');
    console.log('    round  runs  sockets  compounds  capstones  totalTier  synergies');
    const rows = [...s.buildShapeByRound.entries()].sort((a, b) => a[0] - b[0]);
    for (const [round, shape] of rows) {
      console.log(
        `    ${round.toString().padStart(5)}  ${shape.runsAtThisRound.toString().padStart(4)}  ` +
        `${shape.avgSocketedGems.toFixed(1).padStart(7)}  ${shape.avgCompoundCount.toFixed(1).padStart(9)}  ` +
        `${shape.avgCapstoneCount.toFixed(1).padStart(9)}  ${shape.avgTotalGemTier.toFixed(1).padStart(9)}  ` +
        `${shape.avgActiveSynergies.toFixed(1).padStart(9)}`,
      );
    }
  }

  // Compound emergence (top 15 by run-coverage)
  if (s.compoundEmergence.size > 0) {
    console.log('');
    console.log('  Compound emergence (when each compound first appears, top 15 by run coverage):');
    const rows = [...s.compoundEmergence.entries()]
      .sort((a, b) => b[1].runsThatSawIt - a[1].runsThatSawIt)
      .slice(0, 15);
    for (const [id, e] of rows) {
      const coverage = pct(e.runsThatSawIt / config.runCount);
      console.log(`    ${id.padEnd(28)}  first-seen-avg=round ${e.firstSeenAvgRound.toFixed(1).padStart(4)}   coverage=${coverage}`);
    }
  }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

console.log('Alloy Balance Simulation');
console.log(`Date: ${new Date().toISOString()}`);
console.log(`Compound system version: 23 wired compounds + balance-aware stats`);

const registry = buildRegistry();

for (const batch of MATCH_BATCHES) {
  try {
    printBatch(batch.label, batch.config, registry);
  } catch (err) {
    console.error(`  ERROR running batch "${batch.label}":`, err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack);
  }
}

console.log('');
console.log('─'.repeat(72));
console.log('RUN-MODE SIMULATIONS');
console.log('─'.repeat(72));

for (const batch of RUN_BATCHES) {
  try {
    printRunBatch(batch.label, batch.config, registry);
  } catch (err) {
    console.error(`  ERROR running batch "${batch.label}":`, err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack);
  }
}

console.log('');
console.log('─'.repeat(72));
console.log('Done.');
