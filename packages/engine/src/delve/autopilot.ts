import type { DataRegistry } from '../data/registry.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem } from '../types/gear.js';
import { GEAR_SLOTS } from '../types/gear.js';
import { MANA_TYPES, emptyManaMap, type ManaType } from '../types/mana.js';
import { upgradeCost } from '../loot/smithing.js';
import { botInput } from '../arpg/bot.js';
import { stepWorld } from '../arpg/step.js';
import {
  bankWorld,
  beginFloor,
  chooseDoor,
  closeDive,
  completeFloor,
  extractDive,
  failFloor,
  startDepthOptions,
  startDive,
} from './dive.js';
import { compareItem, itemAttunement, type WeaponValue } from './hero-stats.js';
import { heroChains, movesetOf } from '../loot/moveset.js';
import { bindSecondary, resolveOvertake } from './pair.js';
import {
  createDelveProfile,
  equipBest,
  profilePower,
  referenceDepth,
  salvageCandidates,
  salvageItems,
  upgradeGear,
} from './profile.js';
import { addSlot, movesOf, setChain, transferMoveset, withMove } from './moveset.js';
import { fuseRunes, openSocket } from './runes.js';
import { pouchCount, runeFits, socketCap, socketsOf } from '../loot/runes.js';
import { takeStop, type StopAction } from './stops.js';
import { MAX_CHAIN, type Blow, type ChainSkill, type Move } from '../types/ability.js';
import { RUNE_TIERS, type RuneRef, type RuneTarget, type RuneTier } from '../types/rune.js';

/**
 * Plays whole dives with the arena bot, like a sensible player: fights every
 * floor (its gear locked, loot to the bag), picks doors, extracts when spent,
 * and between dives moves its moveset to a better weapon, equips upgrades,
 * forges, adds slots and sockets runes. Used by the pacing test and for balance sweeps.
 */

export interface AutopilotOptions {
  seed: number;
  dives: number;
  /** Safety cap on depth per dive. */
  maxDepth?: number;
  /** A floor that runs longer than this counts as a death. */
  maxFloorSeconds?: number;
  /** Continue from an existing profile instead of a fresh one. */
  profile?: DelveProfile;
  /** A fresh profile's starting mana (default fire). */
  primary?: ManaType;
  /** Bind this second element before the first dive (the Primary built from both), forcing the pair. */
  secondary?: ManaType;
}

export interface AutopilotDiveReport {
  dive: number;
  startDepth: number;
  endDepth: number;
  result: 'dead' | 'extracted' | 'capped';
  power: number;
  kills: number;
  floorSeconds: number;
  legendariesOwned: number;
  reactionsSeen: number;
  scrap: number;
}

const DOOR_PREFERENCE = ['winding', 'gilded', 'swarm', 'champions', 'cursed', 'plunge', 'shrine'];
const STEP = 1 / 30;

function playFloor(
  registry: DataRegistry,
  profile: DelveProfile,
  maxSeconds: number,
): { profile: DelveProfile; seconds: number; died: boolean } {
  let p = profile;
  const world = beginFloor(registry, p);
  while (!world.heroDead && world.t < maxSeconds) {
    stepWorld(registry, world, botInput(registry, world), STEP);
    if (world.pending.items.length > 0) p = bankWorld(registry, p, world).profile;
    if (world.cleared && (world.drops.length === 0 || world.t - world.clearedAt > 3)) break;
  }
  if (world.heroDead || !world.cleared) {
    return { profile: failFloor(registry, p, world).profile, seconds: world.t, died: true };
  }
  return { profile: completeFloor(registry, p, world).profile, seconds: world.t, died: false };
}

function pickDoor(profile: DelveProfile): string | null {
  const dive = profile.dive!;
  if (dive.heroHpFrac < 0.35 && dive.potions === 0 && !dive.doorChoices.includes('shrine')) return null;
  if (dive.heroHpFrac < 0.5 && dive.doorChoices.includes('shrine')) return 'shrine';
  for (const id of DOOR_PREFERENCE) if (dive.doorChoices.includes(id)) return id;
  return dive.doorChoices[0];
}

/**
 * Bind the non-primary element the bot owns the most attunement in (equipped
 * and bagged: each item's base plus its `*Attune` lines; ties in MANA_TYPES
 * order), none while that's all 0: every pair reacts.
 */
function bindBest(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const primary = profile.pair.primary;
  if (!primary) return profile;
  let p = profile;
  if (!p.pair.secondary) {
    const owned = emptyManaMap();
    for (const item of [...GEAR_SLOTS.map((s) => p.equipped[s]), ...p.bag]) {
      if (!item) continue;
      const a = itemAttunement(registry, item);
      for (const m of MANA_TYPES) owned[m] += a[m];
    }
    let best: ManaType | null = null;
    for (const m of MANA_TYPES) if (m !== primary && owned[m] > (best ? owned[best] : 0)) best = m;
    if (!best) return p;
    p = bindSecondary(registry, p, best).profile;
  }
  return p;
}

/**
 * Build every move of the weapon's Primary chain from both elements of a
 * bound pair, so it keeps finding their reaction, when it can pay for the edit.
 */
function fusePrimary(registry: DataRegistry, p: DelveProfile): DelveProfile {
  const { primary, secondary } = p.pair;
  const chain = heroChains(registry, p.equipped, p.pair).primary;
  if (!primary || !secondary || !chain) return p;
  const moves = chain.moves.map((m) => ({ ...m, elements: [primary, secondary] }));
  const res = setChain(registry, p, 'primary', { ...chain, moves });
  return res.ok ? res.profile : p;
}

/**
 * Between dives, as a player would: an overtaking secondary swaps in, a second
 * element is bound (before anything is salvaged), the forge visit, and then
 * the Primary of whatever weapon it wields is built from both elements.
 */
export function betweenDives(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const bound = bindBest(registry, resolveOvertake(registry, profile).profile);
  return fusePrimary(registry, visitForge(registry, bound));
}

/** The skills the bot adds slots to, in order: each as far as its Links and scrap go. */
const SLOT_ORDER: ChainSkill[] = ['primary', 'basic', 'ultimate', 'defensive'];
/**
 * The slots a chain gets before the Links go to sockets for the pouch's runes; the 4th and 5th
 * after (the runes balance pass: at 5, sockets got the leftovers and 20-43 runes sat in the pouch).
 */
const SOCKETS_AFTER = 3;

/** The bag item `pick` allows that raises Power the most (a weapon valued `value`), or null. */
function bestGain(
  registry: DataRegistry,
  p: DelveProfile,
  value: WeaponValue,
  pick: (item: GearItem) => boolean = () => true,
): string | null {
  const depth = referenceDepth(p);
  let best: { uid: string; pct: number } | null = null;
  for (const item of p.bag) {
    if (!pick(item)) continue;
    const pct = compareItem(p.equipped, item, registry, depth, p.pair, value).powerPct;
    if (pct > (best?.pct ?? 0)) best = { uid: item.uid, pct };
  }
  return best?.uid ?? null;
}

/** The equipped item whose next upgrade costs least (on a tie, the first in `GEAR_SLOTS`). */
function cheapestUpgrade(
  registry: DataRegistry,
  p: DelveProfile,
): { uid: string; cost: number } | null {
  let cheapest: { uid: string; cost: number } | null = null;
  for (const slot of GEAR_SLOTS) {
    const item = p.equipped[slot];
    const cost = item ? upgradeCost(registry, item) : null;
    if (item && cost !== null && (!cheapest || cost < cheapest.cost))
      cheapest = { uid: item.uid, cost };
  }
  return cheapest;
}

/**
 * Move the moveset onto the bag weapon that makes the best home (valued with
 * it moved: `compareItem`'s default), when that raises Power and it can pay.
 */
function transferBest(registry: DataRegistry, p: DelveProfile): DelveProfile {
  const uid = bestGain(registry, p, 'home', (item) => item.slot === 'weapon');
  if (!uid) return p;
  const res = transferMoveset(registry, p, uid);
  return res.ok ? res.profile : p;
}

/**
 * Spend Links on slots in `SLOT_ORDER`, up to `upTo` a chain: each skill's next
 * slot while it can pay, then the next skill's (a slot it can't afford passes
 * to the next).
 */
function spendLinks(
  registry: DataRegistry,
  profile: DelveProfile,
  upTo = MAX_CHAIN,
): DelveProfile {
  let p = profile;
  const slots = (skill: ChainSkill) =>
    p.equipped.weapon ? (movesetOf(registry, p.equipped.weapon).slots[skill] ?? 0) : 0;
  for (const skill of SLOT_ORDER)
    while (slots(skill) < upTo) {
      const res = addSlot(registry, p, skill);
      if (!res.ok) break;
      p = res.profile;
    }
  return p;
}

/** Every move of the equipped weapon's chains, in `SLOT_ORDER`, each chain from its first. */
function weaponMoves(
  registry: DataRegistry,
  p: DelveProfile,
): { skill: ChainSkill; index: number; move: Move | Blow }[] {
  const weapon = p.equipped.weapon;
  if (!weapon) return [];
  const { chains } = movesetOf(registry, weapon);
  return SLOT_ORDER.flatMap((skill) =>
    movesOf(chains[skill]).map((move, index) => ({ skill, index, move })),
  );
}

/** What a move's runes sit on: its form, or the equipped weapon's blow. */
function targetOf(p: DelveProfile, move: Move | Blow): RuneTarget {
  return 'form' in move
    ? { form: move.form }
    : { weapon: p.equipped.weapon?.baseId ?? null, kind: move.kind };
}

/** The pouch runes the bot weighs: each id's highest tier held, in `runes.json` order. */
function pouchBest(registry: DataRegistry, p: DelveProfile): RuneRef[] {
  return registry.getRunes().flatMap(({ id }) => {
    for (let tier = RUNE_TIERS; tier >= 1; tier--) {
      const ref = { id, tier: tier as RuneTier };
      if (pouchCount(p.runes, ref) > 0) return [ref];
    }
    return [];
  });
}

/**
 * Whether `rune` may go in socket `socket` of `move`: it fits the move, and no
 * rune of its id is on the move (but a lower tier of it in that socket).
 */
function takes(
  registry: DataRegistry,
  p: DelveProfile,
  move: Move | Blow,
  socket: number,
  rune: RuneRef,
): boolean {
  return (
    runeFits(registry.getRune(rune.id), targetOf(p, move)) &&
    socketsOf(move).every((r, k) => r?.id !== rune.id || (k === socket && r.tier < rune.tier))
  );
}

/** Fuse every triple in the pouch, lowest tier first, so a fused rune can make a triple above it. */
function fusePouch(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const need = registry.getDelveBalance().runes.fuseCount;
  let p = profile;
  for (let tier = 1; tier < RUNE_TIERS; tier++)
    for (const { id } of registry.getRunes()) {
      const ref = { id, tier: tier as RuneTier };
      while (pouchCount(p.runes, ref) >= need) {
        const res = fuseRunes(registry, p, ref);
        if (!res.ok) return p; // short of scrap: every later fuse costs as much or more
        p = res.profile;
      }
    }
  return p;
}

/**
 * Socket `socket` of move `index` of `skill` with the pouch rune that raises Power most
 * (`takes`), over `than` (by default `p`'s); a filled one is pulled by the pull rule. Null
 * when no rune gains.
 */
function bestRune(
  registry: DataRegistry,
  p: DelveProfile,
  skill: ChainSkill,
  index: number,
  socket: number,
  than = profilePower(registry, p),
): DelveProfile | null {
  let best: { profile: DelveProfile; power: number } | null = null;
  const chain = movesetOf(registry, p.equipped.weapon!).chains[skill]!;
  const now = movesOf(chain)[index];
  for (const rune of pouchBest(registry, p)) {
    if (!takes(registry, p, now, socket, rune)) continue;
    const runes = socketsOf(now).map((r, k) => (k === socket ? rune : r));
    const res = setChain(registry, p, skill, withMove(chain, index, { ...now, runes }));
    const power = res.ok ? profilePower(registry, res.profile) : 0;
    if (res.ok && power > (best?.power ?? than)) best = { profile: res.profile, power };
  }
  return best?.profile ?? null;
}

/**
 * Open sockets with the Links the slots left, each only for a pouch rune that
 * goes in at once and raises Power (an empty socket is Links for nothing):
 * each time on the move whose next socket is cheapest (the fewest open; on a
 * tie, the first in `SLOT_ORDER`) that such a rune fits, below the weapon's
 * cap, while it can pay.
 */
function openSockets(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const cap = socketCap(registry, profile.equipped.weapon?.rarity ?? null);
  let p = profile;
  for (;;) {
    const power = profilePower(registry, p);
    // A stable sort: on a tie, `SLOT_ORDER`, each chain from its first move.
    const moves = weaponMoves(registry, p)
      .map((m) => ({ ...m, open: socketsOf(m.move).length }))
      .filter((m) => m.open < cap)
      .sort((a, b) => a.open - b.open);
    let next: DelveProfile | null = null;
    for (const { skill, index, open } of moves) {
      const res = openSocket(registry, p, skill, index);
      if (!res.ok) break; // can't pay: every later socket costs as much or more
      next = bestRune(registry, res.profile, skill, index, open, power);
      if (next) break;
    }
    if (!next) return p;
    p = next;
  }
}

/**
 * Fill the sockets in `SLOT_ORDER`, each chain from its first move: each takes
 * the pouch rune that raises Power most (`takes`); a filled one changes only
 * for a rune that gains Power, its own pulled by the pull rule.
 */
function socketBest(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  for (const { skill, index, move } of weaponMoves(registry, profile))
    for (let socket = 0; socket < socketsOf(move).length; socket++)
      p = bestRune(registry, p, skill, index, socket) ?? p;
  return p;
}

/** A stop's rune: the pouch rune into an empty socket that raises Power most, or null when none gains. */
function runeStop(
  registry: DataRegistry,
  profile: DelveProfile,
  take: (action: StopAction) => DelveProfile | null,
): DelveProfile | null {
  let best: { profile: DelveProfile; power: number } | null = null;
  const now = profilePower(registry, profile);
  for (const { skill, index, move } of weaponMoves(registry, profile))
    for (const [socket, held] of socketsOf(move).entries()) {
      if (held) continue;
      for (const rune of pouchBest(registry, profile)) {
        if (!takes(registry, profile, move, socket, rune)) continue;
        const taken = take({ kind: 'rune', skill, index, socket, rune });
        const power = taken ? profilePower(registry, taken) : 0;
        if (taken && power > (best?.power ?? now)) best = { profile: taken, power };
      }
    }
  return best?.profile ?? null;
}

/**
 * At a stop between depths, by preference: equip the bag item that beats its
 * gear the most as it is; else socket the pouch rune that raises Power most
 * into an empty socket (free); else upgrade its cheapest affordable equipped
 * item; else add an affordable slot (in `SLOT_ORDER`); else skip (the door).
 */
export function takeBestStop(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const stop = profile.dive?.stop;
  if (!stop || stop.taken) return profile;
  const take = (action: StopAction) => {
    const res = takeStop(registry, profile, action);
    return res.ok ? res.profile : null;
  };
  if (stop.offers.includes('equip')) {
    const best = bestGain(registry, profile, 'asIs');
    const equipped = best && take({ kind: 'equip', uid: best });
    if (equipped) return equipped;
  }
  if (stop.offers.includes('rune')) {
    const socketed = runeStop(registry, profile, take);
    if (socketed) return socketed;
  }
  if (stop.offers.includes('upgrade')) {
    const cheapest = cheapestUpgrade(registry, profile);
    const upgraded =
      cheapest && cheapest.cost <= profile.scrap && take({ kind: 'upgrade', uid: cheapest.uid });
    if (upgraded) return upgraded;
  }
  if (stop.offers.includes('slot'))
    for (const skill of SLOT_ORDER) {
      const slotted = take({ kind: 'slot', skill });
      if (slotted) return slotted;
    }
  return profile;
}

/**
 * Between dives: move the moveset to a better weapon, equip upgrades, melt
 * junk, spend Links on slots up to `SOCKETS_AFTER` a chain,
 * then on sockets for the pouch's runes (each filled as it opens), then on the
 * rest of the slots; socket the best, fuse the rune copies left over, and pour
 * scrap into upgrades.
 */
function visitForge(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = equipBest(registry, transferBest(registry, profile)).profile;
  p = salvageItems(registry, p, salvageCandidates(registry, p, 'epic')).profile;
  // Links: slots up to SOCKETS_AFTER a chain, then sockets for the runes in the pouch, then
  // the rest of the slots. Runes: upgrade the filled sockets, then fuse only the copies left
  // over and socket again (a fused tier can beat a socketed one).
  p = spendLinks(registry, p, SOCKETS_AFTER);
  p = openSockets(registry, p);
  p = spendLinks(registry, p);
  p = socketBest(registry, p);
  p = socketBest(registry, fusePouch(registry, p));

  for (;;) {
    const cheapest = cheapestUpgrade(registry, p);
    if (!cheapest || cheapest.cost > p.scrap) break;
    const res = upgradeGear(registry, p, cheapest.uid);
    if (!res.ok) break; // the forge refuses mid-dive (an open dive)
    p = res.profile;
  }
  return p;
}

export function runAutopilot(
  registry: DataRegistry,
  opts: AutopilotOptions,
): { profile: DelveProfile; reports: AutopilotDiveReport[] } {
  const maxDepth = opts.maxDepth ?? 100;
  const maxFloorSeconds = opts.maxFloorSeconds ?? 240;
  let p = opts.profile ?? createDelveProfile(registry, opts.seed, { primary: opts.primary ?? 'fire' });
  if (opts.secondary) p = fusePrimary(registry, bindSecondary(registry, p, opts.secondary).profile);
  const reports: AutopilotDiveReport[] = [];

  for (let n = 0; n < opts.dives; n++) {
    const options = startDepthOptions(registry, p);
    const startDepth = options[options.length - 1];
    p = startDive(registry, p, startDepth);
    let seconds = 0;
    let result: AutopilotDiveReport['result'] = 'dead';

    while (p.dive && (p.dive.phase === 'fighting' || p.dive.phase === 'choosing')) {
      if (p.dive.phase === 'fighting') {
        const played = playFloor(registry, p, maxFloorSeconds);
        p = played.profile;
        seconds += played.seconds;
        continue;
      }
      p = takeBestStop(registry, p);
      if (p.dive!.depth >= maxDepth) {
        p = extractDive(registry, p);
        result = 'capped';
        break;
      }
      const door = pickDoor(p);
      if (!door) {
        p = extractDive(registry, p);
        result = 'extracted';
        break;
      }
      p = chooseDoor(registry, p, door);
    }

    const dive = p.dive!;
    reports.push({
      dive: n + 1,
      startDepth,
      endDepth: dive.depth,
      result: dive.phase === 'dead' ? 'dead' : result,
      power: profilePower(registry, p),
      kills: dive.kills,
      floorSeconds: Math.round(seconds),
      legendariesOwned: Object.keys(p.codex).length,
      reactionsSeen: p.reactionsSeen.length,
      scrap: p.scrap,
    });
    p = betweenDives(registry, closeDive(p));
  }
  return { profile: p, reports };
}
