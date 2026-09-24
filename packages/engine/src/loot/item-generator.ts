import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { GearAffixDef, ImplicitTemplate } from '../types/delve.js';
import type { GearItem, GearSlot, HeroStatKey, Rarity, StatRoll } from '../types/gear.js';
import { GEAR_SLOTS } from '../types/gear.js';
import { RARITY_ORDER } from '../types/gem.js';

export interface ItemGenOptions {
  uid: string;
  ilvl: number;
  rarity: Rarity;
  slot?: GearSlot;
  baseId?: string;
  legendaryId?: string;
}

export interface RarityRollContext {
  /** 0 = no luck; 1 = +100% magic find equivalent. */
  luck: number;
  /** Drops since the last legendary. */
  pity: number;
  minRarity?: Rarity;
  /** Extra multiplier on legendary weight (Lucky Charm). */
  legendaryBoost?: number;
}

/** Deterministic weighted pick. Returns the first item when all weights are 0. */
export function weightedPick<T>(items: readonly T[], weight: (item: T) => number, rng: SeededRNG): T {
  let total = 0;
  for (const item of items) total += Math.max(0, weight(item));
  if (total <= 0) return items[0];
  let roll = rng.next() * total;
  for (const item of items) {
    roll -= Math.max(0, weight(item));
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

/** Multiplier applied to flat stats of an item of the given level. */
export function itemLevelScale(registry: DataRegistry, ilvl: number): number {
  return Math.pow(registry.getDelveBalance().growth.item, Math.max(0, ilvl - 1));
}

/** Linear ilvl factor shared by every scrap value and forge cost. */
export function scrapLevelFactor(registry: DataRegistry, ilvl: number): number {
  return 1 + (Math.max(1, ilvl) - 1) * registry.getDelveBalance().loot.scrapLevelScale;
}

export function materialName(registry: DataRegistry, ilvl: number): string {
  let name = registry.getDelveData().materials[0].name;
  for (const m of registry.getDelveData().materials) {
    if (ilvl >= m.minIlvl) name = m.name;
  }
  return name;
}

/** "Steel Sword" — the base type line shown under a legendary or rare title. */
export function baseDisplayName(registry: DataRegistry, item: Pick<GearItem, 'baseId' | 'ilvl'>): string {
  return `${materialName(registry, item.ilvl)} ${registry.getGearBase(item.baseId).name}`;
}

function roundStat(value: number, decimals: number, flat: boolean): number {
  if (flat) return Math.max(1, Math.round(value));
  const f = Math.pow(10, decimals);
  return Math.max(1 / f, Math.round(value * f) / f);
}

function decimalsFor(registry: DataRegistry, stat: HeroStatKey): number {
  return registry.getGearAffix(stat)?.decimals ?? 0;
}

function rollImplicit(
  registry: DataRegistry,
  template: ImplicitTemplate,
  ilvl: number,
  rarity: Rarity,
  rng: SeededRNG,
): StatRoll {
  const loot = registry.getDelveBalance().loot;
  const roll = rng.next();
  const scale = template.scaling === 'flat' ? itemLevelScale(registry, ilvl) : 1;
  const raw = template.base * scale * loot.rarityBaseMult[rarity] * (0.9 + 0.2 * roll);
  return {
    stat: template.stat,
    value: roundStat(raw, decimalsFor(registry, template.stat), template.scaling === 'flat'),
    roll,
  };
}

/** Roll one affix of the given definition at an item level and rarity. */
export function rollAffix(
  registry: DataRegistry,
  def: GearAffixDef,
  ilvl: number,
  rarity: Rarity,
  rng: SeededRNG,
): StatRoll {
  const minRoll = registry.getDelveBalance().loot.minRoll[rarity];
  const roll = minRoll + (1 - minRoll) * rng.next();
  const scale = def.scaling === 'flat' ? itemLevelScale(registry, ilvl) : 1;
  const raw = (def.min + (def.max - def.min) * roll) * scale;
  return { stat: def.stat, value: roundStat(raw, def.decimals, def.unit === 'flat'), roll };
}

/** Affix definitions that may roll on a slot, excluding stats already present. */
export function eligibleAffixes(registry: DataRegistry, slot: GearSlot, exclude: HeroStatKey[] = []): GearAffixDef[] {
  return registry.getDelveData().affixes.filter((a) => a.slots.includes(slot) && !exclude.includes(a.stat));
}

function generateRareName(registry: DataRegistry, slot: GearSlot, rng: SeededRNG): string {
  const names = registry.getDelveData().names;
  const prefix = names.prefixes[rng.nextInt(0, names.prefixes.length - 1)];
  const suffixes = names.suffixes[slot];
  const suffix = suffixes[rng.nextInt(0, suffixes.length - 1)];
  return `${prefix} ${suffix}`;
}

export function generateItem(registry: DataRegistry, opts: ItemGenOptions, rng: SeededRNG): GearItem {
  const data = registry.getDelveData();
  const loot = registry.getDelveBalance().loot;
  const ilvl = Math.max(1, Math.floor(opts.ilvl));

  const slot = opts.slot ?? weightedPick(GEAR_SLOTS, (s) => data.slotWeights[s], rng);
  const base = opts.baseId
    ? registry.getGearBase(opts.baseId)
    : weightedPick(registry.getGearBasesForSlot(slot), (b) => b.weight, rng);

  const implicits = base.implicits.map((t) => rollImplicit(registry, t, ilvl, opts.rarity, rng));

  const affixes: StatRoll[] = [];
  const count = loot.affixCount[opts.rarity];
  for (let i = 0; i < count; i++) {
    const pool = eligibleAffixes(
      registry,
      base.slot,
      affixes.map((a) => a.stat),
    );
    if (pool.length === 0) break;
    const def = weightedPick(pool, (a) => a.weight, rng);
    affixes.push(rollAffix(registry, def, ilvl, opts.rarity, rng));
  }

  let legendary: GearItem['legendary'];
  let name: string;
  if (opts.rarity === 'legendary') {
    const def = opts.legendaryId
      ? registry.getLegendary(opts.legendaryId)
      : weightedPick(
          data.legendaries.filter((l) => l.slots.includes(base.slot)),
          () => 1,
          rng,
        );
    const roll = loot.minRoll.legendary + (1 - loot.minRoll.legendary) * rng.next();
    legendary = { id: def.id, value: Math.round(def.min + (def.max - def.min) * roll), roll };
    name = def.name;
  } else if (opts.rarity === 'rare' || opts.rarity === 'epic') {
    name = generateRareName(registry, base.slot, rng);
  } else {
    name = baseDisplayName(registry, { baseId: base.id, ilvl });
  }

  const item: GearItem = {
    uid: opts.uid,
    slot: base.slot,
    baseId: base.id,
    rarity: opts.rarity,
    ilvl,
    name,
    implicits,
    affixes,
    upgrade: 0,
    reforges: 0,
    locked: false,
  };
  if (legendary) item.legendary = legendary;
  return item;
}

export function rarityWeights(registry: DataRegistry, ctx: RarityRollContext): Record<Rarity, number> {
  const loot = registry.getDelveBalance().loot;
  const luck = Math.max(0, ctx.luck);
  const minIdx = ctx.minRarity ? RARITY_ORDER.indexOf(ctx.minRarity) : 0;
  const out = {} as Record<Rarity, number>;
  RARITY_ORDER.forEach((rarity, i) => {
    let w = loot.rarityWeights[rarity] * Math.pow(1 + luck, i * loot.luckExponent);
    if (rarity === 'legendary') {
      w *= 1 + Math.max(0, ctx.pity) * loot.pityPerDrop;
      w *= ctx.legendaryBoost ?? 1;
    }
    out[rarity] = i < minIdx ? 0 : w;
  });
  return out;
}

export function rollRarity(registry: DataRegistry, ctx: RarityRollContext, rng: SeededRNG): Rarity {
  const weights = rarityWeights(registry, ctx);
  return weightedPick(RARITY_ORDER, (r) => weights[r], rng);
}
