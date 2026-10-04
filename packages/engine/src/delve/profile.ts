import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type { DelveProfile } from '../types/delve.js';
import type { EquippedGear, GearItem, GearSlot, Moveset, Rarity } from '../types/gear.js';
import { GEAR_SLOTS, RARITY_ORDER, rarityIndex } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { generateItem } from '../loot/item-generator.js';
import { applyUpgrade, reforgeAffix, reforgeCost, upgradeCost } from '../loot/smithing.js';
import { compareItem, heroPower } from './hero-stats.js';
import { DelveProfileSchema } from './profile-schema.js';
import { chooseStartingMana, type ChainFix } from './pair.js';
import { isDiveActive } from './dive.js';
import type { SetChainsOptions } from './runes.js';
import { baseSlots, carriedSkills, defaultChain, movesetOf, weaponParts } from '../loot/moveset.js';
import { emptyMaterials } from '../loot/materials.js';
import { applyQuestEvents, emptyQuests } from './quests.js';
import { applyTutorialEvents } from './tutorial.js';
import { refillBoard } from './contracts.js';
import { rollFloor } from '../loot/forge.js';
import { applySalvage, salvageRng } from '../loot/salvage-yield.js';
import { addToPouch, socketCap } from '../loot/runes.js';
import type { RuneRef } from '../types/rune.js';
import type { ShardRef } from '../types/crafting.js';
import type { RewardGrant } from '../types/quests.js';
import { CHAIN_SKILLS, type Blow, type ChainSkill, type Move } from '../types/ability.js';

export interface ProfileActionResult {
  ok: boolean;
  profile: DelveProfile;
  reason?: string;
  item?: GearItem;
  /** The chains' moves the op changed to fit the pair (Realign), a fix each. */
  fixed?: ChainFix[];
  /** Links the op gave back (a transfer's). */
  links?: number;
  /** Runes the op put back in the pouch (see the runes spec). */
  runes?: RuneRef[];
  /** Runes the op destroyed. */
  destroyed?: RuneRef[];
  /** What a claim gave (see the quests spec). */
  rewards?: RewardGrant[];
}

function perRarity<T>(value: T): Record<Rarity, T> {
  return Object.fromEntries(RARITY_ORDER.map((r) => [r, value])) as Record<Rarity, T>;
}

/**
 * A new save. Without `primary` the hero has no pair yet (the Anvil asks);
 * the bot and tests pass one, which runs `chooseStartingMana`.
 */
export function createDelveProfile(
  registry: DataRegistry,
  seed: number,
  opts: { primary?: ManaType } = {},
): DelveProfile {
  const rng = new SeededRNG(seed).fork('starter');
  const weapon = generateItem(
    registry,
    { uid: 'g0', ilvl: 1, rarity: 'common', slot: 'weapon', baseId: 'sword', mana: 'fire' },
    rng,
  );
  const chest = generateItem(
    registry,
    { uid: 'g1', ilvl: 1, rarity: 'common', slot: 'chest', mana: 'earth' },
    rng,
  );
  // The starter kit (the crafting spec's S8): enough to forge before the first dive.
  const kit = registry.getCraftingData();
  const materials = emptyMaterials();
  Object.assign(materials.metals, kit.startingMaterials.metals);
  Object.assign(materials.flux, kit.startingMaterials.flux);
  const profile: DelveProfile = {
    version: 11,
    seed: seed | 0,
    diveCount: 0,
    forgeCount: 0,
    nextUid: 2,
    equipped: { weapon, chest },
    bag: [],
    scrap: kit.startingMaterials.scrap,
    bestDepth: 0,
    checkpoints: [],
    codex: {},
    stats: {
      kills: 0,
      dives: 0,
      deaths: 0,
      extracts: 0,
      bossKills: 0,
      scrapEarned: 0,
      itemsFound: perRarity(0),
    },
    autoSalvage: perRarity(false),
    pair: { primary: null, secondary: null },
    manaDust: 0,
    links: 0,
    runes: {},
    materials,
    patterns: [...kit.startingPatterns],
    essencesSeen: [],
    reactionsSeen: [],
    quests: emptyQuests(registry),
    tutorial: null,
    dive: null,
  };
  // The first unlocks, and a full Contract board once there are templates (see the quests spec).
  let started = applyQuestEvents(registry, profile, []);
  if (registry.getQuestsData().contractTemplates.length > 0)
    started = refillBoard(registry, started);
  return opts.primary ? chooseStartingMana(registry, started, opts.primary).profile : started;
}

/** `profile` with its equipped weapon's moveset replaced (it has a weapon). */
export function withMoveset(profile: DelveProfile, moveset: Moveset): DelveProfile {
  const weapon = profile.equipped.weapon!;
  return { ...profile, equipped: { ...profile.equipped, weapon: { ...weapon, moveset } } };
}

/**
 * A save read back: the profile, or `reset` for a save of another version (no
 * migrations: see the crafting spec), which starts afresh with a notice.
 */
export type ParsedDelveProfile = { profile: DelveProfile } | { reset: true };

/**
 * Every weapon's moveset fitted to the data: a weapon without one gets its
 * base defaults in its own mana; a chain its rarity no longer carries is
 * dropped, its extra slots back as Links (as salvaging would give); a newly
 * carried one gets its base default; and a basic chain's slots are raised to
 * its weapon's string. (A base whose string grew absorbs extras it can't tell
 * from its new base: the old base isn't stored, so those give no Links.)
 *
 * And its sockets (see the runes spec): a rune the data doesn't know, or the
 * second of one id on a move, is emptied; sockets past the rarity's cap are
 * trimmed from the end, and a dropped chain's go with it. Each socket that
 * goes comes back as a Link, and each known rune taken off leaves by the parts
 * rule in the balance's mode: back to the pouch ('pay') or destroyed
 * ('destroy'). The pouch drops ids the data doesn't know.
 */
function fitMovesets(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let links = 0;
  const off: RuneRef[] = [];
  const known = (r: RuneRef | null): r is RuneRef => !!r && !!registry.findRune(r.id);
  const fitSockets = <M extends Move | Blow>(m: M, cap: number): M => {
    if (!m.runes) return m;
    const seen = new Set<string>();
    const runes = m.runes.map((r) => {
      if (!known(r)) return null;
      if (seen.has(r.id)) {
        off.push(r);
        return null;
      }
      seen.add(r.id);
      return r;
    });
    for (const r of runes.slice(cap)) {
      links++;
      if (r) off.push(r);
    }
    return { ...m, runes: runes.slice(0, cap) };
  };
  const fit = (item: GearItem): GearItem => {
    if (item.slot !== 'weapon') return item;
    const old = movesetOf(registry, item);
    const carried = carriedSkills(registry, item);
    const cap = socketCap(registry, item.rarity);
    const moveset: Moveset = { chains: {}, slots: {} };
    for (const skill of CHAIN_SKILLS) {
      const base = baseSlots(registry, item.baseId, skill);
      const chain = old.chains[skill];
      if (!carried.includes(skill)) {
        links += Math.max(0, (old.slots[skill] ?? base) - base);
        for (const m of chain ? (Array.isArray(chain) ? chain : chain.moves) : [])
          for (const r of m.runes ?? []) {
            links++;
            if (known(r)) off.push(r);
          }
        continue;
      }
      const set = moveset.chains as Record<ChainSkill, unknown>;
      set[skill] = !chain
        ? defaultChain(registry, skill, item.baseId, item.mana, base)
        : Array.isArray(chain)
          ? chain.map((b) => fitSockets(b, cap))
          : { ...chain, moves: chain.moves.map((m) => fitSockets(m, cap)) };
      moveset.slots[skill] = chain ? Math.max(old.slots[skill]!, base) : base;
    }
    return { ...item, moveset };
  };
  const equipped: EquippedGear = {};
  for (const slot of GEAR_SLOTS) {
    const item = profile.equipped[slot];
    if (item) equipped[slot] = fit(item);
  }
  const bag = profile.bag.map(fit);
  const pouch = Object.fromEntries(
    Object.entries(profile.runes).filter(([id]) => registry.findRune(id)),
  );
  const pay = registry.getDelveBalance().runes.unsocket === 'pay';
  return {
    ...profile,
    equipped,
    bag,
    links: profile.links + links,
    runes: pay ? addToPouch(pouch, off) : pouch,
  };
}

/**
 * Validate an unknown JSON blob as a save. A version 11 save is fitted to the
 * data (`fitMovesets`); a save of any other version is `{ reset: true }`. Null
 * when it isn't an object, or a version 11 save doesn't fit the schema.
 */
export function parseDelveProfile(registry: DataRegistry, raw: unknown): ParsedDelveProfile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  if ((raw as { version?: unknown }).version !== 11) return { reset: true };
  const parsed = DelveProfileSchema.safeParse(raw);
  return parsed.success ? { profile: fitMovesets(registry, parsed.data as DelveProfile) } : null;
}

/** Depth used as the yardstick for Power and comparisons. */
export function referenceDepth(profile: DelveProfile): number {
  return Math.max(1, profile.dive?.depth ?? profile.bestDepth);
}

export function profilePower(registry: DataRegistry, profile: DelveProfile): number {
  return heroPower(profile.equipped, registry, referenceDepth(profile), profile.pair);
}

export function findItem(
  profile: DelveProfile,
  uid: string,
): { item: GearItem; where: 'bag' | 'equipped' } | null {
  const inBag = profile.bag.find((i) => i.uid === uid);
  if (inBag) return { item: inBag, where: 'bag' };
  for (const slot of GEAR_SLOTS) {
    const item = profile.equipped[slot];
    if (item?.uid === uid) return { item, where: 'equipped' };
  }
  return null;
}

/** Replace an item (matched by uid) wherever it lives. */
export function replaceItem(profile: DelveProfile, item: GearItem): DelveProfile {
  const found = findItem(profile, item.uid);
  if (!found) throw new Error(`Item not found: ${item.uid}`);
  if (found.where === 'bag') {
    return { ...profile, bag: profile.bag.map((i) => (i.uid === item.uid ? item : i)) };
  }
  return { ...profile, equipped: { ...profile.equipped, [item.slot]: item } };
}

/** The stream the next forge op draws on: `forge:${forgeCount}` (the op moves the count on). */
export function forgeRng(profile: DelveProfile): SeededRNG {
  return new SeededRNG(profile.seed).fork(`forge:${profile.forgeCount}`);
}

/** Record newly obtained items in stats and the legendary codex. */
export function recordFinds(
  profile: DelveProfile,
  items: GearItem[],
): { profile: DelveProfile; newCodex: string[] } {
  const itemsFound = { ...profile.stats.itemsFound };
  const codex = { ...profile.codex };
  const newCodex: string[] = [];
  for (const item of items) {
    itemsFound[item.rarity]++;
    if (item.legendary) {
      const prev = codex[item.legendary.id];
      if (!prev) newCodex.push(item.legendary.id);
      codex[item.legendary.id] = {
        count: (prev?.count ?? 0) + 1,
        bestRoll: Math.max(prev?.bestRoll ?? 0, item.legendary.roll),
      };
    }
  }
  return { profile: { ...profile, codex, stats: { ...profile.stats, itemsFound } }, newCodex };
}

/** What melting gear gave (`applySalvage`, item by item). */
export interface Melted {
  scrap: number;
  /** Mana Dust from the melted items outside the pair. */
  dust: number;
  /** Links from the melted weapons' extra slots and open sockets. */
  links: number;
  /** Runes back to the pouch (or mid-dive the haul) from melted weapons' sockets (see the runes spec). */
  runes: RuneRef[];
  /** Runes the melted weapons' sockets destroyed. */
  destroyed: RuneRef[];
  /** The shards, the patterns learned and the essences they gave (see the crafting spec's Salvage). */
  shards: ShardRef[];
  patterns: string[];
  essences: string[];
}

/**
 * Melt `items` one by one (`applySalvage`, each on its own `salvageRng`):
 * mid-dive into the floor's haul, at the Anvil into the stockpile, moving
 * `forgeCount` on once. Their runes leave by the parts rule (`opts.unsocket`).
 */
function melt(
  registry: DataRegistry,
  profile: DelveProfile,
  items: GearItem[],
  opts: Pick<SetChainsOptions, 'unsocket'>,
): Melted & { profile: DelveProfile } {
  const out: Melted = {
    scrap: 0,
    dust: 0,
    links: 0,
    runes: [],
    destroyed: [],
    shards: [],
    patterns: [],
    essences: [],
  };
  let next = profile;
  for (const item of items) {
    const r = applySalvage(registry, next, item, salvageRng(profile, item), opts);
    next = r.profile;
    out.scrap += r.scrap;
    out.dust += r.dust;
    out.links += r.links;
    out.runes.push(...r.runes);
    out.destroyed.push(...r.destroyed);
    out.shards.push(...r.shards);
    if (r.pattern) out.patterns.push(r.pattern);
    if (r.essence) out.essences.push(r.essence);
  }
  if (items.length > 0 && !isDiveActive(profile))
    next = { ...next, forgeCount: next.forgeCount + 1 };
  return { ...out, profile: next };
}

export interface BagInsertResult extends Melted {
  profile: DelveProfile;
  kept: GearItem[];
  salvaged: GearItem[];
  bagFull: boolean;
  newCodex: string[];
}

/**
 * Put fresh loot in the bag, honouring auto-salvage (off while the tutorial
 * runs) and bag capacity. What
 * doesn't fit or is set to auto-salvage melts (`melt`): mid-dive its yield
 * goes to the floor's haul (see the crafting spec), and a melted weapon's
 * runes leave by the parts rule (`opts.unsocket`, else the balance's).
 */
export function addLootToBag(
  registry: DataRegistry,
  profile: DelveProfile,
  items: GearItem[],
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): BagInsertResult {
  const bagSize = registry.getDelveBalance().loot.bagSize;
  const recorded = recordFinds(profile, items);
  const bag = recorded.profile.bag.slice();
  const kept: GearItem[] = [];
  const salvaged: GearItem[] = [];
  let bagFull = false;
  for (const item of items) {
    // Never while the tutorial runs: its set gear is the next steps' (see the tutorial spec).
    const auto =
      !profile.tutorial && item.rarity !== 'legendary' && profile.autoSalvage[item.rarity];
    if (auto || bag.length >= bagSize) {
      if (!auto) bagFull = true;
      salvaged.push(item);
    } else {
      bag.push(item);
      kept.push(item);
    }
  }
  const melted = melt(registry, { ...recorded.profile, bag }, salvaged, opts);
  return { ...melted, kept, salvaged, bagFull, newCodex: recorded.newCodex };
}

/** Mid-dive, all gear is locked, the forge and salvage too (see the weapon movesets spec). */
const AT_THE_ANVIL = 'Equip at the Anvil, between dives';
const FORGE_LOCKED = 'Forge at the Anvil, between dives';

/** Equip a bag item; a weapon brings its own moveset. Throws mid-dive. */
export function equipItem(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
): DelveProfile {
  if (isDiveActive(profile)) throw new Error(AT_THE_ANVIL);
  const item = profile.bag.find((i) => i.uid === uid);
  if (!item) throw new Error(`Item not in bag: ${uid}`);
  const previous = profile.equipped[item.slot];
  const bag = profile.bag.filter((i) => i.uid !== uid);
  if (previous) bag.push(previous);
  const equipped = { ...profile, bag, equipped: { ...profile.equipped, [item.slot]: item } };
  return applyTutorialEvents(registry, equipped, [{ type: 'equip', slot: item.slot }]);
}

/** Unequip into the bag (a weapon keeps its moveset). Throws mid-dive. */
export function unequipSlot(
  registry: DataRegistry,
  profile: DelveProfile,
  slot: GearSlot,
): DelveProfile {
  if (isDiveActive(profile)) throw new Error(AT_THE_ANVIL);
  const item = profile.equipped[slot];
  if (!item) return profile;
  if (profile.bag.length >= registry.getDelveBalance().loot.bagSize) throw new Error('Bag is full');
  const equipped = { ...profile.equipped };
  delete equipped[slot];
  return { ...profile, equipped, bag: [...profile.bag, item] };
}

export function toggleLock(profile: DelveProfile, uid: string): DelveProfile {
  const found = findItem(profile, uid);
  if (!found) throw new Error(`Item not found: ${uid}`);
  return replaceItem(profile, { ...found.item, locked: !found.item.locked });
}

export function setAutoSalvage(profile: DelveProfile, rarity: Rarity, on: boolean): DelveProfile {
  if (rarity === 'legendary') return profile;
  return { ...profile, autoSalvage: { ...profile.autoSalvage, [rarity]: on } };
}

/**
 * Salvage bag items (`melt`: each gives scrap, shards or an essence, its
 * pattern, Mana Dust off the pair, and a weapon's Links and runes by the
 * parts rule, `opts.unsocket` else the balance's). Locked or missing uids are
 * skipped. Mid-dive it melts nothing (auto-salvage of new loot,
 * `addLootToBag`, still runs).
 */
export function salvageItems(
  registry: DataRegistry,
  profile: DelveProfile,
  uids: string[],
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): Melted & { profile: DelveProfile; count: number } {
  const targets = new Set(uids);
  const melted = isDiveActive(profile)
    ? []
    : profile.bag.filter((item) => targets.has(item.uid) && !item.locked);
  const bag = profile.bag.filter((item) => !melted.includes(item));
  const res = melt(registry, melted.length > 0 ? { ...profile, bag } : profile, melted, opts);
  const events = melted.map((item) => ({ type: 'salvage', slot: item.slot }) as const);
  return {
    ...res,
    profile: applyTutorialEvents(registry, res.profile, events),
    count: melted.length,
  };
}

/** Bag items that are safe to melt: unlocked, not an upgrade (a weapon as a home), at or below `maxRarity`, and no weapon holding runes. */
export function salvageCandidates(
  registry: DataRegistry,
  profile: DelveProfile,
  maxRarity: Rarity,
): string[] {
  const depth = referenceDepth(profile);
  const cap = rarityIndex(maxRarity);
  return profile.bag
    .filter(
      (item) =>
        !item.locked &&
        item.rarity !== 'legendary' &&
        rarityIndex(item.rarity) <= cap &&
        weaponParts(registry, item).runes.length === 0 &&
        compareItem(profile.equipped, item, registry, depth, profile.pair).powerPct <= 0,
    )
    .map((i) => i.uid);
}

/** The slots `equipBest` fills: every one but the weapon's (it changes by hand: Equip, or Transfer). */
export const EQUIP_BEST_SLOTS: readonly GearSlot[] = GEAR_SLOTS.filter((s) => s !== 'weapon');

/** Greedily equip any bag item that raises Power, in `EQUIP_BEST_SLOTS`. Nothing mid-dive. */
export function equipBest(
  registry: DataRegistry,
  profile: DelveProfile,
): { profile: DelveProfile; equipped: GearItem[] } {
  if (isDiveActive(profile)) return { profile, equipped: [] };
  let current = profile;
  const changed = new Map<GearSlot, GearItem>();
  for (let pass = 0; pass < 2; pass++) {
    for (const slot of EQUIP_BEST_SLOTS) {
      let best: GearItem | null = null;
      let bestPower = profilePower(registry, current);
      for (const item of current.bag) {
        if (item.slot !== slot) continue;
        const power = profilePower(registry, equipItem(registry, current, item.uid));
        if (power > bestPower) {
          best = item;
          bestPower = power;
        }
      }
      if (best) {
        current = equipItem(registry, current, best.uid);
        changed.set(slot, best);
      }
    }
  }
  return { profile: current, equipped: [...changed.values()] };
}

/** One forge upgrade, for scrap. Refuses mid-dive (a stop's `takeStop` lifts the lock). */
export function upgradeGear(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
): ProfileActionResult {
  if (isDiveActive(profile)) return { ok: false, profile, reason: FORGE_LOCKED };
  const found = findItem(profile, uid);
  if (!found) return { ok: false, profile, reason: 'Item not found' };
  const cost = upgradeCost(registry, found.item);
  if (cost === null) return { ok: false, profile, reason: 'Already at max upgrade' };
  if (profile.scrap < cost) return { ok: false, profile, reason: 'Not enough scrap' };
  const item = applyUpgrade(registry, found.item);
  return {
    ok: true,
    item,
    profile: { ...replaceItem(profile, item), scrap: profile.scrap - cost },
  };
}

export function reforgeGear(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
  affixIndex: number,
): ProfileActionResult {
  if (isDiveActive(profile)) return { ok: false, profile, reason: FORGE_LOCKED };
  const found = findItem(profile, uid);
  if (!found) return { ok: false, profile, reason: 'Item not found' };
  if (affixIndex < 0 || affixIndex >= found.item.affixes.length)
    return { ok: false, profile, reason: 'No such affix' };
  const cost = reforgeCost(registry, found.item);
  if (profile.scrap < cost) return { ok: false, profile, reason: 'Not enough scrap' };
  const floor = rollFloor(registry, profile, found.item.mana);
  const item = reforgeAffix(registry, found.item, affixIndex, forgeRng(profile), floor);
  return {
    ok: true,
    item,
    profile: {
      ...replaceItem(profile, item),
      scrap: profile.scrap - cost,
      forgeCount: profile.forgeCount + 1,
    },
  };
}
