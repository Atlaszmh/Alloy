import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { DelveProfile } from '../types/delve.js';
import type { Reward, RewardGrant } from '../types/quests.js';

/**
 * Quest and contract rewards (see the quests spec's Rewards): `resolveReward`
 * settles a reward, its rule resolved against the profile on `rng`, and adds
 * it to the stockpile (never a dive's haul). `grantRewards` (`delve/quests.ts`)
 * calls it for each reward of a claim, on the claim's stream.
 */

/**
 * `reward` made concrete (`granted`) and added to the stockpile: `metal:
 * 'depth'` the metal of the best depth, a shard rule a random affix of its
 * family at its tier (clamped to the affix's tiers), `essence: 'fit'` a
 * legendary whose slots fit a learned pattern, `pattern: 'unknown'` a random
 * unknown pattern (learned), else its `fallback`. Stub (B2).
 */
export function resolveReward(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _reward: Reward,
  _rng: SeededRNG,
): { profile: DelveProfile; granted: RewardGrant } {
  throw new Error('resolveReward: not implemented');
}
