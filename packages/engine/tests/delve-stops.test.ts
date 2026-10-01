import { describe, it, expect } from 'vitest';
import { hitMonster, makeCtx } from '../src/arpg/combat.js';
import { takeBestStop } from '../src/delve/autopilot.js';
import { beginFloor, chooseDoor, completeFloor, startDive } from '../src/delve/dive.js';
import { addSlot } from '../src/delve/moveset.js';
import {
  createDelveProfile,
  equipItem,
  parseDelveProfile,
  unequipSlot,
} from '../src/delve/profile.js';
import { STOP_KINDS, rollStop, stopKinds, takeStop } from '../src/delve/stops.js';
import { generateItem } from '../src/loot/item-generator.js';
import { upgradeCost } from '../src/loot/smithing.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { DelveProfile, DiveStop, StopKind } from '../src/types/delve.js';
import type { GearItem } from '../src/types/gear.js';
import { bal, chainsOf, registry, run } from './fixtures/arena.js';

// See the weapon movesets spec's "Stops between depths".

const ring = (uid: string, seed = 1): GearItem =>
  generateItem(
    registry,
    { uid, ilvl: 2, rarity: 'magic', slot: 'ring', mana: 'fire' },
    new SeededRNG(seed),
  );

/** A Fire hero with a ring in the bag. */
const hero = (): DelveProfile => ({
  ...createDelveProfile(registry, 3, { primary: 'fire' }),
  bag: [ring('r1')],
});

/** `p` diving, on the door screen after depth 1, holding `stop`. */
function atStop(p: DelveProfile, stop: DiveStop | null): DelveProfile {
  const diving = startDive(registry, p, 1);
  const dive = diving.dive!;
  return {
    ...diving,
    dive: { ...dive, phase: 'choosing', depthsCleared: 1, doorChoices: ['winding'], stop },
  };
}

const ALL: DiveStop = { offers: [...STOP_KINDS], taken: false };

describe('the stop after a cleared depth', () => {
  it('holds 2 or 3 of the kinds that apply, the same from the same dive', () => {
    const p = startDive(registry, { ...hero(), scrap: 1000, manaDust: 50 }, 1);
    const clear = () => {
      const world = beginFloor(registry, p);
      const ctx = makeCtx(registry, world, []);
      for (const m of [...world.monsters]) hitMonster(ctx, m, 1e12, null, { source: 'skill' });
      run(world, 5);
      return completeFloor(registry, p, world).profile;
    };
    const once = clear();
    expect(once.dive!.phase).toBe('choosing');
    const stop = once.dive!.stop!;
    expect(stop.taken).toBe(false);
    expect(stop.offers.length).toBeGreaterThanOrEqual(2);
    expect(stop.offers.length).toBeLessThanOrEqual(3);
    for (const k of stop.offers) expect(stopKinds(registry, once)).toContain(k);
    expect(clear().dive!.stop).toEqual(stop);
  });

  it('offers only what the hero can take and pay for: a bag item, a slot, an edit, an upgrade', () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const p = { ...p0, stats: { ...p0.stats, dives: 1 } }; // past the free edits
    expect(upgradeCost(registry, p.equipped.chest!)).toBe(10);
    expect(stopKinds(registry, p)).toEqual([]); // no bag, Links, scrap or Mana Dust
    const rich = { ...p, bag: [ring('r1')], links: 1, scrap: 20, manaDust: bal.movesets.editDust };
    expect(stopKinds(registry, rich)).toEqual([...STOP_KINDS]);
    expect(stopKinds(registry, { ...rich, links: 0 })).toEqual(['equip', 'move', 'upgrade']);
    expect(stopKinds(registry, { ...rich, scrap: 19 })).toEqual(['equip', 'move', 'upgrade']);
    expect(stopKinds(registry, { ...rich, scrap: 9 })).toEqual(['equip', 'move']);
    expect(stopKinds(registry, { ...rich, manaDust: 4 })).toEqual(['equip', 'slot', 'upgrade']);
    expect(stopKinds(registry, { ...rich, manaDust: 0, stats: p0.stats })).toEqual([...STOP_KINDS]);
    const maxed = (i: GearItem): GearItem => ({ ...i, upgrade: bal.forge.maxUpgrade });
    const bare = unequipSlot(registry, p, 'weapon');
    const spent: DelveProfile = {
      ...bare,
      bag: [],
      equipped: { chest: maxed(bare.equipped.chest!) },
    };
    expect(stopKinds(registry, spent)).toEqual([]);
    expect(rollStop(registry, spent, startDive(registry, spent, 1).dive!)).toBeNull();
  });

  it('offers 2 or 3 at random in the kinds order, all of them when only two apply', () => {
    const p = { ...hero(), links: 5, scrap: 1000 };
    const counts = new Set<number>();
    const seen = new Set<StopKind>();
    for (let seed = 1; seed <= 40; seed++) {
      const dive = { ...startDive(registry, p, 1).dive!, seed };
      const stop = rollStop(registry, p, dive)!;
      counts.add(stop.offers.length);
      stop.offers.forEach((k) => seen.add(k));
      expect(stop.offers).toEqual(STOP_KINDS.filter((k) => stop.offers.includes(k)));
    }
    expect([...counts].sort()).toEqual([2, 3]);
    expect([...seen].sort()).toEqual([...STOP_KINDS].sort());
    const two = { ...createDelveProfile(registry, 3, { primary: 'fire' }), scrap: 1000 };
    const dive = startDive(registry, two, 1).dive!;
    expect(rollStop(registry, two, dive)).toEqual({ offers: ['move', 'upgrade'], taken: false });
    // One kind that applies: that one alone.
    const bare = unequipSlot(registry, two, 'weapon');
    const one = { ...bare, bag: [] };
    expect(rollStop(registry, one, dive)).toEqual({ offers: ['upgrade'], taken: false });
  });
});

describe('takeStop', () => {
  it('equips a bag item for free with the lock lifted, and marks the stop taken', () => {
    const p = atStop(hero(), ALL);
    const res = takeStop(registry, p, { kind: 'equip', uid: 'r1' });
    expect(res.ok).toBe(true);
    expect(res.item!.uid).toBe('r1');
    expect(res.profile.equipped.ring!.uid).toBe('r1');
    expect(res.profile.scrap).toBe(p.scrap);
    expect(res.profile.dive).toEqual({ ...p.dive, stop: { ...ALL, taken: true } });
    expect(takeStop(registry, res.profile, { kind: 'upgrade', uid: 'r1' }).reason).toBe(
      "This stop's power-up is taken",
    );
  });

  it('adds a slot, adjusts one move, or upgrades an item, each at its normal price', () => {
    const p = { ...atStop(hero(), ALL), links: 5, scrap: 1000, manaDust: 50 };
    const slot = takeStop(registry, p, { kind: 'slot', skill: 'primary' });
    expect(slot.profile).toMatchObject({ links: 4, scrap: 980 });
    expect(slot.profile.equipped.weapon!.moveset!.slots.primary).toBe(2);
    const bolt = chainsOf(p).primary!.moves[0];
    const move = takeStop(registry, p, {
      kind: 'move',
      skill: 'primary',
      index: 0,
      move: { ...bolt, kind: 'heavy' },
    });
    expect(chainsOf(move.profile).primary!.moves[0].kind).toBe('heavy');
    expect(move.profile.manaDust).toBe(50 - bal.movesets.editDust);
    const chest = p.equipped.chest!;
    const up = takeStop(registry, p, { kind: 'upgrade', uid: chest.uid });
    expect(up.profile.equipped.chest!.upgrade).toBe(1);
    expect(up.profile.scrap).toBe(1000 - upgradeCost(registry, chest)!);
    for (const r of [slot, move, up]) expect(r.profile.dive!.stop!.taken).toBe(true);
  });

  it("upgrades a bag item, which counts for the offer when no worn item's upgrade is affordable", () => {
    const p0 = hero();
    const maxed = (i: GearItem): GearItem => ({ ...i, upgrade: bal.forge.maxUpgrade });
    const cost = upgradeCost(registry, p0.bag[0])!;
    const p = {
      ...p0,
      equipped: { weapon: maxed(p0.equipped.weapon!), chest: maxed(p0.equipped.chest!) },
      scrap: cost,
    };
    expect(stopKinds(registry, p)).toContain('upgrade');
    expect(stopKinds(registry, { ...p, scrap: cost - 1 })).not.toContain('upgrade');
    const up = takeStop(registry, atStop(p, ALL), { kind: 'upgrade', uid: 'r1' });
    expect(up.ok).toBe(true);
    expect(up.profile.bag[0].upgrade).toBe(1);
    expect(up.profile.scrap).toBe(0);
  });

  it('adjusts one move of a longer chain, leaving its other moves as they were', () => {
    const p = { ...atStop(hero(), ALL), manaDust: 50 };
    const basic = chainsOf(p).basic!;
    expect(basic).toHaveLength(3);
    const held = { ...basic[1], kind: 'hold' as const };
    const res = takeStop(registry, p, { kind: 'move', skill: 'basic', index: 1, move: held });
    expect(res.ok).toBe(true);
    expect(chainsOf(res.profile).basic).toEqual([basic[0], held, basic[2]]);
  });

  it('refuses a kind not offered, no stop, and leaves the stop open when the op is refused', () => {
    const p = atStop(hero(), { offers: ['equip', 'slot'], taken: false });
    expect(takeStop(registry, p, { kind: 'upgrade', uid: 'r1' }).reason).toBe(
      'Not offered at this stop',
    );
    const poor = takeStop(registry, p, { kind: 'slot', skill: 'primary' });
    expect(poor).toMatchObject({ ok: false, reason: 'Not enough Links', profile: p });
    const fighting = startDive(registry, hero(), 1);
    expect(takeStop(registry, fighting, { kind: 'equip', uid: 'r1' }).reason).toBe('No stop here');
    const moved = atStop(hero(), ALL);
    const far = takeStop(registry, moved, {
      kind: 'move',
      skill: 'primary',
      index: 3,
      move: chainsOf(moved).primary!.moves[0],
    });
    expect(far.reason).toBe('Adjust a move the chain holds');
    const bolt = chainsOf(moved).primary!.moves[0];
    const at = (index: number, move: object) =>
      takeStop(registry, moved, { kind: 'move', skill: 'primary', index, move: move as never })
        .reason;
    expect(at(0.5, { ...bolt, kind: 'heavy' })).toBe('Adjust a move the chain holds');
    expect(at(0, bolt)).toBe('Change the move');
    expect(at(0, { kind: 'heavy', element: 'fire' })).toBe('Not a primary move');
    // Malformed input is refused, never thrown on.
    for (const bad of [null, undefined, 7, {}, { kind: 'heavy', form: 'bolt' }])
      expect(at(0, bad as never)).toBe('Change the move');
    const nothing = takeStop(registry, moved, {
      kind: 'move',
      skill: 'defensive',
      index: 0,
      move: { kind: 'medium', form: 'ward', elements: ['fire'] },
    });
    expect(nothing.reason).toBe('Carried by magic weapons and better');
    expect(takeStop(registry, moved, { kind: 'equip', uid: 'nope' }).reason).toBe(
      'Item not in bag: nope',
    );
  });

  it('the dive lock refuses everything else at a stop; a door ends it and a new dive starts without one', () => {
    const p = { ...atStop(hero(), ALL), links: 5, scrap: 1000 };
    expect(() => equipItem(registry, p, 'r1')).toThrow('Equip at the Anvil, between dives');
    expect(addSlot(registry, p, 'primary').reason).toBe('Chains can only change between dives');
    const next = chooseDoor(registry, p, 'winding');
    expect(next.dive!.stop).toBeNull();
    expect(startDive(registry, hero(), 1).dive!.stop).toBeNull();
  });

  it('the save keeps the stop; a dive saved without one reads as none', () => {
    const p = atStop(hero(), { offers: ['equip', 'move'], taken: true });
    const json = (x: unknown) => JSON.parse(JSON.stringify(x));
    expect(parseDelveProfile(registry, json(p))!.profile.dive!.stop).toEqual(p.dive!.stop);
    const { stop: _stop, ...older } = p.dive!;
    expect(parseDelveProfile(registry, json({ ...p, dive: older }))!.profile.dive!.stop).toBeNull();
  });
});

describe('the autopilot at a stop', () => {
  const stopOf = (...offers: StopKind[]): DiveStop => ({ offers, taken: false });
  const plain = (uid: string): GearItem =>
    generateItem(
      registry,
      { uid, ilvl: 1, rarity: 'common', slot: 'ring', mana: 'fire' },
      new SeededRNG(2),
    );

  it('equips the bag item that beats its gear the most, as it is, for free', () => {
    const p = { ...atStop(hero(), stopOf('equip', 'upgrade')), scrap: 1000 };
    const both = { ...p, bag: [plain('weak'), ...p.bag] };
    const after = takeBestStop(registry, both);
    expect(after.equipped.ring!.uid).toBe('r1');
    expect(after.scrap).toBe(1000);
    expect(after.dive!.stop!.taken).toBe(true);
  });

  it('else upgrades its cheapest affordable equipped item', () => {
    const p0 = atStop(hero(), stopOf('equip', 'upgrade'));
    // A copy of its own sword beats nothing, so it upgrades instead. The sword, once upgraded,
    // costs more than the cuirass: the cuirass goes first, and only while scrap covers it.
    const sword = { ...p0.equipped.weapon!, upgrade: 3 };
    const chest = p0.equipped.chest!;
    const cost = upgradeCost(registry, chest)!;
    expect(upgradeCost(registry, sword)!).toBeGreaterThan(cost);
    const p = {
      ...p0,
      equipped: { ...p0.equipped, weapon: sword },
      bag: [{ ...sword, uid: 'twin' }],
      scrap: cost,
    };
    const after = takeBestStop(registry, p);
    expect(after.equipped.chest!.upgrade).toBe(1);
    expect(after.scrap).toBe(0);
    expect(takeBestStop(registry, { ...p, scrap: cost - 1 })).toEqual({ ...p, scrap: cost - 1 });
  });

  it('else adds an affordable slot, the Primary first; else skips', () => {
    const p = { ...atStop(hero(), stopOf('slot', 'move')), links: 5, scrap: 1000 };
    expect(takeBestStop(registry, p).equipped.weapon!.moveset!.slots.primary).toBe(2);
    const both = { ...atStop(hero(), stopOf('slot', 'upgrade')), links: 5, scrap: 1000 };
    const upgraded = takeBestStop(registry, both); // an upgrade before a slot
    const { weapon, chest } = upgraded.equipped;
    expect(weapon!.upgrade + chest!.upgrade).toBe(1);
    expect(upgraded).toMatchObject({ links: 5 });
    expect(weapon!.moveset!.slots.primary).toBe(1);
    const broke = { ...atStop(hero(), stopOf('move', 'upgrade')), scrap: 0 };
    expect(takeBestStop(registry, broke)).toBe(broke);
  });
});
