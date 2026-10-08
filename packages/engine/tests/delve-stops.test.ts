import { describe, it, expect } from 'vitest';
import { hitMonster, makeCtx } from '../src/arpg/combat.js';
import { takeBestStop } from '../src/delve/autopilot.js';
import { beginFloor, chooseDoor, completeFloor, startDive } from '../src/delve/dive.js';
import { OPEN_SKILL_TEXT, addSlot } from '../src/delve/moveset.js';
import {
  createDelveProfile,
  equipItem,
  parseDelveProfile,
  unequipSlot,
} from '../src/delve/profile.js';
import { STOP_KINDS, alcoveOffers, rollStop, stopKinds, takeStop } from '../src/delve/stops.js';
import type { BoonOffer } from '../src/types/boon.js';
import { generateItem } from '../src/loot/item-generator.js';
import { upgradeCost } from '../src/loot/smithing.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { DelveProfile, DiveStop, StopKind } from '../src/types/delve.js';
import type { GearItem } from '../src/types/gear.js';
import { bal, chainsOf, registry, run } from './fixtures/arena.js';
import { armed } from './fixtures/carries.js';
import { onMap, twoRooms } from './fixtures/flow-map.js';

// See the weapon movesets spec's "Stops between depths".

const ring = (uid: string, seed = 1): GearItem =>
  generateItem(
    registry,
    { uid, ilvl: 2, rarity: 'magic', slot: 'ring', mana: 'fire' },
    new SeededRNG(seed),
  );

/** A Fire hero with an uncommon sword and a ring in the bag. */
const hero = (): DelveProfile => ({
  ...armed(registry, createDelveProfile(registry, 3, { primary: 'fire' })),
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

const ALL: DiveStop = { kind: 'powerups', offers: [...STOP_KINDS], taken: false };

/** The kinds before runes: what a hero with an empty pouch can be offered. */
const FOUR: StopKind[] = ['equip', 'slot', 'move', 'upgrade'];

/** A boons stop offering `offers`. */
const boonsStop = (...offers: BoonOffer[]): DiveStop => ({ kind: 'boons', offers, taken: false });
const OFFER: BoonOffer[] = [
  { id: 'keen-edge', tier: 2 },
  { id: 'stone-skin', tier: 1 },
  { id: 'magpie', tier: 3 },
];
const st = (step: string) => ({ step, count: 0, misses: 0 });

describe('the stop after a cleared depth', () => {
  it('an ordinary stop holds three boons, the same from the same dive', () => {
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
    expect(stop.kind).toBe('boons');
    expect(stop.taken).toBe(false);
    expect(stop.offers).toHaveLength(3);
    expect(clear().dive!.stop).toEqual(stop);
  });

  it('offers only what the hero can take and pay for: a bag item, a slot, an edit, an upgrade', () => {
    const p0 = armed(registry, createDelveProfile(registry, 3, { primary: 'fire' }));
    const p = { ...p0, scrap: 0, stats: { ...p0.stats, dives: 1 } }; // past the free edits
    expect(upgradeCost(registry, p.equipped.chest!)).toBe(10);
    expect(stopKinds(registry, p)).toEqual([]); // no bag, Links, scrap or Mana Dust
    const rich = { ...p, bag: [ring('r1')], links: 1, scrap: 20, manaDust: bal.movesets.editDust };
    expect(stopKinds(registry, rich)).toEqual(FOUR);
    expect(stopKinds(registry, { ...rich, links: 0 })).toEqual(['equip', 'move', 'upgrade']);
    expect(stopKinds(registry, { ...rich, scrap: 19 })).toEqual(['equip', 'move', 'upgrade']);
    expect(stopKinds(registry, { ...rich, scrap: 9 })).toEqual(['equip', 'move']);
    expect(stopKinds(registry, { ...rich, manaDust: 4 })).toEqual(['equip', 'slot', 'upgrade']);
    expect(stopKinds(registry, { ...rich, manaDust: 0, stats: p0.stats })).toEqual(FOUR);
    const maxed = (i: GearItem): GearItem => ({ ...i, upgrade: bal.forge.maxUpgrade });
    const bare = unequipSlot(registry, p, 'weapon');
    const spent: DelveProfile = {
      ...bare,
      bag: [],
      equipped: { chest: maxed(bare.equipped.chest!) },
    };
    expect(stopKinds(registry, spent)).toEqual([]);
    // A hero with nothing to pay still meets boons: they are free.
    expect(rollStop(registry, spent, startDive(registry, spent, 1).dive!)?.kind).toBe('boons');
  });

  it('counts and spends what the dive banked first, then the stockpile (S9)', () => {
    const p = atStop(hero(), { kind: 'powerups', offers: ['slot'], taken: false });
    const banking = (links: number, scrap: number, on: DelveProfile = p) => ({
      ...on,
      dive: { ...on.dive!, banked: { ...on.dive!.banked, links, scrap } },
    });
    const broke = { ...p, links: 0, scrap: 0 };
    expect(stopKinds(registry, broke)).not.toContain('slot');
    expect(stopKinds(registry, banking(2, 40, broke))).toContain('slot');
    // The 3rd Primary slot's 2 Links and 40 scrap: the banked 2 Links and 15 scrap, then 25 of the stockpile's.
    const res = takeStop(registry, banking(2, 15, { ...p, links: 2, scrap: 100 }), {
      kind: 'slot',
      skill: 'primary',
    });
    expect(res.ok).toBe(true);
    expect(res.profile).toMatchObject({ links: 2, scrap: 75 });
    expect(res.profile.dive!.banked).toMatchObject({ links: 0, scrap: 0 });
    expect(res.profile.dive!.stop!.taken).toBe(true);
  });

  it('a guided stop offers the power-ups its step names, required; a step naming none, no stop', () => {
    const dive = startDive(registry, hero(), 1).dive!;
    expect(rollStop(registry, { ...hero(), tutorial: st('s1-equip') }, dive)).toEqual({
      kind: 'powerups',
      offers: ['equip'],
      taken: false,
      required: true,
    });
    expect(rollStop(registry, { ...hero(), tutorial: st('s3-home') }, dive)).toBeNull();
    const guided = {
      ...atStop(hero(), { kind: 'powerups', offers: ['equip'], taken: false, required: true }),
      tutorial: st('s1-equip'),
    };
    const res = takeStop(registry, guided, { kind: 'equip', uid: 'r1' });
    expect(res.ok).toBe(true);
    expect(res.profile.equipped.ring!.uid).toBe('r1');
    expect(takeStop(registry, guided, { kind: 'boon', index: 0 }).reason).toBe(
      'Not offered at this stop',
    );
  });

  it('an anvil alcove still offers 2 or 3 paid power-ups', () => {
    const p = startDive(registry, { ...hero(), scrap: 1000 }, 1);
    const w = onMap(beginFloor(registry, p), twoRooms('alcove', { kind: 'alcove' }, 1));
    const offers = alcoveOffers(registry, p, w, '1:1');
    expect(offers.length).toBeGreaterThanOrEqual(2);
    for (const k of offers) expect(STOP_KINDS).toContain(k);
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
    expect(slot.profile).toMatchObject({ links: 3, scrap: 960 });
    expect(slot.profile.equipped.weapon!.moveset!.slots.primary).toBe(3);
    expect(slot.profile.equipped.weapon!.moveset!.bought).toEqual({ primary: 1 });
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
    const p = atStop(hero(), { kind: 'powerups', offers: ['equip', 'slot'], taken: false });
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
      skill: 'ultimate',
      index: 0,
      move: { kind: 'medium', form: 'nova', elements: ['fire'] },
    });
    expect(nothing.reason).toBe(OPEN_SKILL_TEXT);
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
    const p = atStop(hero(), { kind: 'powerups', offers: ['equip', 'move'], taken: true });
    const json = (x: unknown) => JSON.parse(JSON.stringify(x));
    expect(parseDelveProfile(registry, json(p))!.profile.dive!.stop).toEqual(p.dive!.stop);
    const { stop: _stop, ...older } = p.dive!;
    expect(parseDelveProfile(registry, json({ ...p, dive: older }))!.profile.dive!.stop).toBeNull();
  });

  it("takes a boon: its tier's effect onto the dive, free, the stop taken", () => {
    const p = { ...atStop(hero(), boonsStop(...OFFER)), scrap: 77, links: 2 };
    const res = takeStop(registry, p, { kind: 'boon', index: 2 });
    expect(res.ok).toBe(true);
    expect(res.profile.dive!.diveBuffs).toEqual([
      ...p.dive!.diveBuffs,
      { boon: 'magpie', tier: 3, effect: { find: 60 } },
    ]);
    expect(res.profile.dive!.stop).toEqual({ ...p.dive!.stop, taken: true });
    // The buff's effect is its own copy, never the registry's row.
    expect(res.profile.dive!.diveBuffs.at(-1)!.effect).not.toBe(
      registry.getBoon('magpie')!.tiers[2].effect,
    );
    // Nothing spent, banked or otherwise changed.
    expect({ ...res.profile, dive: null }).toEqual({ ...p, dive: null });
    expect({ ...res.profile.dive!, diveBuffs: [], stop: null }).toEqual({
      ...p.dive!,
      diveBuffs: [],
      stop: null,
    });
    expect(takeStop(registry, res.profile, { kind: 'boon', index: 0 }).reason).toBe(
      "This stop's boon is taken",
    );
  });

  it('refuses a card it does not hold, a power-up at a boons stop, and a boon at a power-up stop', () => {
    const p = atStop(hero(), boonsStop(...OFFER));
    for (const index of [3, -1, 0.5])
      expect(takeStop(registry, p, { kind: 'boon', index })).toMatchObject({
        ok: false,
        reason: 'Take a boon the stop offers',
        profile: p,
      });
    expect(takeStop(registry, p, { kind: 'equip', uid: 'r1' }).reason).toBe(
      'Not offered at this stop',
    );
    expect(takeStop(registry, atStop(hero(), ALL), { kind: 'boon', index: 0 }).reason).toBe(
      'Not offered at this stop',
    );
    expect(
      takeStop(registry, startDive(registry, hero(), 1), { kind: 'boon', index: 0 }).reason,
    ).toBe('No stop here');
  });

  it('stacks: a second stop adds a second entry of the same boon', () => {
    const one = takeStop(registry, atStop(hero(), boonsStop(...OFFER)), {
      kind: 'boon',
      index: 0,
    }).profile;
    const again = { ...one, dive: { ...one.dive!, stop: boonsStop({ id: 'keen-edge', tier: 1 }) } };
    const two = takeStop(registry, again, { kind: 'boon', index: 0 }).profile;
    expect(two.dive!.diveBuffs.map((b) => [b.boon, b.tier])).toEqual([
      ['keen-edge', 2],
      ['keen-edge', 1],
    ]);
  });

  it('the save keeps a boons stop and the boons worn', () => {
    const p = takeStop(registry, atStop(hero(), boonsStop(...OFFER)), {
      kind: 'boon',
      index: 1,
    }).profile;
    const json = (x: unknown) => JSON.parse(JSON.stringify(x));
    const back = parseDelveProfile(registry, json(p))!.profile.dive!;
    expect(back.stop).toEqual(p.dive!.stop);
    expect(back.diveBuffs).toEqual(p.dive!.diveBuffs);
  });
});

describe('the autopilot at a stop', () => {
  const stopOf = (...offers: StopKind[]): DiveStop => ({ kind: 'powerups', offers, taken: false });
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
    expect(takeBestStop(registry, p).equipped.weapon!.moveset!.slots.primary).toBe(3);
    const both = { ...atStop(hero(), stopOf('slot', 'upgrade')), links: 5, scrap: 1000 };
    const upgraded = takeBestStop(registry, both); // an upgrade before a slot
    const { weapon, chest } = upgraded.equipped;
    expect(weapon!.upgrade + chest!.upgrade).toBe(1);
    expect(upgraded).toMatchObject({ links: 5 });
    expect(weapon!.moveset!.slots.primary).toBe(2);
    const broke = { ...atStop(hero(), stopOf('move', 'upgrade')), scrap: 0 };
    expect(takeBestStop(registry, broke)).toBe(broke);
  });

  it('takes the boon of the highest tier, ties by family, never a pact', () => {
    const took = (...offers: BoonOffer[]) =>
      takeBestStop(registry, atStop(hero(), boonsStop(...offers))).dive!.diveBuffs.map(
        (b) => `${b.boon}:${b.tier}`,
      );
    expect(
      took(
        { id: 'keen-edge', tier: 1 },
        { id: 'glass-cannon', tier: 3 },
        { id: 'stone-skin', tier: 2 },
      ),
    ).toEqual(['stone-skin:2']);
    expect(
      took({ id: 'magpie', tier: 2 }, { id: 'bulwark', tier: 2 }, { id: 'keen-edge', tier: 1 }),
    ).toEqual(['bulwark:2']);
    expect(
      took({ id: 'cartographer', tier: 1 }, { id: 'magpie', tier: 1 }, { id: 'echo', tier: 1 }),
    ).toEqual(['echo:1']);
    expect(took({ id: 'pure-flame', tier: 1 }, { id: 'keen-edge', tier: 1 })).toEqual([
      'keen-edge:1',
    ]);
    const pacts = atStop(
      hero(),
      boonsStop({ id: 'glass-cannon', tier: 3 }, { id: 'hunted', tier: 1 }),
    );
    expect(takeBestStop(registry, pacts)).toBe(pacts);
    const taken = { ...atStop(hero(), boonsStop(...OFFER)) };
    taken.dive = { ...taken.dive!, stop: { ...taken.dive!.stop!, taken: true } };
    expect(takeBestStop(registry, taken)).toBe(taken);
    // An id the data lacks is passed over, never thrown on.
    expect(took({ id: 'no-such-boon', tier: 3 }, { id: 'magpie', tier: 1 })).toEqual(['magpie:1']);
    const unknown = atStop(hero(), boonsStop({ id: 'no-such-boon', tier: 3 }));
    expect(takeBestStop(registry, unknown)).toBe(unknown);
  });
});
