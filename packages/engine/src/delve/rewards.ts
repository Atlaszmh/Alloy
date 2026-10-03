import type { DataRegistry } from '../data/registry.js';
import { weightedPick } from '../loot/item-generator.js';
import { addMaterial, emptyHaul, metalAt, shardTiersOf, stockHaul } from '../loot/materials.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { MetalId } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { Reward, RewardGrant, RewardRef } from '../types/quests.js';

/**
 * Quest and contract rewards (see the quests spec's Rewards): `resolveReward`
 * settles a reward, its rule resolved against the profile on `rng`, and adds
 * it to the stockpile (never a dive's haul). `grantRewards` (`delve/quests.ts`)
 * calls it for each reward of a claim, on the claim's stream.
 */

/** `count` of `ref` into the stockpile: a pattern learned, an essence seen too. */
function grant(
  profile: DelveProfile,
  ref: RewardRef,
  count: number,
): { profile: DelveProfile; granted: RewardGrant } {
  const granted = { ref, count };
  if (ref.kind === 'pattern') {
    const known = profile.patterns.includes(ref.pattern);
    return {
      profile: known ? profile : { ...profile, patterns: [...profile.patterns, ref.pattern] },
      granted,
    };
  }
  const haul =
    ref.kind === 'scrap' ? { ...emptyHaul(), scrap: count } : addMaterial(emptyHaul(), ref, count);
  const next = stockHaul(profile, haul);
  if (ref.kind !== 'essence' || next.essencesSeen.includes(ref.essence))
    return { profile: next, granted };
  return { profile: { ...next, essencesSeen: [...next.essencesSeen, ref.essence] }, granted };
}

/**
 * `reward` made concrete (`granted`) and added to the stockpile: `metal:
 * 'depth'` the metal of the best depth, a shard rule a random affix of its
 * family (by the affixes' weights) at its tier (clamped to the affix's tiers),
 * `essence: 'fit'` a legendary whose slots fit a learned pattern, `pattern:
 * 'unknown'` a random unknown pattern (learned), else its `fallback`. A pattern
 * reward teaches one pattern.
 */
export function resolveReward(
  registry: DataRegistry,
  profile: DelveProfile,
  reward: Reward,
  rng: SeededRNG,
): { profile: DelveProfile; granted: RewardGrant } {
  const { count } = reward;
  const pick = <T>(xs: readonly T[]): T => xs[rng.nextInt(0, xs.length - 1)];
  switch (reward.kind) {
    case 'scrap':
    case 'dust':
    case 'links':
      return grant(profile, { kind: reward.kind }, count);
    case 'metal': {
      const metal =
        reward.id === 'depth' ? metalAt(registry, profile.bestDepth).id : (reward.id as MetalId);
      return grant(profile, { kind: 'metal', metal }, count);
    }
    case 'flux':
      return grant(profile, { kind: 'flux', grade: reward.grade! }, count);
    case 'shard': {
      const { families } = registry.getCraftingData();
      const affixes = registry
        .getDelveData()
        .affixes.filter((a) => families[a.stat] === reward.family);
      const { stat } = weightedPick(affixes, (a) => a.weight, rng);
      const tier = Math.min(reward.tier!, shardTiersOf(registry, stat).length);
      return grant(profile, { kind: 'shard', stat, tier }, count);
    }
    case 'essence': {
      if (reward.id !== 'fit')
        return grant(profile, { kind: 'essence', essence: reward.id! }, count);
      const { bases, legendaries } = registry.getDelveData();
      const slots = bases.filter((b) => profile.patterns.includes(b.id)).map((b) => b.slot);
      const fits = legendaries.filter((l) => l.slots.some((s) => slots.includes(s)));
      return grant(
        profile,
        { kind: 'essence', essence: pick(fits.length > 0 ? fits : legendaries).id },
        count,
      );
    }
    case 'pattern': {
      if (reward.id !== 'unknown')
        return grant(profile, { kind: 'pattern', pattern: reward.id! }, 1);
      const unknown = registry.getDelveData().bases.filter((b) => !profile.patterns.includes(b.id));
      if (unknown.length === 0) return resolveReward(registry, profile, reward.fallback!, rng);
      return grant(profile, { kind: 'pattern', pattern: pick(unknown).id }, 1);
    }
  }
}
