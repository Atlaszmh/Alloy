import type { AffixCategory, AffixDef } from '../types/affix.js';
import type { GemInstance, GemRarity } from '../types/gem.js';
import type { DataRegistry } from '../data/registry.js';
import { createGem } from '../types/gem.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import { validateArchetypes } from './archetype-validator.js';
import { getPoolConfigForRound } from '../run/pool-scaling.js';

/**
 * Category weight targets for pool generation.
 * ~40% offensive, ~30% defensive, ~20% sustain/utility, ~10% trigger
 */
const CATEGORY_WEIGHTS: { category: AffixCategory; weight: number }[] = [
  { category: 'offensive', weight: 0.4 },
  { category: 'defensive', weight: 0.3 },
  { category: 'sustain', weight: 0.1 },
  { category: 'utility', weight: 0.1 },
  { category: 'trigger', weight: 0.1 },
];

function pickCategory(rng: SeededRNG): AffixCategory {
  const roll = rng.next();
  let cumulative = 0;
  for (const { category, weight } of CATEGORY_WEIGHTS) {
    cumulative += weight;
    if (roll < cumulative) return category;
  }
  return 'offensive';
}

function pickRandom<T>(arr: T[], rng: SeededRNG): T {
  return arr[rng.nextInt(0, arr.length - 1)];
}

/**
 * Generate a deterministic pool of gems from a seed.
 *
 * @param round - Which draft round. Round 1 gets archetype validation and
 *   trigger guarantees. Subsequent rounds are supplemental pools.
 *   Each round forks a unique RNG stream so pools are independent.
 *   Accepts any positive number (unlimited rounds for run modes).
 */
export function generatePool(
  seed: number,
  mode: 'quick' | 'ranked' | 'unranked' | 'run_async' | 'run_live',
  registry: DataRegistry,
  round: number = 1,
): GemInstance[] {
  const balance = registry.getBalance();
  let currentSeed = seed;

  // For run modes, use pool scaling config; for legacy modes, use balance config
  const isRunMode = mode === 'run_async' || mode === 'run_live';

  // Determine pool size
  let poolSize: number | null;
  if (isRunMode) {
    const poolConfig = getPoolConfigForRound(round);
    poolSize = poolConfig.poolSize;
  } else if (mode === 'quick') {
    poolSize = null; // quick mode uses its own size config
  } else {
    // Ranked/unranked: clamp round to 1-3 for legacy config arrays
    const clampedRound = Math.min(round, 3);
    poolSize = balance.draftPoolPerRound[clampedRound - 1];
  }

  // Round 1: validate archetypes, guarantee triggers
  if (round === 1) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const masterRng = new SeededRNG(currentSeed);
      const rng = masterRng.fork(`pool_r${round}`);

      const pool = buildPool(rng, mode, registry, poolSize, round);

      if (validateArchetypes(pool, registry, balance.archetypeMinOrbs, 3)) {
        return ensureTriggerGems(pool, rng, registry, 2);
      }

      currentSeed = currentSeed + 1;
    }

    // Fallback
    const masterRng = new SeededRNG(currentSeed);
    const rng = masterRng.fork(`pool_r${round}`);
    return ensureTriggerGems(buildPool(rng, mode, registry, poolSize, round), rng, registry, 2);
  }

  // Rounds 2+: no archetype validation, no trigger guarantee (supplemental gems)
  const masterRng = new SeededRNG(currentSeed);
  const rng = masterRng.fork(`pool_r${round}`);
  return buildPool(rng, mode, registry, poolSize, round);
}

/**
 * Build the raw pool (before archetype validation).
 * Uses round-based scaling for run modes (tier range + rarity from pool config).
 */
function buildPool(
  rng: SeededRNG,
  mode: 'quick' | 'ranked' | 'unranked' | 'run_async' | 'run_live',
  registry: DataRegistry,
  overrideSize: number | null,
  round: number = 1,
): GemInstance[] {
  const balance = registry.getBalance();
  const isRunMode = mode === 'run_async' || mode === 'run_live';
  const poolConfig = isRunMode ? getPoolConfigForRound(round) : null;

  // Determine pool size
  let poolSize: number;
  if (overrideSize !== null) {
    poolSize = overrideSize;
  } else {
    // Quick match uses the old min/max range
    const sizeConfig = balance.draftPoolSizeQuick;
    poolSize = rng.nextInt(sizeConfig.min, sizeConfig.max);
  }

  // Build affix caches by category
  const affixesByCategory = new Map<AffixCategory, AffixDef[]>();
  for (const { category } of CATEGORY_WEIGHTS) {
    const affixes = registry.getAffixesByCategory(category);
    if (affixes.length > 0) {
      affixesByCategory.set(category, affixes);
    }
  }

  const allAffixes = registry.getAllAffixes();

  const pool: GemInstance[] = [];

  if (isRunMode && poolConfig) {
    // Run mode: use pool config for tier range and rarity
    for (let i = 0; i < poolSize; i++) {
      let category = pickCategory(rng);
      let candidates = affixesByCategory.get(category);
      if (!candidates || candidates.length === 0) {
        candidates = allAffixes;
      }

      const affix = pickRandom(candidates, rng);
      const tier = rng.nextInt(poolConfig.tiers[0], poolConfig.tiers[1]) as 1 | 2 | 3 | 4 | 5;
      const rarity: GemRarity = pickRandom(poolConfig.rarities, rng);

      pool.push(createGem(
        `gem_r${round}_${i}`,
        affix.id,
        tier,
        rarity,
      ));
    }
  } else {
    // Legacy mode: use tier distribution, all common rarity
    const tierTargets = computeTierTargets(poolSize, balance.tierDistribution, rng);
    let gemIndex = 0;

    for (const [tier, count] of tierTargets) {
      for (let i = 0; i < count; i++) {
        let category = pickCategory(rng);
        let candidates = affixesByCategory.get(category);

        if (!candidates || candidates.length === 0) {
          candidates = allAffixes;
        }

        const affix = pickRandom(candidates, rng);

        pool.push(createGem(
          `gem_r${round}_${gemIndex}`,
          affix.id,
          tier as 1 | 2 | 3 | 4 | 5,
          'common',
        ));
        gemIndex++;
      }
    }
  }

  return pool;
}

function computeTierTargets(
  poolSize: number,
  distribution: Record<number, number>,
  rng: SeededRNG,
): [number, number][] {
  const tiers = [1, 2, 3, 4];
  const rawCounts: [number, number][] = tiers.map((t) => [
    t,
    Math.floor(poolSize * (distribution[t] ?? 0)),
  ]);

  let assigned = rawCounts.reduce((sum, [, c]) => sum + c, 0);
  let remainder = poolSize - assigned;

  while (remainder > 0) {
    const tier = tiers[rng.nextInt(0, tiers.length - 1)];
    const entry = rawCounts.find(([t]) => t === tier)!;
    entry[1]++;
    remainder--;
  }

  return rawCounts;
}

function ensureTriggerGems(
  pool: GemInstance[],
  rng: SeededRNG,
  registry: DataRegistry,
  minTriggers: number,
): GemInstance[] {
  const triggerAffixes = registry.getAffixesByCategory('trigger');
  if (triggerAffixes.length === 0) return pool;

  let triggerCount = 0;
  for (const gem of pool) {
    const affix = registry.findAffix(gem.affixId);
    if (affix && affix.category === 'trigger') {
      triggerCount++;
    }
  }

  const result = [...pool];
  for (let i = result.length - 1; i >= 0 && triggerCount < minTriggers; i--) {
    const affix = registry.findAffix(result[i].affixId);
    if (affix && affix.category !== 'trigger') {
      const triggerAffix = pickRandom(triggerAffixes, rng);
      result[i] = createGem(
        result[i].uid,
        triggerAffix.id,
        result[i].tier,
        result[i].rarity,
      );
      triggerCount++;
    }
  }

  return result;
}
