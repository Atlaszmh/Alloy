import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { GearItem } from '../types/gear.js';
import { eligibleAffixes, rollAffix, scrapLevelFactor, weightedPick } from './item-generator.js';

/** Scrap gained from salvaging an item (upgrades refund a little extra). */
export function salvageValue(registry: DataRegistry, item: GearItem): number {
  const loot = registry.getDelveBalance().loot;
  const upgradeBonus = 1 + item.upgrade * 0.25;
  return Math.max(1, Math.round(loot.salvage[item.rarity] * scrapLevelFactor(registry, item.ilvl) * upgradeBonus));
}

/** Scrap cost of the next upgrade level, or null when the item is maxed. */
export function upgradeCost(registry: DataRegistry, item: GearItem): number | null {
  const forge = registry.getDelveBalance().forge;
  if (item.upgrade >= forge.maxUpgrade) return null;
  return Math.round(
    forge.upgradeBaseCost *
      forge.rarityCostMult[item.rarity] *
      Math.pow(item.upgrade + 1, forge.upgradeCostExp) *
      scrapLevelFactor(registry, item.ilvl),
  );
}

export function applyUpgrade(registry: DataRegistry, item: GearItem): GearItem {
  if (upgradeCost(registry, item) === null) throw new Error('Item is already at max upgrade');
  return { ...item, upgrade: item.upgrade + 1 };
}

export function reforgeCost(registry: DataRegistry, item: GearItem): number {
  const forge = registry.getDelveBalance().forge;
  return Math.round(
    forge.reforgeBaseCost *
      forge.rarityCostMult[item.rarity] *
      Math.pow(forge.reforgeGrowth, item.reforges) *
      scrapLevelFactor(registry, item.ilvl),
  );
}

/**
 * Replace the affix at `index` with a freshly rolled, different stat: at the
 * rarity's band (a shard's `band` goes) and lifted by `floor`, the attunement
 * floor (see the crafting spec).
 */
export function reforgeAffix(
  registry: DataRegistry,
  item: GearItem,
  index: number,
  rng: SeededRNG,
  floor = 0,
): GearItem {
  if (index < 0 || index >= item.affixes.length) throw new Error(`No affix at index ${index}`);
  const pool = eligibleAffixes(
    registry,
    item.slot,
    item.affixes.map((a) => a.stat),
  );
  if (pool.length === 0) throw new Error('No alternative affixes for this slot');
  const def = weightedPick(pool, (a) => a.weight, rng);
  const affixes = item.affixes.slice();
  affixes[index] = rollAffix(registry, def, item.ilvl, item.rarity, rng, { floor });
  return { ...item, affixes, reforges: item.reforges + 1 };
}
