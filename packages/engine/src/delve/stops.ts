import type { DataRegistry } from '../data/registry.js';
import type { ArpgWorld } from '../types/arpg.js';
import { carriedByText, movesetOf } from '../loot/moveset.js';
import { upgradeCost } from '../loot/smithing.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import { runeFits, socketsOf } from '../loot/runes.js';
import { emptyHaul, stockHaul } from '../loot/materials.js';
import type { Haul } from '../types/crafting.js';
import { CHAIN_SKILLS, type Blow, type ChainSkill, type Move } from '../types/ability.js';
import type { DelveProfile, DiveState, DiveStop, StopKind } from '../types/delve.js';
import { GEAR_SLOTS, type GearItem } from '../types/gear.js';
import type { RuneRef } from '../types/rune.js';
import { addSlot, moveKey, movesOf, setChain, slotPrice, withMove } from './moveset.js';
import { equipItem, upgradeGear, type ProfileActionResult } from './profile.js';
import { runeTargetOf, socketRune } from './runes.js';

/**
 * Stops between depths (see the weapon movesets spec): after a depth is
 * cleared, the door screen holds one power-up, taken with the dive lock lifted
 * for that one op. dive.ts imports this module back: keep to function declarations.
 */

/** The five kinds, in the order a stop lists them. */
export const STOP_KINDS: readonly StopKind[] = ['equip', 'slot', 'move', 'upgrade', 'rune'];

/** What a stop's player takes: the kind and what it acts on. */
export type StopAction =
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
 * The stop after `dive`'s depth is cleared (`completeFloor`): 2 or 3 of the
 * kinds that apply, at random from the dive seed's fork `stop:<depth>`, or all
 * of them when fewer apply; none apply, no stop.
 */
export function rollStop(
  registry: DataRegistry,
  profile: DelveProfile,
  dive: DiveState,
): DiveStop | null {
  const kinds = stopKinds(registry, { ...profile, dive });
  if (kinds.length === 0) return null;
  const rng = new SeededRNG(dive.seed).fork(`stop:${dive.depth}`);
  const count = rng.nextInt(2, 3);
  const pool = [...kinds];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = new Set(pool.slice(0, count));
  return { offers: kinds.filter((k) => picked.has(k)), taken: false };
}

/** Whether untyped input has a move's shape (a form and elements) or a blow's (an element). */
function moveShaped(move: unknown): move is Move | Blow {
  if (!move || typeof move !== 'object') return false;
  return 'form' in move ? Array.isArray((move as Move).elements) : 'element' in move;
}

/** The stop's one op on `profile` (whose dive the caller has lifted). */
function runStop(
  registry: DataRegistry,
  profile: DelveProfile,
  action: StopAction,
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
      if (!chain) return { ok: false, profile, reason: carriedByText(registry, action.skill) };
      const moves = movesOf(chain);
      const { index, move } = action;
      if (!Number.isInteger(index) || index < 0 || index >= moves.length)
        return { ok: false, profile, reason: 'Adjust a move the chain holds' };
      if (!moveShaped(move)) return { ok: false, profile, reason: 'Change the move' };
      if (Array.isArray(chain) === 'form' in move)
        return { ok: false, profile, reason: `Not a ${action.skill} move` };
      if (moveKey(move) === moveKey(moves[index]))
        return { ok: false, profile, reason: 'Change the move' };
      // The saved move's sockets and runes stay; any the client sent are ignored.
      const { runes: _sent, ...shape } = move;
      const saved = moves[index].runes;
      const next = (saved ? { ...shape, runes: saved } : shape) as Move | Blow;
      return setChain(registry, profile, action.skill, withMove(chain, index, next));
    }
    case 'upgrade':
      return upgradeGear(registry, profile, action.uid);
    case 'rune': {
      const weapon = profile.equipped.weapon;
      if (!weapon) return { ok: false, profile, reason: 'Equip a weapon to build your moves' };
      const chain = movesetOf(registry, weapon).chains[action.skill];
      if (!chain) return { ok: false, profile, reason: carriedByText(registry, action.skill) };
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
 * Take the stop's power-up: its kind must be offered and the stop not yet
 * taken. The op runs at its normal price with the dive lock lifted for it
 * alone (equipping is free, and a weapon brings its own moveset); `move`
 * changes one move of one chain (its sockets and runes stay as saved); `rune`
 * sockets a pouch rune into an empty socket, free. It spends what the dive
 * has banked first, then the stockpile (so a rune found this dive can be
 * socketed). A refused op leaves the stop open; one taken marks it taken.
 * Skipping is choosing a door.
 */
export function takeStop(
  registry: DataRegistry,
  profile: DelveProfile,
  action: StopAction,
): ProfileActionResult {
  const dive = profile.dive;
  const stop = dive?.phase === 'choosing' && !dive.settled ? dive.stop : null;
  if (!dive || !stop) return { ok: false, profile, reason: 'No stop here' };
  if (stop.taken) return { ok: false, profile, reason: "This stop's power-up is taken" };
  if (!stop.offers.includes(action.kind))
    return { ok: false, profile, reason: 'Not offered at this stop' };
  const res = runStop(registry, { ...pooled(profile), dive: null }, action);
  if (!res.ok) return { ...res, profile };
  const spent = unpool(profile, res.profile, dive.banked);
  const taken = { ...dive, banked: spent.banked, stop: { ...stop, taken: true } };
  return { ...res, profile: { ...spent.profile, dive: taken } };
}

/**
 * An anvil alcove's offers (see the floor maps spec): 2 or 3 of the kinds the
 * hero can take and pay for (`stopKinds`), on `alcove:<depth>:<roomId>`, so a
 * reopened alcove offers the same.
 */
export function alcoveOffers(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _world: ArpgWorld,
  _id: string,
): StopKind[] {
  throw new Error('alcoveOffers: not implemented');
}

/**
 * Take an alcove's one op mid-floor (while the dive is fighting): the world
 * banked first, the op run with the dive lock lifted as `takeStop` runs it,
 * paid from `banked` and the haul, then the stockpile; the alcove marked used
 * and the hero refreshed (`worldStats`).
 */
export function takeAlcove(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _world: ArpgWorld,
  _action: StopAction,
): ProfileActionResult {
  throw new Error('takeAlcove: not implemented');
}
