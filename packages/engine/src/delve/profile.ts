import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem, GearSlot, Rarity } from '../types/gear.js';
import { GEAR_SLOTS } from '../types/gear.js';
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
import { compareItem, heroPower } from './hero-stats.js';
import { DelveProfileSchema, DelveProfileV2Schema } from './profile-schema.js';
import { defaultAbilities } from '../arpg/abilities/resolve.js';
import { ABILITY_PAYMENTS, ABILITY_WEIGHTS, type AbilityBuild, type AbilitySlot } from '../types/ability.js';

export interface ProfileActionResult {
  ok: boolean;
  profile: DelveProfile;
  reason?: string;
  item?: GearItem;
}

function perRarity<T>(value: T): Record<Rarity, T> {
  return Object.fromEntries(RARITY_ORDER.map((r) => [r, value])) as Record<Rarity, T>;
}

export function createDelveProfile(registry: DataRegistry, seed: number): DelveProfile {
  const rng = new SeededRNG(seed).fork('starter');
  const weapon = generateItem(
    registry,
    { uid: 'g0', ilvl: 1, rarity: 'common', slot: 'weapon', baseId: 'sword', mana: 'fire' },
    rng,
  );
  const chest = generateItem(registry, { uid: 'g1', ilvl: 1, rarity: 'common', slot: 'chest', mana: 'earth' }, rng);
  const profile: DelveProfile = {
    version: 3,
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
    abilities: defaultAbilities(weapon.mana),
    reactionsSeen: [],
    dive: null,
  };
  return profile;
}

/**
 * Set one ability build. Throws on a form from another slot, anything but
 * one or two distinct elements, or an unknown weight or payment.
 */
export function setAbility(registry: DataRegistry, profile: DelveProfile, slot: AbilitySlot, build: AbilityBuild): DelveProfile {
  const form = registry.getForm(build.form);
  if (form.slot !== slot) throw new Error(`${form.name} is not a ${slot} form`);
  const els = build.elements;
  if (els.length < 1 || els.length > 2 || new Set(els).size !== els.length) throw new Error('Pick one or two different elements');
  if (!els.every((e) => e in registry.getArpgData().mana)) throw new Error('Unknown element');
  if (!ABILITY_WEIGHTS.includes(build.weight)) throw new Error(`Bad weight ${build.weight}`);
  if (!ABILITY_PAYMENTS.includes(build.payment)) throw new Error(`Bad payment ${build.payment}`);
  return { ...profile, abilities: { ...profile.abilities, [slot]: { ...build, elements: [...els] } } };
}

/** Validate an unknown JSON blob as a save. Returns null when it doesn't fit. */
export function parseDelveProfile(raw: unknown): DelveProfile | null {
  const parsed = DelveProfileSchema.safeParse(raw);
  if (parsed.success) return parsed.data as DelveProfile;
  // Version 2 (spell bar): keep everything, give default ability builds.
  const old = DelveProfileV2Schema.safeParse(raw);
  if (!old.success) return null;
  const { skillSlots: _spells, ...rest } = old.data;
  return {
    ...rest,
    version: 3,
    abilities: defaultAbilities(rest.equipped.weapon?.mana ?? 'fire'),
  } as DelveProfile;
}

/** Depth used as the yardstick for Power and comparisons. */
export function referenceDepth(profile: DelveProfile): number {
  return Math.max(1, profile.dive?.depth ?? profile.bestDepth);
}

export function profilePower(registry: DataRegistry, profile: DelveProfile): number {
  return heroPower(profile.equipped, registry, referenceDepth(profile), profile.abilities);
}

export function findItem(profile: DelveProfile, uid: string): { item: GearItem; where: 'bag' | 'equipped' } | null {
  const inBag = profile.bag.find((i) => i.uid === uid);
  if (inBag) return { item: inBag, where: 'bag' };
  for (const slot of GEAR_SLOTS) {
    const item = profile.equipped[slot];
    if (item?.uid === uid) return { item, where: 'equipped' };
  }
  return null;
}

/** Replace an item (matched by uid) wherever it lives. */
function replaceItem(profile: DelveProfile, item: GearItem): DelveProfile {
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
export function recordFinds(profile: DelveProfile, items: GearItem[]): { profile: DelveProfile; newCodex: string[] } {
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
  bagFull: boolean;
  newCodex: string[];
}

/** Put fresh loot in the bag, honouring auto-salvage and bag capacity. */
export function addLootToBag(registry: DataRegistry, profile: DelveProfile, items: GearItem[]): BagInsertResult {
  const bagSize = registry.getDelveBalance().loot.bagSize;
  const recorded = recordFinds(profile, items);
  const bag = recorded.profile.bag.slice();
  const kept: GearItem[] = [];
  const salvaged: GearItem[] = [];
  let scrap = 0;
  let bagFull = false;
  for (const item of items) {
    const auto = item.rarity !== 'legendary' && profile.autoSalvage[item.rarity];
    if (auto || bag.length >= bagSize) {
      if (!auto) bagFull = true;
      salvaged.push(item);
      scrap += salvageValue(registry, item);
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
      stats: { ...recorded.profile.stats, scrapEarned: recorded.profile.stats.scrapEarned + scrap },
    },
    kept,
    salvaged,
    scrap,
    bagFull,
    newCodex: recorded.newCodex,
  };
}

export function equipItem(_registry: DataRegistry, profile: DelveProfile, uid: string): DelveProfile {
  const item = profile.bag.find((i) => i.uid === uid);
  if (!item) throw new Error(`Item not in bag: ${uid}`);
  const previous = profile.equipped[item.slot];
  const bag = profile.bag.filter((i) => i.uid !== uid);
  if (previous) bag.push(previous);
  return { ...profile, bag, equipped: { ...profile.equipped, [item.slot]: item } };
}

export function unequipSlot(registry: DataRegistry, profile: DelveProfile, slot: GearSlot): DelveProfile {
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

/** Salvage bag items. Locked or missing uids are skipped. */
export function salvageItems(
  registry: DataRegistry,
  profile: DelveProfile,
  uids: string[],
): { profile: DelveProfile; scrap: number; count: number } {
  const targets = new Set(uids);
  let scrap = 0;
  let count = 0;
  const bag = profile.bag.filter((item) => {
    if (!targets.has(item.uid) || item.locked) return true;
    scrap += salvageValue(registry, item);
    count++;
    return false;
  });
  return {
    profile: {
      ...profile,
      bag,
      scrap: profile.scrap + scrap,
      stats: { ...profile.stats, scrapEarned: profile.stats.scrapEarned + scrap },
    },
    scrap,
    count,
  };
}

/** Bag items that are safe to melt: unlocked, not an upgrade, at or below `maxRarity`. */
export function salvageCandidates(registry: DataRegistry, profile: DelveProfile, maxRarity: Rarity): string[] {
  const depth = referenceDepth(profile);
  const cap = rarityIndex(maxRarity);
  return profile.bag
    .filter(
      (item) =>
        !item.locked &&
        item.rarity !== 'legendary' &&
        rarityIndex(item.rarity) <= cap &&
        compareItem(profile.equipped, item, registry, depth).powerPct <= 0,
    )
    .map((i) => i.uid);
}

/** Greedily equip any bag item that raises Power. */
export function equipBest(registry: DataRegistry, profile: DelveProfile): { profile: DelveProfile; equipped: GearItem[] } {
  const depth = referenceDepth(profile);
  let current = profile;
  const changed = new Map<GearSlot, GearItem>();
  for (let pass = 0; pass < 2; pass++) {
    for (const slot of GEAR_SLOTS) {
      let best: GearItem | null = null;
      let bestPower = heroPower(current.equipped, registry, depth);
      for (const item of current.bag) {
        if (item.slot !== slot) continue;
        const power = heroPower({ ...current.equipped, [slot]: item }, registry, depth);
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

export function upgradeGear(registry: DataRegistry, profile: DelveProfile, uid: string): ProfileActionResult {
  const found = findItem(profile, uid);
  if (!found) return { ok: false, profile, reason: 'Item not found' };
  const cost = upgradeCost(registry, found.item);
  if (cost === null) return { ok: false, profile, reason: 'Already at max upgrade' };
  if (profile.scrap < cost) return { ok: false, profile, reason: 'Not enough scrap' };
  const item = applyUpgrade(registry, found.item);
  return { ok: true, item, profile: { ...replaceItem(profile, item), scrap: profile.scrap - cost } };
}

export function reforgeGear(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
  affixIndex: number,
): ProfileActionResult {
  const found = findItem(profile, uid);
  if (!found) return { ok: false, profile, reason: 'Item not found' };
  if (affixIndex < 0 || affixIndex >= found.item.affixes.length) return { ok: false, profile, reason: 'No such affix' };
  const cost = reforgeCost(registry, found.item);
  if (profile.scrap < cost) return { ok: false, profile, reason: 'Not enough scrap' };
  const item = reforgeAffix(registry, found.item, affixIndex, forgeRng(profile));
  return {
    ok: true,
    item,
    profile: { ...replaceItem(profile, item), scrap: profile.scrap - cost, forgeCount: profile.forgeCount + 1 },
  };
}

export function fuseGear(registry: DataRegistry, profile: DelveProfile, uids: string[]): ProfileActionResult {
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
