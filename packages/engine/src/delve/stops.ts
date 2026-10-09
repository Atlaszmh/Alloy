import type { DataRegistry } from '../data/registry.js';
import type { ArpgWorld } from '../types/arpg.js';
import type { Interactable } from '../types/floor-map.js';
import type { Buff } from '../types/boon.js';
import { rollBoons } from './boons.js';
import { refreshWorldHero } from '../arpg/world.js';
import { heroChains, movesetOf } from '../loot/moveset.js';
import { upgradeCost } from '../loot/smithing.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import { runeFits, socketsOf } from '../loot/runes.js';
import { addHaul, emptyHaul, stockHaul } from '../loot/materials.js';
import type { Haul } from '../types/crafting.js';
import { CHAIN_SKILLS, type Blow, type ChainSkill, type Move } from '../types/ability.js';
import type { DelveProfile, DiveState, DiveStop, StopKind } from '../types/delve.js';
import { GEAR_SLOTS, type GearItem } from '../types/gear.js';
import type { RuneRef } from '../types/rune.js';
import {
  OPEN_SKILL_TEXT,
  addSlot,
  moveKey,
  movesOf,
  setChain,
  slotPrice,
  withMove,
} from './moveset.js';
import { equipItem, upgradeGear, type ProfileActionResult } from './profile.js';
import { runeTargetOf, socketRune } from './runes.js';
import { bankWorld } from './dive.js';
import { openedAlcove } from '../arpg/interact.js';
import { diveStats } from './pair.js';
import { applyTutorialEvents, tutorialStep } from './tutorial.js';

/**
 * Stops between depths: after a depth is cleared, an ordinary stop offers three
 * boons, one taken free (the boons spec §4); a guided stop and an anvil alcove
 * hold power-ups, each taken with the dive lock lifted for that one op (the
 * weapon movesets spec). dive.ts imports this module back: keep to function declarations.
 */

/** The five kinds, in the order a stop lists them. */
export const STOP_KINDS: readonly StopKind[] = ['equip', 'slot', 'move', 'upgrade', 'rune'];

/** What a stop's player takes: the kind and what it acts on (`boon`: a `boons` stop's card by index). */
export type StopAction =
  | { kind: 'boon'; index: number }
  | { kind: 'equip'; uid: string }
  | { kind: 'slot'; skill: ChainSkill }
  | { kind: 'move'; skill: ChainSkill; index: number; move: Move | Blow }
  | { kind: 'upgrade'; uid: string }
  | { kind: 'rune'; skill: ChainSkill; index: number; socket: number; rune: RuneRef };

/**
 * `profile` with its dive's banked scrap, Mana Dust, Links and runes in the
 * stockpile: a stop spends from both (see the crafting spec's S9).
 */
function pooled(profile: DelveProfile): DelveProfile {
  const b = profile.dive?.banked;
  if (!b) return profile;
  const currencies = {
    ...emptyHaul(),
    scrap: b.scrap,
    dust: b.dust,
    links: b.links,
    runes: b.runes,
  };
  return { ...stockHaul(profile, currencies), stats: profile.stats };
}

/**
 * After a stop's op on the pooled profile (`after`): what it spent comes out of
 * `banked` first, the rest out of `before`'s stockpile. Returns the stockpile and
 * what stays banked.
 */
function unpool(
  before: DelveProfile,
  after: DelveProfile,
  banked: Haul,
): { profile: DelveProfile; banked: Haul } {
  // What stays banked: the part of `now` (pooled, after the op) above the old stockpile.
  const keep = (stock: number, now: number, b: number) => Math.min(b, Math.max(0, now - stock));
  const scrap = keep(before.scrap, after.scrap, banked.scrap);
  const dust = keep(before.manaDust, after.manaDust, banked.dust);
  const links = keep(before.links, after.links, banked.links);
  const runes = { ...after.runes };
  const bankedRunes: Haul['runes'] = {};
  for (const [id, counts] of Object.entries(banked.runes)) {
    const left = counts.map((b, t) =>
      keep(before.runes[id]?.[t] ?? 0, after.runes[id]?.[t] ?? 0, b),
    );
    bankedRunes[id] = left;
    if (runes[id]) runes[id] = runes[id].map((n, t) => n - (left[t] ?? 0));
  }
  return {
    profile: {
      ...after,
      scrap: after.scrap - scrap,
      manaDust: after.manaDust - dust,
      links: after.links - links,
      runes,
    },
    banked: { ...banked, scrap, dust, links, runes: bankedRunes },
  };
}

/**
 * The kinds whose cheapest action `profile` can take and pay for now: `equip`
 * with an item in the bag; `slot` with a chain of the equipped weapon below
 * its cap whose next slot's Links and scrap the hero has; `move` with a weapon
 * equipped and `editDust` in Mana Dust (or free edits, before the first dive);
 * `upgrade` with an item, equipped or in the bag, whose next upgrade it can
 * pay; `rune` with an empty socket and a pouch rune for it (`canSocket`). It
 * counts what the dive has banked with the stockpile.
 */
export function stopKinds(registry: DataRegistry, stockpile: DelveProfile): StopKind[] {
  const profile = pooled(stockpile);
  const weapon = profile.equipped.weapon;
  const items = [...GEAR_SLOTS.map((s) => profile.equipped[s]), ...profile.bag].filter(
    (i): i is GearItem => !!i,
  );
  const applies: Record<StopKind, boolean> = {
    equip: profile.bag.length > 0,
    slot:
      !!weapon &&
      CHAIN_SKILLS.some((s) => {
        const price = slotPrice(registry, weapon, s);
        return !!price && price.links <= profile.links && price.scrap <= profile.scrap;
      }),
    move: !!weapon && canEdit(registry, profile),
    upgrade: items.some((i) => (upgradeCost(registry, i) ?? Infinity) <= profile.scrap),
    rune: canSocket(registry, profile),
  };
  return STOP_KINDS.filter((k) => applies[k]);
}

/**
 * Whether some move or blow of the equipped weapon has an empty socket that a
 * pouch rune fits (by the move's form, or the weapon's blows) and isn't on
 * that move already.
 */
function canSocket(registry: DataRegistry, profile: DelveProfile): boolean {
  const weapon = profile.equipped.weapon;
  if (!weapon) return false;
  const held = Object.keys(profile.runes).filter((id) => profile.runes[id].some((n) => n > 0));
  const { chains } = movesetOf(registry, weapon);
  return CHAIN_SKILLS.some((skill) =>
    movesOf(chains[skill]).some((m) => {
      const sockets = socketsOf(m);
      if (!sockets.includes(null)) return false;
      return held.some((id) => {
        const def = registry.findRune(id);
        if (!def || sockets.some((r) => r?.id === id)) return false;
        return runeFits(def, runeTargetOf(weapon.baseId, m));
      });
    }),
  );
}

/** Whether one move's edit is affordable: free edits (before the first dive), or `editDust` in Mana Dust. */
function canEdit(registry: DataRegistry, profile: DelveProfile): boolean {
  return (
    profile.stats.dives === 0 || profile.manaDust >= registry.getDelveBalance().movesets.editDust
  );
}

/**
 * The stop after `dive`'s depth is cleared (`completeFloor`). A guided stop
 * (the profile's current step a stop step) offers the kinds its step names that
 * apply, all of them, required before a door when its step waits for the
 * power-up (`takeStop`; see the tutorial spec's gates), and none apply, no stop.
 * Any other stop offers boons (`rollBoons`, on the dive seed's fork
 * `stop:<depth>`); none left, no stop.
 */
export function rollStop(
  registry: DataRegistry,
  profile: DelveProfile,
  dive: DiveState,
): DiveStop | null {
  const step = tutorialStep(registry, profile.tutorial);
  if (step?.stop) {
    const kinds = stopKinds(registry, { ...profile, dive });
    const offers = kinds.filter((k) => step.stop!.kinds.includes(k));
    if (offers.length === 0) return null;
    return { kind: 'powerups', offers, taken: false, required: step.trigger.type === 'takeStop' };
  }
  const offers = rollBoons(registry, dive, new SeededRNG(dive.seed).fork(`stop:${dive.depth}`));
  return offers.length > 0 ? { kind: 'boons', offers, taken: false } : null;
}

/** 2 or 3 of `kinds` at random on `rng` (all of them when fewer), in their order. */
function pickKinds(kinds: StopKind[], rng: SeededRNG): StopKind[] {
  const count = rng.nextInt(2, 3);
  const pool = [...kinds];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = new Set(pool.slice(0, count));
  return kinds.filter((k) => picked.has(k));
}

/** Whether untyped input has a move's shape (a form and elements) or a blow's (an element). */
function moveShaped(move: unknown): move is Move | Blow {
  if (!move || typeof move !== 'object') return false;
  return 'form' in move ? Array.isArray((move as Move).elements) : 'element' in move;
}

/** A power-up's action: what `runStop` runs. */
type PowerupAction = Exclude<StopAction, { kind: 'boon' }>;

/** The stop's one op on `profile` (whose dive the caller has lifted). */
function runStop(
  registry: DataRegistry,
  profile: DelveProfile,
  action: PowerupAction,
): ProfileActionResult {
  switch (action.kind) {
    case 'equip':
      try {
        const next = equipItem(registry, profile, action.uid);
        const item = GEAR_SLOTS.map((s) => next.equipped[s]).find((i) => i?.uid === action.uid);
        return { ok: true, profile: next, item };
      } catch (e) {
        return { ok: false, profile, reason: (e as Error).message };
      }
    case 'slot':
      return addSlot(registry, profile, action.skill);
    case 'move': {
      const weapon = profile.equipped.weapon;
      if (!weapon) return { ok: false, profile, reason: 'Equip a weapon to build your moves' };
      const chain = movesetOf(registry, weapon).chains[action.skill];
      if (!chain) return { ok: false, profile, reason: OPEN_SKILL_TEXT };
      const moves = movesOf(chain);
      const { index, move } = action;
      if (!Number.isInteger(index) || index < 0 || index >= moves.length)
        return { ok: false, profile, reason: 'Adjust a move the chain holds' };
      if (!moveShaped(move)) return { ok: false, profile, reason: 'Change the move' };
      if (Array.isArray(chain) === 'form' in move)
        return { ok: false, profile, reason: `Not a ${action.skill} move` };
      if (moveKey(move) === moveKey(moves[index]))
        return { ok: false, profile, reason: 'Change the move' };
      // The saved construct is adjusted in place (the constructs spec §3.3): its uid, sockets and
      // runes stay; any the client sent are ignored (a uid-less construct would be new to `setChains`).
      const { runes: _sent, uid: _uid, ...shape } = move;
      const saved = moves[index];
      const next = { ...shape, uid: saved.uid, ...(saved.runes && { runes: saved.runes }) } as Move | Blow;
      return setChain(registry, profile, action.skill, withMove(chain, index, next));
    }
    case 'upgrade':
      return upgradeGear(registry, profile, action.uid);
    case 'rune': {
      const weapon = profile.equipped.weapon;
      if (!weapon) return { ok: false, profile, reason: 'Equip a weapon to build your moves' };
      const chain = movesetOf(registry, weapon).chains[action.skill];
      if (!chain) return { ok: false, profile, reason: OPEN_SKILL_TEXT };
      const { index, socket } = action;
      const move = Number.isInteger(index) ? movesOf(chain)[index] : undefined;
      if (!move) return { ok: false, profile, reason: 'Socket a rune into a move the chain holds' };
      // The stop sockets: it never pulls a rune or opens a socket.
      if (socketsOf(move)[socket] !== null)
        return { ok: false, profile, reason: 'Socket a rune into an empty socket' };
      return socketRune(registry, profile, action.skill, index, socket, action.rune);
    }
  }
}

/**
 * Take what the stop offers. At a boons stop, the offer at `index`: its tier's
 * effect goes onto the dive (`DiveState.diveBuffs`) and the stop is taken, free
 * (nothing pooled, spent or locked; no quest or tutorial event). At a power-up
 * stop, the kind must be offered and the stop not yet taken. The op runs at
 * its normal price with the dive lock lifted for it alone (equipping is free,
 * and a weapon brings its own moveset); `move` changes one move of one chain
 * (its sockets and runes stay as saved); `rune` sockets a pouch rune into an
 * empty socket, free. It spends what the dive has banked first, then the
 * stockpile (so a rune found this dive can be socketed). A refused op leaves
 * the stop open; one taken marks it taken. Skipping is choosing a door.
 */
export function takeStop(
  registry: DataRegistry,
  profile: DelveProfile,
  action: StopAction,
): ProfileActionResult {
  const dive = profile.dive;
  const stop = dive?.phase === 'choosing' && !dive.settled ? dive.stop : null;
  if (!dive || !stop) return { ok: false, profile, reason: 'No stop here' };
  if (stop.kind === 'boons') {
    if (action.kind !== 'boon') return { ok: false, profile, reason: 'Not offered at this stop' };
    if (stop.taken) return { ok: false, profile, reason: "This stop's boon is taken" };
    const offer = stop.offers[action.index];
    const def = offer && registry.getBoon(offer.id);
    if (!offer || !def) return { ok: false, profile, reason: 'Take a boon the stop offers' };
    const buff: Buff = {
      boon: offer.id,
      tier: offer.tier,
      effect: { ...def.tiers[offer.tier - 1].effect },
    };
    const taken = { ...dive, diveBuffs: [...dive.diveBuffs, buff], stop: { ...stop, taken: true } };
    return { ok: true, profile: { ...profile, dive: taken } };
  }
  if (stop.taken) return { ok: false, profile, reason: "This stop's power-up is taken" };
  if (action.kind === 'boon' || !stop.offers.includes(action.kind))
    return { ok: false, profile, reason: 'Not offered at this stop' };
  const res = runStop(registry, { ...pooled(profile), dive: null }, action);
  if (!res.ok) return { ...res, profile };
  const spent = unpool(profile, res.profile, dive.banked);
  const taken = { ...dive, banked: spent.banked, stop: { ...stop, taken: true } };
  const next = { ...spent.profile, dive: taken };
  return {
    ...res,
    profile: applyTutorialEvents(registry, next, [{ type: 'takeStop', kind: action.kind }]),
  };
}

/**
 * An anvil alcove's offers (see the floor maps spec): 2 or 3 of the kinds the
 * hero can take and pay for (`stopKinds`), on `alcove:<depth>:<roomId>`, so a
 * reopened alcove offers the same. On a guided floor, the kinds its step names
 * (`alcove.kinds`) that the hero can take and pay for, all of them (see the
 * tutorial spec's gates).
 */
export function alcoveOffers(
  registry: DataRegistry,
  profile: DelveProfile,
  world: ArpgWorld,
  id: string,
): StopKind[] {
  const dive = profile.dive;
  const alcove = alcovesOf(world).find((a) => a.id === id);
  if (!dive || !alcove) return [];
  // What the floor has hauled pays too: pooled with the banked (`stopKinds` pools `banked`).
  const hauled = { ...profile, dive: { ...dive, banked: addHaul(dive.banked, dive.haul) } };
  const kinds = stopKinds(registry, hauled);
  const guided =
    world.tutorial &&
    registry.getTutorialData().steps.find((s) => s.floor === world.tutorialFloor && s.alcove);
  if (guided) return kinds.filter((k) => guided.alcove!.kinds.includes(k));
  return pickKinds(kinds, new SeededRNG(dive.seed).fork(`alcove:${id}`));
}

/** The world's alcoves not yet used. */
function alcovesOf(world: ArpgWorld): Interactable[] {
  return world.map.rooms
    .map((r) => r.interactable)
    .filter((i): i is Interactable => i?.kind === 'alcove' && !i.used);
}

/**
 * Take the one op of the alcove last opened on `world` (`openedAlcove`)
 * mid-floor, while the dive is fighting: its kind must be among `alcoveOffers`
 * for this profile. The world banks first (`bankWorld`), then the op runs at
 * its price with the dive lock lifted as `takeStop` runs it, paid from
 * `banked` (as at a stop), then the floor's haul, then the stockpile. A refusal
 * leaves the profile and the world as they were (the alcove open, nothing
 * banked); an op taken marks the alcove used (`DiveState.used` and the
 * world's) and refreshes the hero (`refreshWorldHero` with the new gear's
 * `diveStats` and chains, its blessings kept; a changed Find moves `world.loot.find`).
 */
export function takeAlcove(
  registry: DataRegistry,
  profile: DelveProfile,
  world: ArpgWorld,
  action: StopAction,
): ProfileActionResult {
  const h = world.hero;
  const alcove = alcovesOf(world).find((a) => a.id === openedAlcove(world));
  const live = profile.dive?.phase === 'fighting' && !profile.dive.settled;
  if (!live || !alcove) return { ok: false, profile, reason: 'No anvil here' };
  if (
    action.kind === 'boon' ||
    !alcoveOffers(registry, profile, world, alcove.id).includes(action.kind)
  )
    return { ok: false, profile, reason: 'Not offered at this anvil' };
  const pending = world.pending;
  const banked = bankWorld(registry, profile, world).profile;
  const dive = banked.dive!;
  const withHaul = pooled({ ...banked, dive: { ...dive, banked: dive.haul } });
  const res = runStop(registry, { ...pooled({ ...withHaul, dive }), dive: null }, action);
  if (!res.ok) {
    world.pending = pending; // a refusal leaves the world as it was
    return { ...res, profile };
  }
  // `banked` pays first, as at a stop, then the haul, then the stockpile.
  const fromBanked = unpool(withHaul, res.profile, dive.banked);
  const fromHaul = unpool(banked, fromBanked.profile, dive.haul);
  alcove.used = true;
  const next: DelveProfile = {
    ...fromHaul.profile,
    dive: {
      ...dive,
      banked: fromBanked.banked,
      haul: fromHaul.banked,
      used: [...dive.used, alcove.id],
    },
  };
  const find = h.stats.magicFind;
  refreshWorldHero(
    registry,
    world,
    diveStats(registry, next),
    heroChains(registry, next.equipped, next.pair),
  );
  world.loot.find += h.stats.magicFind - find;
  return { ...res, profile: next };
}
