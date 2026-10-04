import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { GearAffixDef, ImplicitTemplate } from '../types/delve.js';
import type { GearItem, GearSlot, HeroStatKey, Rarity, StatRoll } from '../types/gear.js';
import { GEAR_SLOTS, RARITY_ORDER } from '../types/gear.js';
import { MANA_TYPES, type ManaType } from '../types/mana.js';
import { rollMoveset, rollSockets } from './moveset.js';
import { metalAt } from './materials.js';

export interface ItemGenOptions {
  uid: string;
  ilvl: number;
  rarity: Rarity;
  slot?: GearSlot;
  baseId?: string;
  legendaryId?: string;
  /** Force the mana affinity. */
  mana?: ManaType;
  /** The biome's mana: drops lean toward it. */
  biomeMana?: ManaType;
  /** The hero's pair, primary first: drops lean toward it. Empty or absent: no lean. */
  pair?: readonly ManaType[];
}

export interface RarityRollContext {
  /** 0 = no luck; 1 = +100% magic find equivalent. */
  luck: number;
  minRarity?: Rarity;
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

/** The name of the metal whose band holds `ilvl` (`crafting.json → metals`): a forged item's name matches its bar. */
export function materialName(registry: DataRegistry, ilvl: number): string {
  return metalAt(registry, ilvl).name;
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

/** An implicit's value at `roll` (0–1), an item level and a rarity. */
export function implicitValue(
  registry: DataRegistry,
  template: ImplicitTemplate,
  ilvl: number,
  rarity: Rarity,
  roll: number,
): number {
  const loot = registry.getDelveBalance().loot;
  const scale = template.scaling === 'flat' ? itemLevelScale(registry, ilvl) : 1;
  const raw = template.base * scale * loot.rarityBaseMult[rarity] * (0.9 + 0.2 * roll);
  return roundStat(raw, decimalsFor(registry, template.stat), template.scaling === 'flat');
}

export function rollImplicit(
  registry: DataRegistry,
  template: ImplicitTemplate,
  ilvl: number,
  rarity: Rarity,
  rng: SeededRNG,
): StatRoll {
  const roll = rng.next();
  return { stat: template.stat, value: implicitValue(registry, template, ilvl, rarity, roll), roll };
}

/**
 * A roll in `band` with the attunement floor (see the crafting spec's roll
 * formula): `u = floor + (1 − floor) × r`, then `band[0] + (band[1] − band[0]) × u`,
 * so the floor lifts the whole draw within the band.
 */
export function rollBand(band: readonly [number, number], floor: number, rng: SeededRNG): number {
  const u = floor + (1 - floor) * rng.next();
  return band[0] + (band[1] - band[0]) * u;
}

/** An affix's value at `roll` (0–1 in its full range) and an item level. */
export function affixValue(registry: DataRegistry, def: GearAffixDef, ilvl: number, roll: number): number {
  const scale = def.scaling === 'flat' ? itemLevelScale(registry, ilvl) : 1;
  const raw = (def.min + (def.max - def.min) * roll) * scale;
  return roundStat(raw, def.decimals, def.unit === 'flat');
}

/**
 * Roll one affix of the given definition at an item level and rarity: in
 * `opts.band` (a shard's, stored on the line), else the rarity's `[minRoll, 1]`
 * (not stored), lifted by `opts.floor` (the attunement floor; drops take none).
 */
export function rollAffix(
  registry: DataRegistry,
  def: GearAffixDef,
  ilvl: number,
  rarity: Rarity,
  rng: SeededRNG,
  opts: { band?: [number, number]; floor?: number } = {},
): StatRoll {
  const band = opts.band ?? [registry.getDelveBalance().loot.minRoll[rarity], 1];
  const roll = rollBand(band, opts.floor ?? 0, rng);
  const line: StatRoll = { stat: def.stat, value: affixValue(registry, def, ilvl, roll), roll };
  if (opts.band) line.band = [opts.band[0], opts.band[1]];
  return line;
}

/** Every other element's Power and Attunement stats: a random line on an item of `mana` never rolls them. */
export function foreignElementStats(mana: ManaType): HeroStatKey[] {
  return MANA_TYPES.filter((m) => m !== mana).flatMap((m) => [`${m}Power`, `${m}Attune`] as HeroStatKey[]);
}

/** Affix definitions that may roll on a slot, excluding stats already present. */
export function eligibleAffixes(registry: DataRegistry, slot: GearSlot, exclude: HeroStatKey[] = []): GearAffixDef[] {
  return registry.getDelveData().affixes.filter((a) => a.slots.includes(slot) && !exclude.includes(a.stat));
}

export function generateRareName(registry: DataRegistry, slot: GearSlot, rng: SeededRNG): string {
  const names = registry.getDelveData().names;
  const prefix = names.prefixes[rng.nextInt(0, names.prefixes.length - 1)];
  const suffixes = names.suffixes[slot];
  const suffix = suffixes[rng.nextInt(0, suffixes.length - 1)];
  return `${prefix} ${suffix}`;
}

/**
 * Pick a mana affinity. With a pair, `pair.dropBias` of drops take one of its
 * elements (the primary `primaryShare` of the time once two are bound); the
 * rest lean toward the biome's element, else roll uniformly. An empty pair
 * draws exactly as before (no extra random draw).
 */
export function rollMana(
  registry: DataRegistry,
  biomeMana: ManaType | undefined,
  rng: SeededRNG,
  pair: readonly ManaType[] = [],
): ManaType {
  const bal = registry.getDelveBalance();
  if (pair.length > 0 && rng.next() < bal.pair.dropBias)
    return pair.length > 1 && rng.next() >= bal.pair.primaryShare ? pair[1] : pair[0];
  if (biomeMana && rng.next() < bal.loot.biomeManaBias) return biomeMana;
  return MANA_TYPES[rng.nextInt(0, MANA_TYPES.length - 1)];
}

export function generateItem(registry: DataRegistry, opts: ItemGenOptions, rng: SeededRNG): GearItem {
  const data = registry.getDelveData();
  const loot = registry.getDelveBalance().loot;
  const ilvl = Math.max(1, Math.floor(opts.ilvl));

  const slot = opts.slot ?? weightedPick(GEAR_SLOTS, (s) => data.slotWeights[s], rng);
  const base = opts.baseId
    ? registry.getGearBase(opts.baseId)
    : weightedPick(registry.getGearBasesForSlot(slot), (b) => b.weight, rng);

  const mana = opts.mana ?? rollMana(registry, opts.biomeMana, rng, opts.pair);
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
    mana,
    ilvl,
    name,
    implicits,
    affixes,
    upgrade: 0,
    reforges: 0,
    hones: 0,
    locked: false,
  };
  if (legendary) item.legendary = legendary;
  // Last, from their own streams: every other roll, and every later drop, stays as it was.
  if (item.slot === 'weapon') {
    const moveset = rollMoveset(registry, item, rng.fork('moveset'));
    item.moveset = rollSockets(registry, item, moveset, rng.fork('sockets'));
  }
  return item;
}

export function rarityWeights(registry: DataRegistry, ctx: RarityRollContext): Record<Rarity, number> {
  const loot = registry.getDelveBalance().loot;
  const luck = Math.max(0, ctx.luck);
  const minIdx = ctx.minRarity ? RARITY_ORDER.indexOf(ctx.minRarity) : 0;
  const out = {} as Record<Rarity, number>;
  RARITY_ORDER.forEach((rarity, i) => {
    const w = loot.rarityWeights[rarity] * Math.pow(1 + luck, i * loot.luckExponent);
    out[rarity] = i < minIdx ? 0 : w;
  });
  return out;
}

export function rollRarity(registry: DataRegistry, ctx: RarityRollContext, rng: SeededRNG): Rarity {
  const weights = rarityWeights(registry, ctx);
  return weightedPick(RARITY_ORDER, (r) => weights[r], rng);
}
