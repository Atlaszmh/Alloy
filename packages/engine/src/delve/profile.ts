import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type { DelveProfile } from '../types/delve.js';
import type { EquippedGear, GearItem, GearSlot, Moveset, Rarity } from '../types/gear.js';
import { GEAR_SLOTS } from '../types/gear.js';
import { MANA_TYPES, type ManaType } from '../types/mana.js';
import { RARITY_ORDER, rarityIndex } from '../types/gem.js';
import { generateItem } from '../loot/item-generator.js';
import {
  applyUpgrade,
  reforgeAffix,
  reforgeCost,
  salvageValue,
  upgradeCost,
} from '../loot/smithing.js';
import { compareItem, computeAttunement, heroPower } from './hero-stats.js';
import {
  DelveProfileSchema,
  DelveProfileV2Schema,
  DelveProfileV3Schema,
  DelveProfileV4Schema,
  DelveProfileV5Schema,
  DelveProfileV6Schema,
} from './profile-schema.js';
import { chooseStartingMana, fixChainsToPair, salvageDust, type ChainFix } from './pair.js';
import { isDiveActive } from './dive.js';
import { settleParts, type SetChainsOptions } from './runes.js';
import { sameChain } from './moveset.js';
import { defaultBasic, defaultChains } from '../arpg/abilities/resolve.js';
import { baseSlots, carriedSkills, defaultChain, movesetOf, weaponParts } from '../loot/moveset.js';
import { addToPouch, socketCap } from '../loot/runes.js';
import type { RuneRef } from '../types/rune.js';
import {
  ABILITY_SLOTS,
  CHAIN_SKILLS,
  type AbilityBuild,
  type AbilityBuilds,
  type AbilitySlot,
  type Blow,
  type Chain,
  type Chains,
  type ChainSkill,
  type Move,
  type MoveKind,
} from '../types/ability.js';

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
  const profile: DelveProfile = {
    version: 7,
    seed: seed | 0,
    diveCount: 0,
    forgeCount: 0,
    nextUid: 2,
    equipped: { weapon, chest },
    bag: [],
    scrap: 0,
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
    pity: 0,
    firstBossLegendaryGiven: false,
    autoSalvage: perRarity(false),
    pair: { primary: null, secondary: null },
    manaDust: 0,
    links: 0,
    runes: {},
    reactionsSeen: [],
    dive: null,
  };
  return opts.primary ? chooseStartingMana(registry, profile, opts.primary).profile : profile;
}

/** `profile` with its equipped weapon's moveset replaced (it has a weapon). */
export function withMoveset(profile: DelveProfile, moveset: Moveset): DelveProfile {
  const weapon = profile.equipped.weapon!;
  return { ...profile, equipped: { ...profile.equipped, weapon: { ...weapon, moveset } } };
}

const STRENGTH: MoveKind[] = ['light', 'medium', 'heavy'];

/**
 * A version 4 build as a chain: its form's default chain, each move a step
 * lighter for a light build (weight −2 or −1) and a step heavier for a heavy
 * one (+1 or +2), within light..heavy, with the build's elements and payment.
 */
export function chainFromBuild(registry: DataRegistry, build: AbilityBuild): Chain {
  const shift = Math.sign(build.weight);
  return {
    moves: registry.getForm(build.form).defaultChain.map((kind) => ({
      kind: STRENGTH[Math.max(0, Math.min(2, STRENGTH.indexOf(kind) + shift))],
      form: build.form,
      elements: [...build.elements],
    })),
    payment: build.payment,
  };
}

/** Version 4 builds as the three ability chains. */
function buildChains(registry: DataRegistry, builds: AbilityBuilds): Pick<Chains, AbilitySlot> {
  const [primary, defensive, ultimate] = ABILITY_SLOTS.map((slot) =>
    chainFromBuild(registry, builds[slot]),
  );
  return { primary, defensive, ultimate };
}

/** A save read back: the profile, and what a migration changed. */
export interface ParsedDelveProfile {
  profile: DelveProfile;
  /** The moves a migration fixed to the pair, a fix each. */
  fixed: ChainFix[];
  /** The chains the migration to version 6 dropped: the equipped weapon's rarity doesn't carry them. */
  dropped: ChainSkill[];
  /** An unarmed save's built chains were reset to the unarmed defaults (no weapon holds them). */
  movesetReset: boolean;
  /** Runes a load-time trim destroyed (in 'destroy' mode), for a notice each. */
  runesLost: RuneRef[];
}

/** A version 5 save, as its frozen schema reads it. */
type ProfileV5 = Omit<DelveProfile, 'version' | 'links' | 'runes'> & {
  version: 5;
  chains: Chains;
  chainCaps: Record<ChainSkill, number>;
};

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
 * ('destroy', listed in `runesLost`). The pouch drops ids the data doesn't know.
 */
function fitMovesets(
  registry: DataRegistry,
  profile: DelveProfile,
): { profile: DelveProfile; runesLost: RuneRef[] } {
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
    const carried = carriedSkills(registry, item.rarity);
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
    profile: {
      ...profile,
      equipped,
      bag,
      links: profile.links + links,
      runes: pay ? addToPouch(pouch, off) : pouch,
    },
    runesLost: pay ? [] : off,
  };
}

/** A chain's length: its blows or its moves. */
function chainLength(chain: Chains[ChainSkill]): number {
  return Array.isArray(chain) ? chain.length : chain.moves.length;
}

/**
 * A version 5 save as version 6: the equipped weapon takes the profile's
 * chains, each at slots of its length (at least its base), but for the chains
 * its rarity doesn't carry, which are dropped (their moves past one slot come
 * back as Links); every other weapon gets its base defaults. An unarmed save
 * keeps no chains: the unarmed defaults follow the pair.
 */
function fromV5(
  registry: DataRegistry,
  old: Omit<ProfileV5, 'chainCaps'> & Partial<Pick<ProfileV5, 'chainCaps'>>,
): ParsedDelveProfile {
  const { chains, chainCaps: _caps, ...rest } = old;
  const weapon = old.equipped.weapon;
  const dropped: ChainSkill[] = [];
  let links = 0;
  let equipped = old.equipped;
  if (weapon) {
    const carried = carriedSkills(registry, weapon.rarity);
    const moveset: Moveset = { chains: {}, slots: {} };
    for (const skill of CHAIN_SKILLS) {
      const length = chainLength(chains[skill]);
      const base = baseSlots(registry, weapon.baseId, skill);
      if (!carried.includes(skill)) {
        dropped.push(skill);
        links += Math.max(0, length - base);
        continue;
      }
      (moveset.chains as Record<ChainSkill, unknown>)[skill] = chains[skill];
      moveset.slots[skill] = Math.max(length, base);
    }
    equipped = { ...equipped, weapon: { ...weapon, moveset } };
  }
  const primary = old.pair.primary ?? 'fire';
  const unarmed = {
    ...defaultChains(registry, primary, null),
    basic: defaultBasic(registry, null, primary, old.pair.secondary),
  };
  const movesetReset = !weapon && CHAIN_SKILLS.some((s) => !sameChain(chains[s], unarmed[s]));
  const fitted = fitMovesets(registry, { ...rest, version: 7, links, runes: {}, equipped });
  return { ...fitted, fixed: [], dropped, movesetReset };
}

/** Version 2 (spell bar): everything kept but the spells. It had no ability builds. */
function fromV2(raw: unknown) {
  const old = DelveProfileV2Schema.safeParse(raw);
  if (!old.success) return null;
  const { skillSlots: _spells, ...rest } = old.data;
  return rest;
}

/**
 * A migrated save's primary: the element with the most attunement from its
 * equipped gear (ties: the weapon's mana, then MANA_TYPES order), or null
 * with nothing equipped (the choice screen then shows).
 */
function migratedPrimary(registry: DataRegistry, equipped: EquippedGear): ManaType | null {
  const att = computeAttunement(equipped, registry);
  const top = Math.max(...MANA_TYPES.map((m) => att[m]));
  if (top <= 0) return null;
  const weapon = equipped.weapon?.mana;
  if (weapon && att[weapon] === top) return weapon;
  return MANA_TYPES.find((m) => att[m] === top)!;
}

/**
 * Validate an unknown JSON blob as a save, migrating older ones (2 → 3 → 4 →
 * 5 → 6 → 7), and fit every weapon's moveset to the data (`fitMovesets`). To 4:
 * a primary from the gear, no secondary, no Mana Dust. To 5: each build its
 * form's default chain shifted by its weight (`chainFromBuild`) and the
 * weapon's default basic chain on the pair. To 6: the chains move onto the
 * weapon (`fromV5`), and from a version 4 or older save every move is then
 * fixed to the pair. To 7: an empty rune pouch. A dive in progress stays.
 * Null when it doesn't fit.
 */
export function parseDelveProfile(registry: DataRegistry, raw: unknown): ParsedDelveProfile | null {
  const parsed = DelveProfileSchema.safeParse(raw);
  const v6 = parsed.success ? null : DelveProfileV6Schema.safeParse(raw);
  const current = parsed.success
    ? (parsed.data as DelveProfile)
    : v6?.success
      ? ({ ...v6.data, version: 7, runes: {} } as DelveProfile)
      : null;
  if (current)
    return { ...fitMovesets(registry, current), fixed: [], dropped: [], movesetReset: false };
  const v5 = DelveProfileV5Schema.safeParse(raw);
  if (v5.success) return fromV5(registry, v5.data as ProfileV5);
  const v4 = DelveProfileV4Schema.safeParse(raw);
  const old = v4.success ? v4.data : fromV3(registry, raw);
  if (!old) return null;
  const { abilities, ...rest } = old;
  const { primary, secondary } = old.pair;
  const weapon = (old.equipped as EquippedGear).weapon;
  const element = primary ?? weapon?.mana ?? 'fire';
  // A version 2 save had no builds: it starts from its new primary's defaults.
  const chains: Chains = abilities
    ? {
        basic: defaultBasic(registry, weapon?.baseId ?? null, element, secondary),
        ...buildChains(registry, abilities),
      }
    : defaultChains(registry, element, weapon?.baseId ?? null);
  const res = fromV5(registry, { ...rest, version: 5, chains } as Omit<ProfileV5, 'chainCaps'>);
  const { profile, fixed } = fixChainsToPair(registry, res.profile);
  return { ...res, profile, fixed };
}

/** A version 3 or 2 save as version 4 (see `parseDelveProfile`); version 2 has no builds. */
function fromV3(registry: DataRegistry, raw: unknown) {
  const v3 = DelveProfileV3Schema.safeParse(raw);
  const old = v3.success ? v3.data : fromV2(raw);
  if (!old) return null;
  const primary = migratedPrimary(registry, old.equipped as EquippedGear);
  return {
    ...old,
    version: 4 as const,
    abilities: 'abilities' in old ? old.abilities : undefined,
    pair: { primary, secondary: null },
    manaDust: 0,
  };
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

function forgeRng(profile: DelveProfile): SeededRNG {
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

export interface BagInsertResult {
  profile: DelveProfile;
  kept: GearItem[];
  salvaged: GearItem[];
  scrap: number;
  /** Mana Dust from the melted items outside the pair. */
  dust: number;
  /** Links from the melted weapons' extra slots. */
  links: number;
  bagFull: boolean;
  newCodex: string[];
  /** Runes back to the pouch from melted weapons' sockets (see the runes spec). */
  runes: RuneRef[];
  /** Runes the melted weapons' sockets destroyed. */
  destroyed: RuneRef[];
}

/**
 * Put fresh loot in the bag, honouring auto-salvage and bag capacity. A melted
 * weapon gives its parts (`weaponParts`): a Link for each extra slot and open
 * socket, and its runes by the parts rule (`opts.unsocket`, else the balance's).
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
  let scrap = 0;
  let dust = 0;
  let links = 0;
  let bagFull = false;
  for (const item of items) {
    const auto = item.rarity !== 'legendary' && profile.autoSalvage[item.rarity];
    if (auto || bag.length >= bagSize) {
      if (!auto) bagFull = true;
      salvaged.push(item);
      scrap += salvageValue(registry, item);
      dust += salvageDust(registry, item, profile.pair);
      links += weaponParts(registry, item).links;
    } else {
      bag.push(item);
      kept.push(item);
    }
  }
  const parts = salvaged.flatMap((item) => weaponParts(registry, item).runes);
  const settled = settleParts(registry, recorded.profile.runes, parts, opts.unsocket);
  return {
    profile: {
      ...recorded.profile,
      bag,
      scrap: recorded.profile.scrap + scrap,
      manaDust: recorded.profile.manaDust + dust,
      links: recorded.profile.links + links,
      runes: settled.pouch,
      stats: { ...recorded.profile.stats, scrapEarned: recorded.profile.stats.scrapEarned + scrap },
    },
    kept,
    salvaged,
    scrap,
    dust,
    links,
    runes: settled.runes,
    destroyed: settled.destroyed,
    bagFull,
    newCodex: recorded.newCodex,
  };
}

/** Mid-dive, all gear is locked, the forge and salvage too (see the weapon movesets spec). */
const AT_THE_ANVIL = 'Equip at the Anvil, between dives';
const FORGE_LOCKED = 'Forge at the Anvil, between dives';

/** Equip a bag item; a weapon brings its own moveset. Throws mid-dive. */
export function equipItem(
  _registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
): DelveProfile {
  if (isDiveActive(profile)) throw new Error(AT_THE_ANVIL);
  const item = profile.bag.find((i) => i.uid === uid);
  if (!item) throw new Error(`Item not in bag: ${uid}`);
  const previous = profile.equipped[item.slot];
  const bag = profile.bag.filter((i) => i.uid !== uid);
  if (previous) bag.push(previous);
  return { ...profile, bag, equipped: { ...profile.equipped, [item.slot]: item } };
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
 * Salvage bag items. Locked or missing uids are skipped. Gear outside the pair
 * also gives Mana Dust, and a weapon its parts (`weaponParts`): a Link for each
 * extra slot and open socket, and its runes by the parts rule (`opts.unsocket`,
 * else the balance's). Mid-dive it melts nothing (auto-salvage of new loot,
 * `addLootToBag`, still runs).
 */
export function salvageItems(
  registry: DataRegistry,
  profile: DelveProfile,
  uids: string[],
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): {
  profile: DelveProfile;
  scrap: number;
  dust: number;
  links: number;
  count: number;
  /** Runes back to the pouch from the melted weapons' sockets (see the runes spec). */
  runes: RuneRef[];
  /** Runes their sockets destroyed. */
  destroyed: RuneRef[];
} {
  if (isDiveActive(profile))
    return { profile, scrap: 0, dust: 0, links: 0, count: 0, runes: [], destroyed: [] };
  const targets = new Set(uids);
  let scrap = 0;
  let dust = 0;
  let links = 0;
  const melted: GearItem[] = [];
  const bag = profile.bag.filter((item) => {
    if (!targets.has(item.uid) || item.locked) return true;
    scrap += salvageValue(registry, item);
    dust += salvageDust(registry, item, profile.pair);
    links += weaponParts(registry, item).links;
    melted.push(item);
    return false;
  });
  const parts = melted.flatMap((item) => weaponParts(registry, item).runes);
  const settled = settleParts(registry, profile.runes, parts, opts.unsocket);
  return {
    profile: {
      ...profile,
      bag,
      scrap: profile.scrap + scrap,
      manaDust: profile.manaDust + dust,
      links: profile.links + links,
      runes: settled.pouch,
      stats: { ...profile.stats, scrapEarned: profile.stats.scrapEarned + scrap },
    },
    scrap,
    dust,
    links,
    count: melted.length,
    runes: settled.runes,
    destroyed: settled.destroyed,
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
  const item = reforgeAffix(registry, found.item, affixIndex, forgeRng(profile));
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
