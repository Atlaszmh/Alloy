import type { DataRegistry } from '../data/registry.js';
import { carriedByText, movesetOf } from '../loot/moveset.js';
import { upgradeCost } from '../loot/smithing.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import { CHAIN_SKILLS, type Blow, type ChainSkill, type Move } from '../types/ability.js';
import type { DelveProfile, DiveState, DiveStop, StopKind } from '../types/delve.js';
import { GEAR_SLOTS, type GearItem } from '../types/gear.js';
import { addSlot, moveKey, movesOf, setChain, slotPrice, withMove } from './moveset.js';
import { equipItem, upgradeGear, type ProfileActionResult } from './profile.js';

/**
 * Stops between depths (see the weapon movesets spec): after a depth is
 * cleared, the door screen holds one power-up, taken with the dive lock lifted
 * for that one op. dive.ts imports this module back: keep to function declarations.
 */

/** The four kinds, in the order a stop lists them. */
export const STOP_KINDS: readonly StopKind[] = ['equip', 'slot', 'move', 'upgrade'];

/** What a stop's player takes: the kind and what it acts on. */
export type StopAction =
  | { kind: 'equip'; uid: string }
  | { kind: 'slot'; skill: ChainSkill }
  | { kind: 'move'; skill: ChainSkill; index: number; move: Move | Blow }
  | { kind: 'upgrade'; uid: string };

/**
 * The kinds whose cheapest action `profile` can take and pay for now: `equip`
 * with an item in the bag; `slot` with a chain of the equipped weapon below
 * its cap whose next slot's Links and scrap the hero has; `move` with a weapon
 * equipped and `editDust` in Mana Dust (or free edits, before the first dive);
 * `upgrade` with an item, equipped or in the bag, whose next upgrade it can pay.
 */
export function stopKinds(registry: DataRegistry, profile: DelveProfile): StopKind[] {
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
    rune: false,
  };
  return STOP_KINDS.filter((k) => applies[k]);
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
  const kinds = stopKinds(registry, profile);
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
      return setChain(registry, profile, action.skill, withMove(chain, index, move));
    }
    case 'upgrade':
      return upgradeGear(registry, profile, action.uid);
  }
}

/**
 * Take the stop's power-up: its kind must be offered and the stop not yet
 * taken. The op runs at its normal price with the dive lock lifted for it
 * alone (equipping is free, and a weapon brings its own moveset); `move`
 * changes one move of one chain. A refused op leaves the stop open; one taken
 * marks it taken. Skipping is choosing a door.
 */
export function takeStop(
  registry: DataRegistry,
  profile: DelveProfile,
  action: StopAction,
): ProfileActionResult {
  const dive = profile.dive;
  const stop = dive?.phase === 'choosing' ? dive.stop : null;
  if (!dive || !stop) return { ok: false, profile, reason: 'No stop here' };
  if (stop.taken) return { ok: false, profile, reason: "This stop's power-up is taken" };
  if (!stop.offers.includes(action.kind))
    return { ok: false, profile, reason: 'Not offered at this stop' };
  const res = runStop(registry, { ...profile, dive: null }, action);
  if (!res.ok) return { ...res, profile };
  return { ...res, profile: { ...res.profile, dive: { ...dive, stop: { ...stop, taken: true } } } };
}
