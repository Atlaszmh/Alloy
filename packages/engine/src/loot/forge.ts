import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import { CHAIN_SKILLS, type ChainSkill } from '../types/ability.js';
import type {
  ForgeLinePreview,
  ForgePreview,
  ForgeRefusal,
  ForgeRequest,
  MaterialRef,
  ShardRef,
} from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem, Moveset, Rarity, StatRoll } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { isDiveActive } from '../delve/dive.js';
import { movesOf } from '../delve/moveset.js';
import { inPair, profileStats } from '../delve/pair.js';
import {
  affixValue,
  baseDisplayName,
  eligibleAffixes,
  foreignElementStats,
  generateRareName,
  implicitValue,
  rollAffix,
  rollBand,
  rollImplicit,
  scrapLevelFactor,
  weightedPick,
} from './item-generator.js';
import { materialCount, shardTiersOf } from './materials.js';
import { baseSlots, carriedSkills, defaultMoveset } from './moveset.js';
import { socketCap, socketsOf } from './runes.js';

/**
 * Forging and the Temper sinks on an item (see the crafting spec): the forge's
 * preview and roll, Hone and Imprint, their prices, and the band and floor
 * math. `forgeItem` rolls exactly what `previewForge` shows.
 */

/**
 * The attunement floor on an item of `element` (see the crafting spec's roll
 * formula): in the hero's pair, min(cap, perPoint × the hero's attunement in
 * it); outside it, 0.
 */
export function rollFloor(
  registry: DataRegistry,
  profile: DelveProfile,
  element: ManaType,
): number {
  if (!inPair(profile, element)) return 0;
  const { perPoint, cap } = registry.getDelveBalance().crafting.attuneRoll;
  return Math.min(cap, perPoint * profileStats(registry, profile).attunement[element]);
}

/** A shard's roll band (its affix's tier), or null for a tier the affix doesn't have. */
function shardBand(registry: DataRegistry, shard: ShardRef): [number, number] | null {
  const tier = shardTiersOf(registry, shard.stat).find((t) => t.tier === shard.tier);
  return tier ? [tier.min, tier.max] : null;
}

/** The skills a forged weapon's extras go to, in order (the crafting spec's S7). */
const EXTRAS_ORDER: readonly ChainSkill[] = ['primary', 'basic', 'ultimate', 'defensive'];

/**
 * A forged weapon's moveset (the crafting spec's S7): the skills its rarity
 * carries, every move its default in the item's mana; `crafting.weaponExtras`
 * extra slots fill the Primary to its cap first, then Basic, Ultimate and
 * Defensive; the open sockets go one a move in that order (the Primary's first
 * moves first), round after round up to the rarity's cap.
 */
export function forgedMoveset(
  registry: DataRegistry,
  item: Pick<GearItem, 'baseId' | 'rarity' | 'mana'>,
): Moveset {
  const bal = registry.getDelveBalance();
  const extras = bal.crafting.weaponExtras[item.rarity];
  const carried = carriedSkills(registry, item.rarity);
  const order = EXTRAS_ORDER.filter((s) => carried.includes(s));
  const slots: Partial<Record<ChainSkill, number>> = {};
  let left = extras.slots;
  for (const s of order) {
    const base = baseSlots(registry, item.baseId, s);
    const add = Math.min(left, Math.max(0, bal.chains.cap[s] - base));
    slots[s] = base + add;
    left -= add;
  }
  const moveset = defaultMoveset(registry, item, item.mana, slots);
  const moves = order.flatMap((s) => movesOf(moveset.chains[s]));
  let open = extras.sockets;
  for (let round = 0; round < socketCap(registry, item.rarity); round++)
    for (const m of moves)
      if (open > 0) {
        m.runes = [...socketsOf(m), null];
        open--;
      }
  return moveset;
}

/** What a forge consumes besides scrap and Mana Dust: the bar, the flux, the essence and the shards. */
export function forgeInputs(req: ForgeRequest): MaterialRef[] {
  return [
    { kind: 'metal', metal: req.metal },
    ...(req.flux ? [{ kind: 'flux' as const, grade: req.flux }] : []),
    ...(req.essence ? [{ kind: 'essence' as const, essence: req.essence }] : []),
    ...req.shards.map((s) => ({ kind: 'shard' as const, ...s })),
  ];
}

/** Why `req` can't be forged now, or null (the crafting spec's refusals, in this order). */
function forgeRefusal(
  registry: DataRegistry,
  profile: DelveProfile,
  req: ForgeRequest,
  preview: Omit<ForgePreview, 'refused'>,
): ForgeRefusal | null {
  const no = (code: ForgeRefusal['code'], reason: string): ForgeRefusal => ({ code, reason });
  const { slot, rarity } = preview;
  if (isDiveActive(profile)) return no('locked', 'Forge at the Anvil, between dives');
  if (!profile.patterns.includes(req.baseId)) return no('pattern', 'Learn this pattern first');
  if (req.essence !== undefined) {
    const def = registry.getDelveData().legendaries.find((l) => l.id === req.essence);
    if (!def) return no('essence', 'No such essence');
    if (req.flux !== 'epic') return no('essence', 'An essence needs epic flux');
    if (!def.slots.includes(slot)) return no('essenceSlot', `${def.name} doesn't fit this pattern`);
  }
  const seen = new Set<string>();
  for (const shard of req.shards) {
    const def = registry.getGearAffix(shard.stat);
    if (!def?.slots.includes(slot))
      return no('shardSlot', `${def?.label ?? shard.stat} doesn't roll on this pattern`);
    if (seen.has(shard.stat)) return no('shardDuplicate', `Only one ${def.label} shard`);
    seen.add(shard.stat);
  }
  const lines = registry.getDelveBalance().loot.affixCount[rarity];
  if (req.shards.length > lines)
    return no('shardCount', `Too many shards: ${lines} lines at ${rarity}`);
  const missing = forgeInputs(req).some(
    (ref) =>
      materialCount(profile.materials, ref) < 1 ||
      (ref.kind === 'shard' && !shardBand(registry, ref)),
  );
  if (missing) return no('materials', 'Missing materials');
  if (profile.scrap < preview.price.scrap) return no('scrap', 'Not enough scrap');
  if (profile.manaDust < preview.price.dust) return no('dust', 'Not enough Mana Dust');
  if (profile.bag.length >= registry.getDelveBalance().loot.bagSize)
    return no('bagFull', 'Bag is full');
  return null;
}

/** Everything `forgeItem` would make but the random draws, and why it refuses (if it does). */
export function previewForge(
  registry: DataRegistry,
  profile: DelveProfile,
  req: ForgeRequest,
): ForgePreview {
  const bal = registry.getDelveBalance();
  const base = registry.getGearBase(req.baseId);
  const metal = registry.getCraftingData().metals.find((m) => m.id === req.metal)!;
  const [lo, hi] = metal.band;
  const ilvl = Math.max(lo, Math.min(hi ?? Infinity, profile.bestDepth));
  const rarity: Rarity = req.essence && req.flux === 'epic' ? 'legendary' : (req.flux ?? 'common');
  const floor = rollFloor(registry, profile, req.element);
  /** A band's lowest roll once the floor lifts it. */
  const low = ([b0, b1]: readonly [number, number]) => b0 + (b1 - b0) * floor;
  const lines: ForgeLinePreview[] = [];
  for (const shard of req.shards.slice(0, bal.loot.affixCount[rarity])) {
    const def = registry.getGearAffix(shard.stat);
    const band = shardBand(registry, shard);
    if (!def || !band) continue;
    const range: [number, number] = [
      affixValue(registry, def, ilvl, low(band)),
      affixValue(registry, def, ilvl, band[1]),
    ];
    lines.push({ shard: { ...shard }, band, range });
  }
  while (lines.length < bal.loot.affixCount[rarity])
    lines.push({ shard: null, band: [bal.loot.minRoll[rarity], 1], range: null });
  // A legendary's power rolls as `forgeItem` rounds it (an unknown essence is refused).
  const legend =
    rarity === 'legendary'
      ? (registry.getDelveData().legendaries.find((l) => l.id === req.essence) ?? {
          id: req.essence!,
          min: 0,
          max: 0,
        })
      : null;
  const legendBand: [number, number] = [bal.loot.minRoll.legendary, 1];
  const legendValue = (roll: number) =>
    Math.round(legend!.min + (legend!.max - legend!.min) * roll);
  const moveset =
    base.slot === 'weapon'
      ? forgedMoveset(registry, { baseId: base.id, rarity, mana: req.element })
      : null;
  const preview: Omit<ForgePreview, 'refused'> = {
    baseId: base.id,
    slot: base.slot,
    rarity,
    ilvl,
    element: req.element,
    floor,
    implicits: base.implicits.map((t) => ({
      stat: t.stat,
      min: implicitValue(registry, t, ilvl, rarity, 0),
      max: implicitValue(registry, t, ilvl, rarity, 1),
    })),
    lines,
    legendary: legend && {
      id: legend.id,
      band: legendBand,
      range: [legendValue(low(legendBand)), legendValue(1)],
    },
    price: {
      scrap: Math.round(bal.crafting.forgeScrap[rarity] * scrapLevelFactor(registry, ilvl)),
      dust: inPair(profile, req.element) ? 0 : bal.crafting.offPairDust,
    },
    weapon: moveset && {
      carries: [...carriedSkills(registry, rarity)],
      // Each carried skill's extra slots, past its base.
      slots: Object.fromEntries(
        carriedSkills(registry, rarity).map((s) => [
          s,
          moveset.slots[s]! - baseSlots(registry, base.id, s),
        ]),
      ),
      sockets: CHAIN_SKILLS.flatMap((s) => movesOf(moveset.chains[s])).flatMap(socketsOf).length,
    },
  };
  return { ...preview, refused: forgeRefusal(registry, profile, req, preview) };
}

/** The forged item, rolled on `rng` (`forge:${forgeCount}`); throws where the preview refuses. */
export function forgeItem(
  registry: DataRegistry,
  profile: DelveProfile,
  req: ForgeRequest,
  rng: SeededRNG,
): GearItem {
  const p = previewForge(registry, profile, req);
  if (p.refused) throw new Error(p.refused.reason);
  const base = registry.getGearBase(p.baseId);
  const implicits = base.implicits.map((t) => rollImplicit(registry, t, p.ilvl, p.rarity, rng));
  const affixes: StatRoll[] = [];
  // A random line never rolls another element's Power or Attunement: only the item's own.
  const foreign = foreignElementStats(p.element);
  for (const line of p.lines) {
    const opts = { band: line.shard ? line.band : undefined, floor: p.floor };
    const def = line.shard
      ? registry.getGearAffix(line.shard.stat)!
      : weightedPick(
          eligibleAffixes(registry, p.slot, [...affixes.map((a) => a.stat), ...foreign]),
          (a) => a.weight,
          rng,
        );
    if (!def) break;
    affixes.push(rollAffix(registry, def, p.ilvl, p.rarity, rng, opts));
  }
  const item: GearItem = {
    uid: `g${profile.nextUid}`,
    slot: p.slot,
    baseId: p.baseId,
    rarity: p.rarity,
    mana: p.element,
    ilvl: p.ilvl,
    name: '',
    implicits,
    affixes,
    upgrade: 0,
    reforges: 0,
    hones: 0,
    locked: false,
  };
  if (p.legendary) {
    const def = registry.getLegendary(p.legendary.id);
    const roll = rollBand(p.legendary.band, p.floor, rng);
    item.legendary = { id: def.id, value: Math.round(def.min + (def.max - def.min) * roll), roll };
    item.name = def.name;
  } else if (p.rarity === 'rare' || p.rarity === 'epic') {
    item.name = generateRareName(registry, p.slot, rng);
  } else {
    item.name = baseDisplayName(registry, item);
  }
  if (p.slot === 'weapon') item.moveset = forgedMoveset(registry, item);
  return item;
}

/** Why `shard` can't go on affix line `line` of `item`, or null (the affix on another line, or not on the slot). */
export function imprintRefusal(
  registry: DataRegistry,
  item: GearItem,
  line: number,
  shard: ShardRef,
): string | null {
  if (!item.affixes[line]) return 'No such affix';
  const def = registry.getGearAffix(shard.stat);
  if (!def?.slots.includes(item.slot))
    return `${def?.label ?? shard.stat} doesn't roll on this item`;
  if (!shardBand(registry, shard)) return 'No such shard';
  if (item.affixes.some((a, i) => i !== line && a.stat === shard.stat))
    return 'Already on this item';
  return null;
}

/** `item` with affix line `line` rerolled within its band, the attunement floor applied; `hones` + 1. */
export function honeLine(
  registry: DataRegistry,
  profile: DelveProfile,
  item: GearItem,
  line: number,
  rng: SeededRNG,
): GearItem {
  const old = item.affixes[line];
  const def = old && registry.getGearAffix(old.stat);
  if (!def) throw new Error(`No affix at index ${line}`);
  const affixes = item.affixes.slice();
  affixes[line] = rollAffix(registry, def, item.ilvl, item.rarity, rng, {
    band: old.band,
    floor: rollFloor(registry, profile, item.mana),
  });
  return { ...item, affixes, hones: item.hones + 1 };
}

/** `item` with affix line `line` replaced by `shard`'s affix, rolled in the shard's band. */
export function imprintLine(
  registry: DataRegistry,
  profile: DelveProfile,
  item: GearItem,
  line: number,
  shard: ShardRef,
  rng: SeededRNG,
): GearItem {
  const why = imprintRefusal(registry, item, line, shard);
  if (why) throw new Error(why);
  const def = registry.getGearAffix(shard.stat)!;
  const band = shardBand(registry, shard)!;
  const affixes = item.affixes.slice();
  affixes[line] = rollAffix(registry, def, item.ilvl, item.rarity, rng, {
    band,
    floor: rollFloor(registry, profile, item.mana),
  });
  return { ...item, affixes };
}

/** Scrap the next hone of `item` costs. */
export function honeCost(registry: DataRegistry, item: GearItem): number {
  const bal = registry.getDelveBalance();
  return Math.round(
    bal.crafting.honeScrap *
      bal.forge.rarityCostMult[item.rarity] *
      Math.pow(bal.crafting.honeGrowth, item.hones) *
      scrapLevelFactor(registry, item.ilvl),
  );
}

/** Scrap an imprint on `item` costs, besides the shard. */
export function imprintCost(registry: DataRegistry, item: GearItem): number {
  const crafting = registry.getDelveBalance().crafting;
  return Math.round(crafting.imprintScrap[item.rarity] * scrapLevelFactor(registry, item.ilvl));
}
