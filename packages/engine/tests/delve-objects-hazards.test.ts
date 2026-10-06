import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeCtx } from '../src/arpg/combat.js';
import { hitObject, objectsTick } from '../src/arpg/objects.js';
import { depthGrowth } from '../src/arpg/world.js';
import type { ArpgEvent, ArpgWorld, HazardEntity, PropEntity, Vec } from '../src/types/arpg.js';
import { arena, bal, dodge, dummy, press, registry, run } from './fixtures/arena.js';
import { onMap } from './fixtures/maps.js';

// See the room objects spec's "Objects in a fight": any hit sets a ready hazard off; it telegraphs
// for `fuse`, then bursts on everyone in its radius (the hero damage only, never a perfect dodge;
// foes its element's stacks, reactions as usual, source `hazard`), wears crumbling cover, sets off
// what its burst reaches (a chain), and is dormant for `recharge`.

const hooks = vi.hoisted(() => ({
  structures: [] as { at: Vec; radius: number; damage: number }[],
}));

vi.mock('../src/arpg/terrain.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/arpg/terrain.js')>()),
  hitStructures: (_ctx: unknown, at: Vec, radius: number, damage: number) =>
    hooks.structures.push({ at: { x: at.x, y: at.y }, radius, damage }),
}));

beforeEach(() => {
  hooks.structures = [];
});

const coil = (id: number, x: number, y: number, o: Partial<HazardEntity> = {}): HazardEntity => ({
  type: 'hazard',
  id,
  kind: 'storm_coil',
  element: 'storm',
  x,
  y,
  radius: 0.4,
  burst: 2.5,
  state: 'ready',
  until: 0,
  ...o,
});

/** A burst's damage at the world's depth: `terrain.hazardDamage` × the depth's foe damage. */
const burstDamage = (w: ArpgWorld) => {
  const g = depthGrowth(registry, w.depth);
  return bal.terrain.hazardDamage * bal.monster.baseDmg * g.dmg * g.ramp;
};

/** Set the world's first hazard off and run the objects' tick at its burst; the events. */
const setOff = (w: ArpgWorld): ArpgEvent[] => {
  const ctx = makeCtx(registry, w, []);
  hitObject(ctx, w.hazards[0], 'hero');
  w.t = w.hazards[0].until;
  objectsTick(ctx);
  return ctx.events;
};

const hits = (events: ArpgEvent[]) =>
  events.flatMap((e) =>
    e.kind === 'hit' ? [{ id: e.id, amount: e.amount, source: e.source }] : [],
  );

describe('setting one off', () => {
  it('a hit primes a ready hazard (`hazardPrime`, its fuse) and stops what hit it; a primed or dormant one shrugs hits off', () => {
    const w = arena([]);
    w.hazards = [coil(1, 5, 5)];
    const ctx = makeCtx(registry, w, []);
    expect(hitObject(ctx, w.hazards[0], 'foe')).toBe(true);
    expect(w.hazards[0]).toMatchObject({ state: 'primed', until: bal.terrain.fuse });
    expect(ctx.events).toEqual([
      {
        kind: 'hazardPrime',
        id: 1,
        hazard: 'storm_coil',
        element: 'storm',
        x: 5,
        y: 5,
        radius: 2.5,
        fuse: bal.terrain.fuse,
      },
    ]);
    expect(hitObject(ctx, w.hazards[0], 'hero')).toBe(true);
    expect([ctx.events.length, w.hazards[0].until]).toEqual([1, bal.terrain.fuse]);
    Object.assign(w.hazards[0], { state: 'dormant', until: 9 });
    expect(hitObject(ctx, w.hazards[0], 'hazard')).toBe(true);
    expect([ctx.events.length, w.hazards[0].state, w.hazards[0].until]).toEqual([1, 'dormant', 9]);
  });

  it('the fuse burns down to the burst (`hazardBurst`); dormant for `recharge`, then ready', () => {
    const w = arena([]);
    w.hazards = [coil(1, 5, 5)];
    const ctx = makeCtx(registry, w, []);
    hitObject(ctx, w.hazards[0], 'hero');
    w.t = bal.terrain.fuse - 0.01;
    objectsTick(ctx);
    expect(w.hazards[0].state).toBe('primed');
    w.t = bal.terrain.fuse;
    objectsTick(ctx);
    expect(w.hazards[0]).toMatchObject({
      state: 'dormant',
      until: bal.terrain.fuse + bal.terrain.recharge,
    });
    expect(ctx.events.filter((e) => e.kind === 'hazardBurst')).toEqual([
      {
        kind: 'hazardBurst',
        id: 1,
        hazard: 'storm_coil',
        element: 'storm',
        x: 5,
        y: 5,
        radius: 2.5,
      },
    ]);
    w.t += bal.terrain.recharge - 0.01;
    objectsTick(ctx);
    expect(w.hazards[0].state).toBe('dormant');
    w.t += 0.01;
    objectsTick(ctx);
    expect(w.hazards[0].state).toBe('ready');
  });
});

describe('the burst', () => {
  it("hits each foe it reaches and sees for the depth's foe damage × hazardFoeMult × hpRamp / ramp, with its element's stacks (source `hazard`), and wears crumbling cover", () => {
    // A wall at x = 12 stands between the coil at (10.5, 10.5) and the foe at (13.2, 10.5).
    const w = onMap(
      arena([dummy(11.5, 12, { traits: ['spiked'] }), dummy(10.5, 14.5), dummy(13.2, 10.5)]),
      [
        [12, 9],
        [12, 10],
        [12, 11],
      ],
    );
    w.hazards = [coil(1, 10.5, 10.5)];
    // None of the hero's power: its storm power doesn't touch the burst.
    w.hero.stats.elementPower.storm = 0.5;
    const hp = w.hero.hp;
    const events = setOff(w);
    const damage = burstDamage(w);
    const g = depthGrowth(registry, w.depth);
    const amount = (damage * bal.terrain.hazardFoeMult * g.hpRamp) / g.ramp;
    expect(hits(events)).toEqual([{ id: 1000, amount, source: 'hazard' }]);
    expect(w.monsters.map((m) => m.status.stacks.storm)).toEqual([
      bal.stacks.basicByKind.heavy,
      0,
      0,
    ]);
    // The hero stands far off; the spiked foe sends nothing back.
    expect([w.hero.hp, w.hurt]).toEqual([hp, false]);
    expect(hooks.structures).toEqual([{ at: { x: 10.5, y: 10.5 }, radius: 2.5, damage }]);
  });

  it('an Earth burst rattles: its stacks come with its stagger', () => {
    const w = arena([dummy(5, 6)]);
    w.hazards = [coil(1, 5, 5, { element: 'earth' })];
    setOff(w);
    expect(w.monsters[0].status.stacks.earth).toBe(bal.stacks.basicByKind.heavy);
  });

  it('reactions as usual, and a kill counts (its death, its drops, its quest event)', () => {
    const w = arena([dummy(5, 6), dummy(6, 5, { hp: 1 })]);
    w.hazards = [coil(1, 5, 5, { element: 'frost' })];
    w.monsters[0].status.stacks.fire = 2;
    const events = setOff(w);
    const reaction = registry.getReactionFor('frost', 'fire').id;
    expect(events.find((e) => e.kind === 'hit' && e.id === 1000)).toMatchObject({ reaction });
    expect(events.filter((e) => e.kind === 'death').map((e) => e.kind === 'death' && e.id)).toEqual(
      [1001],
    );
    expect(w.kills).toBe(1);
    expect(w.drops.length).toBeGreaterThan(0);
    expect(w.pending.questEvents).toContainEqual(expect.objectContaining({ type: 'kill' }));
  });

  it("the hero in its reach takes its damage only (`heroHit`, the floor's `hurt`)", () => {
    const w = arena([], { noBasic: true });
    w.hazards = [coil(1, 13, 34)];
    const hp = w.hero.hp;
    const events = setOff(w);
    const hit = events.find((e) => e.kind === 'heroHit');
    expect(hit).toMatchObject({ dodged: false, element: 'storm' });
    expect(w.hero.hp).toBeLessThan(hp);
    expect(hp - w.hero.hp).toBeLessThanOrEqual(burstDamage(w));
    expect(w.hurt).toBe(true);
  });

  it("a dodge's i-frames avoid it, and it is never a perfect dodge", () => {
    const w = arena([], { noBasic: true });
    w.hazards = [coil(1, 13, 34, { state: 'primed', until: 99 })];
    dodge(w);
    const hp = w.hero.hp;
    const ctx = makeCtx(registry, w, []);
    w.hazards[0].until = w.t;
    objectsTick(ctx);
    expect(ctx.events.map((e) => e.kind)).toEqual(['hazardBurst']);
    expect([w.hero.hp, w.hurt, w.hero.riposteUntil]).toEqual([hp, false, 0]);
  });

  it('sets off the hazards and breaks the props it reaches (a chain), each hazard on its own fuse', () => {
    const urn: PropEntity = {
      type: 'prop',
      id: 9,
      kind: 'urn',
      x: 5,
      y: 7,
      radius: 0.35,
      life: 1,
      dead: false,
    };
    const w = arena([]);
    w.props = [urn];
    w.hazards = [coil(1, 5, 5), coil(2, 7, 5), coil(3, 12, 5)];
    const events = setOff(w).filter((e) => e.kind !== 'drop');
    expect(events.map((e) => [e.kind, 'id' in e ? e.id : null])).toEqual([
      ['hazardPrime', 1],
      ['hazardBurst', 1],
      ['propBreak', 9],
      ['hazardPrime', 2],
    ]);
    expect(w.hazards.map((h) => h.state)).toEqual(['dormant', 'primed', 'ready']);
    expect(w.props[0].dead).toBe(true);
    const ctx = makeCtx(registry, w, []);
    w.t = w.hazards[1].until;
    objectsTick(ctx);
    expect(ctx.events.map((e) => e.kind)).toEqual(['hazardBurst']);
    expect(w.hazards.map((h) => h.state)).toEqual(['dormant', 'dormant', 'ready']);
  });
});

describe('in the sim', () => {
  it("a hero's Bolt sets a coil off; it bursts `fuse` later on the foes beside it, the same each time", () => {
    const play = () => {
      const w = arena([dummy(12.5, 29), dummy(13.5, 29.5)], { noBasic: true });
      w.hazards = [coil(1, 13, 31)];
      const events = [...press(w, 0, { x: 13, y: 29 }), ...run(w, 1)];
      return { w, events };
    };
    const { w, events } = play();
    const primeAt = events.findIndex((e) => e.kind === 'hazardPrime');
    const burstAt = events.findIndex((e) => e.kind === 'hazardBurst');
    expect(primeAt).toBeGreaterThanOrEqual(0);
    expect(burstAt).toBeGreaterThan(primeAt);
    const burned = hits(events.slice(burstAt)).filter((h) => h.source === 'hazard');
    expect(burned.map((h) => h.id).sort()).toEqual([1000, 1001]);
    expect(w.hazards[0].state).toBe('dormant');
    expect(JSON.stringify(play().events)).toBe(JSON.stringify(events));
  });
});
