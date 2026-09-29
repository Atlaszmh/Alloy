import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type { DelveProfile } from '../types/delve.js';
import type { EquippedGear, GearItem, GearSlot, Rarity } from '../types/gear.js';
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
} from './profile-schema.js';
import { chooseStartingMana, fixChainsToPair, inPair, salvageDust, type ChainFix } from './pair.js';
import { defaultBasic, defaultChains } from '../arpg/abilities/resolve.js';
import {
  ABILITY_PAYMENTS,
  ABILITY_SLOTS,
  MOVE_KINDS,
  type AbilityBuild,
  type AbilityBuilds,
  type AbilitySlot,
  type Blow,
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
  /** The chains' moves the op changed to fit the pair (Realign), one notice each. */
  fixed?: ChainFix[];
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
    version: 5,
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
    chains: defaultChains(registry, weapon.mana, weapon.baseId),
    chainCaps: { ...registry.getDelveBalance().chains.cap },
    pair: { primary: null, secondary: null },
    manaDust: 0,
    reactionsSeen: [],
    dive: null,
  };
  return opts.primary ? chooseStartingMana(registry, profile, opts.primary).profile : profile;
}

/**
 * Set one skill's chain. Throws mid-dive, and on fewer than one move or more
 * than the skill's cap, an unknown kind, a form from another slot, anything
 * but one or two different elements (a blow: one), an element outside the
 * pair (once there is one), or an unknown payment.
 */
export function setChain<S extends ChainSkill>(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: S,
  chain: Chains[S],
): DelveProfile {
  const phase = profile.dive?.phase;
  if (phase === 'fighting' || phase === 'choosing') {
    throw new Error('Chains can only change between dives');
  }
  const blows = skill === 'basic' ? (chain as Blow[]) : null;
  const moves = blows ?? (chain as Chain).moves;
  const cap = profile.chainCaps[skill];
  if (moves.length < 1 || moves.length > cap) throw new Error(`A chain holds 1 to ${cap} moves`);
  const elements = (els: ManaType[]) => {
    if (els.length < 1 || els.length > 2 || new Set(els).size !== els.length)
      throw new Error('Pick one or two different elements');
    if (!els.every((e) => e in registry.getArpgData().mana)) throw new Error('Unknown element');
    if (!els.every((e) => inPair(profile, e))) throw new Error('Pick from your two elements');
  };
  for (const m of moves) if (!MOVE_KINDS.includes(m.kind)) throw new Error(`Bad kind ${m.kind}`);
  if (blows) {
    for (const b of blows) elements([b.element]);
    return { ...profile, chains: { ...profile.chains, basic: blows.map((b) => ({ ...b })) } };
  }
  const { payment } = chain as Chain;
  for (const m of (chain as Chain).moves) {
    const form = registry.getForm(m.form);
    if (form.slot !== skill) throw new Error(`${form.name} is not a ${skill} form`);
    elements(m.elements);
  }
  if (!ABILITY_PAYMENTS.includes(payment)) throw new Error(`Bad payment ${payment}`);
  const copy = (chain as Chain).moves.map((m) => ({ ...m, elements: [...m.elements] }));
  return { ...profile, chains: { ...profile.chains, [skill]: { moves: copy, payment } } };
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
export function buildChains(
  registry: DataRegistry,
  builds: AbilityBuilds,
): Pick<Chains, AbilitySlot> {
  const [primary, defensive, ultimate] = ABILITY_SLOTS.map((slot) =>
    chainFromBuild(registry, builds[slot]),
  );
  return { primary, defensive, ultimate };
}

/** A save read back: the profile, and the moves a migration changed (for a notice each). */
export interface ParsedDelveProfile {
  profile: DelveProfile;
  fixed: ChainFix[];
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
 * Validate an unknown JSON blob as a save, migrating older ones (2 → 3 → 4 → 5).
 * To 4: a primary from the gear, no secondary, no Mana Dust. To 5: each
 * build its form's default chain shifted by its weight (`chainFromBuild`),
 * the weapon's default basic chain on the pair, the balance's caps, and every
 * move fixed to the pair. A dive in progress stays. Null when it doesn't fit.
 */
export function parseDelveProfile(registry: DataRegistry, raw: unknown): ParsedDelveProfile | null {
  const parsed = DelveProfileSchema.safeParse(raw);
  if (parsed.success) return { profile: parsed.data as DelveProfile, fixed: [] };
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
  return fixChainsToPair({
    ...rest,
    version: 5,
    chains,
    chainCaps: { ...registry.getDelveBalance().chains.cap },
  } as DelveProfile);
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
  return heroPower(
    profile.equipped,
    registry,
    referenceDepth(profile),
    profile.chains,
    profile.pair,
  );
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
  let bagFull = false;
  for (const item of items) {
    const auto = item.rarity !== 'legendary' && profile.autoSalvage[item.rarity];
    if (auto || bag.length >= bagSize) {
      if (!auto) bagFull = true;
      salvaged.push(item);
      scrap += salvageValue(registry, item);
      dust += salvageDust(registry, item, profile.pair);
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
      stats: { ...recorded.profile.stats, scrapEarned: recorded.profile.stats.scrapEarned + scrap },
    },
    kept,
    salvaged,
    scrap,
    dust,
    bagFull,
    newCodex: recorded.newCodex,
  };
}

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

/** Salvage bag items. Locked or missing uids are skipped. Gear outside the pair also gives Mana Dust. */
export function salvageItems(
  registry: DataRegistry,
  profile: DelveProfile,
  uids: string[],
): { profile: DelveProfile; scrap: number; dust: number; count: number } {
  const targets = new Set(uids);
  let scrap = 0;
  let dust = 0;
  let count = 0;
  const bag = profile.bag.filter((item) => {
    if (!targets.has(item.uid) || item.locked) return true;
    scrap += salvageValue(registry, item);
    dust += salvageDust(registry, item, profile.pair);
    count++;
    return false;
  });
  return {
    profile: {
      ...profile,
      bag,
      scrap: profile.scrap + scrap,
      manaDust: profile.manaDust + dust,
      stats: { ...profile.stats, scrapEarned: profile.stats.scrapEarned + scrap },
    },
    scrap,
    dust,
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
        compareItem(profile.equipped, item, registry, depth, undefined, profile.pair).powerPct <= 0,
    )
    .map((i) => i.uid);
}

/** Greedily equip any bag item that raises Power. */
export function equipBest(
  registry: DataRegistry,
  profile: DelveProfile,
): { profile: DelveProfile; equipped: GearItem[] } {
  const depth = referenceDepth(profile);
  let current = profile;
  const changed = new Map<GearSlot, GearItem>();
  for (let pass = 0; pass < 2; pass++) {
    for (const slot of GEAR_SLOTS) {
      let best: GearItem | null = null;
      let bestPower = heroPower(current.equipped, registry, depth, undefined, current.pair);
      for (const item of current.bag) {
        if (item.slot !== slot) continue;
        const power = heroPower(
          { ...current.equipped, [slot]: item },
          registry,
          depth,
          undefined,
          current.pair,
        );
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
  const consumed = new Set(uids);
  const recorded = recordFinds(
    {
      ...profile,
      bag: [...profile.bag.filter((i) => !consumed.has(i.uid)), result],
      scrap: profile.scrap - cost,
      nextUid: profile.nextUid + 1,
      forgeCount: profile.forgeCount + 1,
    },
    [result],
  );
  return { ok: true, item: result, profile: recorded.profile };
}
