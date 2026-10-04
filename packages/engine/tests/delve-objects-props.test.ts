import { describe, it, expect } from 'vitest';
import { killScrap, makeCtx } from '../src/arpg/combat.js';
import { footprints, hitObject, placeObjects } from '../src/arpg/objects.js';
import { metalAt } from '../src/loot/materials.js';
import type { ArpgWorld, PropEntity, Projectile } from '../src/types/arpg.js';
import { arena, bal, dummy, press, registry, run } from './fixtures/arena.js';

// See the room objects spec's "Objects in a fight": a prop is a fixed circle any hit breaks (its
// `life` counts the hits it takes, `terrain.propLife` of them); a shot meeting one stops there; a
// broken prop drops scrap or a bar at `terrain.propDrops`, on the world's own `propRng`.

const urn = (id: number, x: number, y: number): PropEntity => ({
  type: 'prop',
  id,
  kind: 'urn',
  x,
  y,
  radius: 0.35,
  life: 1,
  dead: false,
});

describe('placing', () => {
  it("stands a furnishing's props and hazards: ids from `nextId`, bodies and bursts from the data, every hazard ready", () => {
    const w = arena([]);
    const id = w.nextId;
    placeObjects(registry, w, {
      props: [{ kind: 'crate', x: 5.5, y: 5.5 }],
      hazards: [{ kind: 'brazier', element: 'storm', x: 9.5, y: 5.5 }],
    });
    expect(w.props).toEqual([
      {
        type: 'prop',
        id,
        kind: 'crate',
        x: 5.5,
        y: 5.5,
        radius: 0.4,
        life: bal.terrain.propLife,
        dead: false,
      },
    ]);
    expect(w.hazards).toEqual([
      {
        type: 'hazard',
        id: id + 1,
        kind: 'brazier',
        element: 'storm',
        x: 9.5,
        y: 5.5,
        radius: 0.4,
        burst: 2.5,
        state: 'ready',
        until: 0,
      },
    ]);
    expect(w.nextId).toBe(id + 2);
  });
});

describe('a hit', () => {
  it('breaks a prop (`propBreak`): it stays, `dead`, out of the footprints; it stops what hit it', () => {
    const w = arena([]);
    w.props = [urn(1, 5.5, 5.5)];
    const ctx = makeCtx(registry, w, []);
    expect(hitObject(ctx, w.props[0], 'hero')).toBe(true);
    expect(ctx.events.filter((e) => e.kind === 'propBreak')).toEqual([
      { kind: 'propBreak', id: 1, prop: 'urn', x: 5.5, y: 5.5 },
    ]);
    expect([w.props.length, w.props[0].dead, footprints(w).size]).toEqual([1, true, 0]);
  });

  it('a prop takes `life` hits', () => {
    const w = arena([]);
    w.props = [{ ...urn(1, 5.5, 5.5), life: 2 }];
    const ctx = makeCtx(registry, w, []);
    hitObject(ctx, w.props[0], 'foe');
    expect([w.props[0].dead, w.props[0].life]).toEqual([false, 1]);
    hitObject(ctx, w.props[0], 'foe');
    expect(w.props[0].dead).toBe(true);
  });
});

describe('in the sim', () => {
  it("a hero's Bolt stops at a prop in its way: the prop breaks, the foe behind it is untouched", () => {
    const w = arena([dummy(13, 25)], { noBasic: true });
    w.props = [urn(1, 13, 31)];
    const events = [...press(w, 0, { x: 13, y: 25 }), ...run(w, 2)];
    expect(events.filter((e) => e.kind === 'propBreak').length).toBe(1);
    expect([w.props[0].dead, w.monsters[0].hp]).toEqual([true, w.monsters[0].maxHp]);
  });

  it("a foe's shot stops at a prop between it and the hero", () => {
    const w = arena([], { noBasic: true });
    w.props = [urn(1, 13, 33.5)];
    const shot: Projectile = {
      id: 50,
      owner: 'monster',
      form: null,
      ability: null,
      homingId: null,
      x: 13,
      y: 31,
      vx: 0,
      vy: 8,
      radius: 0.3,
      damage: 5,
      element: null,
      pierce: false,
      pierceLeft: 0,
      hitIds: [],
      maxDist: 10,
      traveled: 0,
      explodeRadius: 0,
      applies: [],
      knockback: 0,
      dead: false,
    };
    w.projectiles.push(shot);
    const hp = w.hero.hp;
    const events = run(w, 1);
    expect(events.filter((e) => e.kind === 'propBreak').length).toBe(1);
    expect([w.props[0].dead, w.projectiles, w.hero.hp]).toEqual([true, [], hp]);
  });
});

describe('drops', () => {
  /** A world whose `n` urns are each hit once, in order. */
  const breakAll = (n: number): ArpgWorld => {
    const w = arena([]);
    w.props = Array.from({ length: n }, (_, i) =>
      urn(i + 1, 3.5 + (i % 20), 3.5 + 1.5 * Math.floor(i / 20)),
    );
    const ctx = makeCtx(registry, w, []);
    for (const p of [...w.props]) hitObject(ctx, p, 'hero');
    return w;
  };

  it("scrap (a normal kill's) or a bar of the floor's metal, at `propDrops`, in the prop's room", () => {
    const w = breakAll(400);
    const scrap = w.drops.filter((d) => d.kind === 'scrap');
    const bars = w.drops.filter((d) => d.kind === 'material');
    expect(scrap.length + bars.length).toBe(w.drops.length);
    expect(w.drops.length / 400).toBeGreaterThan(bal.terrain.propDrops.chance - 0.08);
    expect(w.drops.length / 400).toBeLessThan(bal.terrain.propDrops.chance + 0.08);
    expect(bars.length / w.drops.length).toBeGreaterThan(bal.terrain.propDrops.material - 0.12);
    expect(bars.length / w.drops.length).toBeLessThan(bal.terrain.propDrops.material + 0.12);
    const normal = killScrap(makeCtx(registry, w, []), 'normal');
    expect(normal).toBeGreaterThan(0);
    expect(new Set(scrap.map((d) => d.amount))).toEqual(new Set([normal]));
    const metals = registry.getCraftingData().metals.map((m) => m.id);
    const at = metals.indexOf(metalAt(registry, w.depth).id);
    for (const d of bars) {
      expect(d.amount).toBe(1);
      expect([0, 1]).toContain(
        d.material?.kind === 'metal' && metals.indexOf(d.material.metal) - at,
      );
    }
    expect(w.drops.every((d) => d.roomId === 0)).toBe(true);
  });

  it('roll on `propRng` alone, the same each time', () => {
    const a = breakAll(60);
    const b = breakAll(60);
    const c = arena([]);
    expect(a.drops).toEqual(b.drops);
    expect(a.drops.length).toBeGreaterThan(0);
    for (const k of ['rng', 'lootRng', 'materialRng', 'runeRng'] as const)
      expect(a[k].next()).toBe(c[k].next());
  });
});
