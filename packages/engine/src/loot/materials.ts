import type { DataRegistry } from '../data/registry.js';
import type { MetalDef, ShardTierDef } from '../types/crafting.js';
import type { HeroStatKey } from '../types/gear.js';

/**
 * The materials (see the crafting spec): the data's lookups, the pouch and
 * haul ops every area shares, and refining.
 */

/** The metal whose band holds `ilvl` (below 1 counts as 1). */
export function metalAt(registry: DataRegistry, ilvl: number): MetalDef {
  // The bands run from 1 up and the last is open, so one always holds it.
  return registry
    .getCraftingData()
    .metals.find(({ band: [, hi] }) => hi === null || Math.max(1, ilvl) <= hi)!;
}

/** An affix's shard tiers: its own (`affixShardTiers`), else the default ones. */
export function shardTiersOf(registry: DataRegistry, stat: HeroStatKey): ShardTierDef[] {
  const data = registry.getCraftingData();
  return data.affixShardTiers[stat] ?? data.shardTiers;
}
