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
  checkFusion,
  fuseCost,
  fuseItems,
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
} from './profile-schema.js';
import { chooseStartingMana, fixChainsToPair, salvageDust, type ChainFix } from './pair.js';
import { defaultBasic, defaultChains } from '../arpg/abilities/resolve.js';
import { baseSlots, carriedSkills, defaultChain, extraSlots, movesetOf } from '../loot/moveset.js';
import {
  ABILITY_SLOTS,
  CHAIN_SKILLS,
  type AbilityBuild,
  type AbilityBuilds,
  type AbilitySlot,
  type Chain,
  type Chains,
  type ChainSkill,
  type MoveKind,
} from '../types/ability.js';

export interface ProfileActionResult {
  ok: boolean;
  profile: DelveProfile;
  reason?: string;
  item?: GearItem;
  /** The chains' moves the op changed to fit the pair (Realign), a fix each. */
  fixed?: ChainFix[];
  /** Links the op gave back (a fuse's weapons' extra slots, a transfer's). */
  links?: number;
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
    version: 6,
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
}

/** A version 5 save, as its frozen schema reads it. */
type ProfileV5 = Omit<DelveProfile, 'version' | 'links'> & {
  version: 5;
  chains: Chains;
  chainCaps: Record<ChainSkill, number>;
};

/**
 * Every weapon's moveset fitted to the data: a weapon without one gets its
 * base defaults in its own mana; a chain its rarity no longer carries is
 * dropped, a newly carried one gets its base default; and a basic chain's
 * slots are raised to its weapon's string.
 */
function fitMovesets(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const fit = (item: GearItem): GearItem => {
    if (item.slot !== 'weapon') return item;
    const old = movesetOf(registry, item);
    const moveset: Moveset = { chains: {}, slots: {} };
    for (const skill of carriedSkills(registry, item.rarity)) {
      const base = baseSlots(registry, item.baseId, skill);
      const chain = old.chains[skill];
      const set = moveset.chains as Record<ChainSkill, unknown>;
      set[skill] = chain ?? defaultChain(registry, skill, item.baseId, item.mana, base);
      moveset.slots[skill] = chain ? Math.max(old.slots[skill]!, base) : base;
    }
    return { ...item, moveset };
  };
  const equipped: EquippedGear = {};
  for (const slot of GEAR_SLOTS) {
    const item = profile.equipped[slot];
    if (item) equipped[slot] = fit(item);
  }
  return { ...profile, equipped, bag: profile.bag.map(fit) };
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
function fromV5(registry: DataRegistry, old: ProfileV5): ParsedDelveProfile {
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
  const movesetReset = !weapon && JSON.stringify(chains) !== JSON.stringify(unarmed);
  const profile = fitMovesets(registry, { ...rest, version: 6, links, equipped });
  return { profile, fixed: [], dropped, movesetReset };
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
 * 5 → 6), and fit every weapon's moveset to the data (`fitMovesets`). To 4:
 * a primary from the gear, no secondary, no Mana Dust. To 5: each build its
 * form's default chain shifted by its weight (`chainFromBuild`) and the
 * weapon's default basic chain on the pair. To 6: the chains move onto the
 * weapon (`fromV5`), and from a version 4 or older save every move is then
 * fixed to the pair. A dive in progress stays. Null when it doesn't fit.
 */
export function parseDelveProfile(registry: DataRegistry, raw: unknown): ParsedDelveProfile | null {
  const parsed = DelveProfileSchema.safeParse(raw);
  if (parsed.success)
    return {
      profile: fitMovesets(registry, parsed.data as DelveProfile),
      fixed: [],
      dropped: [],
      movesetReset: false,
    };
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
  const res = fromV5(registry, {
    ...rest,
    version: 5,
    chains,
    chainCaps: { ...registry.getDelveBalance().chains.cap },
  } as ProfileV5);
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
}

/** Put fresh loot in the bag, honouring auto-salvage and bag capacity. */
export function addLootToBag(
  registry: DataRegistry,
  profile: DelveProfile,
  items: GearItem[],
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
      links += extraSlots(registry, item);
    } else {
      bag.push(item);
      kept.push(item);
    }
  }
  return {
    profile: {
      ...recorded.profile,
      bag,
      scrap: recorded.profile.scrap + scrap,
      manaDust: recorded.profile.manaDust + dust,
      links: recorded.profile.links + links,
      stats: { ...recorded.profile.stats, scrapEarned: recorded.profile.stats.scrapEarned + scrap },
    },
    kept,
    salvaged,
    scrap,
    dust,
    links,
    bagFull,
    newCodex: recorded.newCodex,
  };
}

/** Equip a bag item; a weapon brings its own moveset. */
export function equipItem(
  _registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
): DelveProfile {
  const item = profile.bag.find((i) => i.uid === uid);
  if (!item) throw new Error(`Item not in bag: ${uid}`);
  const previous = profile.equipped[item.slot];
  const bag = profile.bag.filter((i) => i.uid !== uid);
  if (previous) bag.push(previous);
  return { ...profile, bag, equipped: { ...profile.equipped, [item.slot]: item } };
}

/** Unequip into the bag (a weapon keeps its moveset). */
export function unequipSlot(
  registry: DataRegistry,
  profile: DelveProfile,
  slot: GearSlot,
): DelveProfile {
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
 * also gives Mana Dust, and a weapon a Link for each extra slot.
 */
export function salvageItems(
  registry: DataRegistry,
  profile: DelveProfile,
  uids: string[],
): { profile: DelveProfile; scrap: number; dust: number; links: number; count: number } {
  const targets = new Set(uids);
  let scrap = 0;
  let dust = 0;
  let links = 0;
  let count = 0;
  const bag = profile.bag.filter((item) => {
    if (!targets.has(item.uid) || item.locked) return true;
    scrap += salvageValue(registry, item);
    dust += salvageDust(registry, item, profile.pair);
    links += extraSlots(registry, item);
    count++;
    return false;
  });
  return {
    profile: {
      ...profile,
      bag,
      scrap: profile.scrap + scrap,
      manaDust: profile.manaDust + dust,
      links: profile.links + links,
      stats: { ...profile.stats, scrapEarned: profile.stats.scrapEarned + scrap },
    },
    scrap,
    dust,
    links,
    count,
  };
}

/** Bag items that are safe to melt: unlocked, not an upgrade, at or below `maxRarity`. */
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
        compareItem(profile.equipped, item, registry, depth, profile.pair).powerPct <= 0,
    )
    .map((i) => i.uid);
}

/** Greedily equip any bag item that raises Power (a weapon with its own moveset). */
export function equipBest(
  registry: DataRegistry,
  profile: DelveProfile,
): { profile: DelveProfile; equipped: GearItem[] } {
  let current = profile;
  const changed = new Map<GearSlot, GearItem>();
  for (let pass = 0; pass < 2; pass++) {
    for (const slot of GEAR_SLOTS) {
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

export function upgradeGear(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
): ProfileActionResult {
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

/**
 * Fuse three bag items of one rarity into one of the next (`fuseItems`), for
 * scrap. The inputs' weapon extra slots come back as Links, as salvaging them
 * would give (`links`); a fused weapon rolls its own moveset.
 */
export function fuseGear(
  registry: DataRegistry,
  profile: DelveProfile,
  uids: string[],
): ProfileActionResult {
  const items = uids.map((uid) => profile.bag.find((i) => i.uid === uid));
  if (items.some((i) => !i)) return { ok: false, profile, reason: 'Fuse items from your bag' };
  const inputs = items as GearItem[];
  const check = checkFusion(inputs);
  if (!check.ok) return { ok: false, profile, reason: check.reason };
  const cost = fuseCost(registry, inputs);
  if (profile.scrap < cost) return { ok: false, profile, reason: 'Not enough scrap' };

  const result = fuseItems(registry, inputs, `g${profile.nextUid}`, forgeRng(profile));
  const links = inputs.reduce((sum, i) => sum + extraSlots(registry, i), 0);
  const consumed = new Set(uids);
  const recorded = recordFinds(
    {
      ...profile,
      bag: [...profile.bag.filter((i) => !consumed.has(i.uid)), result],
      scrap: profile.scrap - cost,
      links: profile.links + links,
      nextUid: profile.nextUid + 1,
      forgeCount: profile.forgeCount + 1,
    },
    [result],
  );
  return { ok: true, item: result, profile: recorded.profile, links };
}
