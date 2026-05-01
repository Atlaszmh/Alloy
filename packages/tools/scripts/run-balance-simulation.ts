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
  type SimulationConfig,
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
console.log('Done.');
