import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { GearItem } from '../types/gear.js';
import { nextRarity } from '../types/gem.js';
import { eligibleAffixes, generateItem, rollAffix, scrapLevelFactor, weightedPick } from './item-generator.js';

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

/** Replace the affix at `index` with a freshly rolled, different stat. */
export function reforgeAffix(registry: DataRegistry, item: GearItem, index: number, rng: SeededRNG): GearItem {
  if (index < 0 || index >= item.affixes.length) throw new Error(`No affix at index ${index}`);
  const pool = eligibleAffixes(
    registry,
    item.slot,
    item.affixes.map((a) => a.stat),
  );
  if (pool.length === 0) throw new Error('No alternative affixes for this slot');
  const def = weightedPick(pool, (a) => a.weight, rng);
  const affixes = item.affixes.slice();
  affixes[index] = rollAffix(registry, def, item.ilvl, item.rarity, rng);
  return { ...item, affixes, reforges: item.reforges + 1 };
}

export interface FusionCheck {
  ok: boolean;
  reason?: string;
}

export function checkFusion(items: GearItem[]): FusionCheck {
  if (items.length !== 3) return { ok: false, reason: 'Select exactly 3 items' };
  const rarity = items[0].rarity;
  if (items.some((i) => i.rarity !== rarity)) return { ok: false, reason: 'Items must share a rarity' };
  if (rarity === 'legendary') return { ok: false, reason: 'Legendaries cannot be fused' };
  if (items.some((i) => i.locked)) return { ok: false, reason: 'Unlock items before fusing' };
  if (new Set(items.map((i) => i.uid)).size !== 3) return { ok: false, reason: 'Select 3 different items' };
  return { ok: true };
}

export function fuseCost(registry: DataRegistry, items: GearItem[]): number {
  const forge = registry.getDelveBalance().forge;
  const ilvl = Math.max(...items.map((i) => i.ilvl));
  return Math.round(forge.fuseCost[items[0].rarity] * scrapLevelFactor(registry, ilvl));
}

/**
 * Alloy Fusion: melt three items of one rarity into one of the next rarity.
 * The result takes the slot and base of a random input, the highest item
 * level, and the highest upgrade level so forge investment is never lost.
 */
export function fuseItems(registry: DataRegistry, items: GearItem[], uid: string, rng: SeededRNG): GearItem {
  const check = checkFusion(items);
  if (!check.ok) throw new Error(check.reason);
  const rarity = nextRarity(items[0].rarity);
  if (!rarity) throw new Error('No higher rarity');
  const template = items[rng.nextInt(0, items.length - 1)];
  const result = generateItem(
    registry,
    {
      uid,
      ilvl: Math.max(...items.map((i) => i.ilvl)),
      rarity,
      slot: template.slot,
      baseId: template.baseId,
    },
    rng,
  );
  return { ...result, upgrade: Math.max(...items.map((i) => i.upgrade)) };
}
