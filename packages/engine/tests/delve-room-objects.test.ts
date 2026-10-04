import { describe, it, expect } from 'vitest';
import { hitMonster, hurtHero, makeCtx } from '../src/arpg/combat.js';
import {
  footprint,
  footprints,
  hitObject,
  objectsIn,
  objectsOnBeam,
  objectsTick,
  objectsTouching,
  type RoomObject,
} from '../src/arpg/objects.js';
import type { ArpgEvent, HazardEntity, PropEntity } from '../src/types/arpg.js';
import { arena, dodge, dummy, registry } from './fixtures/arena.js';
import { onMap } from './fixtures/maps.js';

// See the room objects spec: props and hazards are entities (`ArpgWorld.props` / `hazards`),
// a circle's footprint is every cell it overlaps, each hit site tests its own shape, a hazard's
// burst passes `noPerfect`, and a knockback keeps the hit that set it going for a wall slam.

const prop = (x: number, y: number, o: Partial<PropEntity> = {}): PropEntity => ({
  type: 'prop',
  id: 900,
  kind: 'urn',
  x,
  y,
  radius: 0.4,
  life: 1,
  dead: false,
  ...o,
});
const hazard = (x: number, y: number, o: Partial<HazardEntity> = {}): HazardEntity => ({
  type: 'hazard',
  id: 901,
  kind: 'brazier',
  element: 'fire',
  x,
  y,
  radius: 0.4,
  burst: 2.5,
  state: 'ready',
  until: 0,
  ...o,
});
const ids = (os: RoomObject[]) => os.map((o) => o.id);

describe('the world', () => {
  it('starts with no props or hazards, its director due, and every foe at rest', () => {
    const w = arena([{}]);
    expect([w.props, w.hazards, w.director]).toEqual([[], [], { nextAt: 0 }]);
    expect(w.propRng.next()).toBeGreaterThanOrEqual(0);
    expect(w.monsters[0]).toMatchObject({
      kbHit: 0,
      job: null,
      goal: null,
      search: null,
      ambush: false,
    });
  });
});

describe('footprints', () => {
  it('a circle covers every cell it overlaps, clipped to the map', () => {
    const map = { width: 10, height: 10 };
    expect(footprint(map, { x: 3.5, y: 3.5, radius: 0.4 })).toEqual([33]);
    expect(footprint(map, { x: 3.5, y: 3.5, radius: 0.6 })).toEqual([23, 32, 33, 34, 43]);
    expect(footprint(map, { x: 0.2, y: 0.5, radius: 0.4 })).toEqual([0]);
    expect(footprint(map, { x: 4, y: 4, radius: 0.4 })).toEqual([33, 34, 43, 44]);
  });

  it("the world's are its standing props' and every hazard's", () => {
    const w = arena([]);
    w.props = [prop(3.5, 3.5), prop(5.5, 5.5, { id: 2, dead: true })];
    w.hazards = [hazard(8.5, 3.5, { state: 'dormant' })];
    expect([...footprints(w)].sort((a, b) => a - b)).toEqual([3 * w.width + 3, 3 * w.width + 8]);
  });
});

describe('the shapes each hit site tests', () => {
  const w = onMap(arena([]), [[10, 10]]);
  w.props = [prop(5, 5), prop(7, 5, { id: 2 }), prop(11.5, 10.5, { id: 3 })];
  w.hazards = [hazard(5, 8)];

  it('an area: its circle to an edge, a cone of it, and only what its centre sees', () => {
    expect(ids(objectsIn(w, { x: 5, y: 6 }, 0.7))).toEqual([900]);
    expect(ids(objectsIn(w, { x: 5, y: 6.5 }, 2.2))).toEqual([900, 2, 901]);
    expect(ids(objectsIn(w, { x: 5, y: 6.5 }, 2.2, { x: 0, y: -1 }, 120))).toEqual([900, 2]);
    // The wall cell (10, 10) stands between (9.5, 10.5) and the prop at (11.5, 10.5).
    expect(ids(objectsIn(w, { x: 9.5, y: 10.5 }, 3))).toEqual([]);
    expect(ids(objectsIn(w, { x: 11.5, y: 12.5 }, 3))).toEqual([3]);
  });

  it('a beam: its segment, its width either side', () => {
    expect(ids(objectsOnBeam(w, { x: 2, y: 5 }, { x: 6, y: 5 }, 0.2))).toEqual([900]);
    expect(ids(objectsOnBeam(w, { x: 2, y: 5 }, { x: 9, y: 5 }, 0.2))).toEqual([900, 2]);
    expect(ids(objectsOnBeam(w, { x: 2, y: 6 }, { x: 9, y: 6 }, 0.2))).toEqual([]);
  });

  it('a body: what it touches', () => {
    expect(ids(objectsTouching(w, { x: 5, y: 7.4, radius: 0.3 }))).toEqual([901]);
    expect(ids(objectsTouching(w, { x: 6, y: 6.5, radius: 0.3 }))).toEqual([]);
  });

  it("the stubs: a hit stops nothing and the tick does nothing, until B3's", () => {
    const ctx = makeCtx(registry, w, []);
    expect(hitObject(ctx, w.props[0], 'hero')).toBe(false);
    objectsTick(ctx);
    expect(ctx.events).toEqual([]);
  });
});

describe('hits', () => {
  it("a hazard's burst (`noPerfect`) never makes a perfect dodge; the dodge's i-frames still avoid it", () => {
    const perfect = (noPerfect: boolean) => {
      const w = arena([]);
      dodge(w);
      const events: ArpgEvent[] = [];
      const hp = w.hero.hp;
      hurtHero(makeCtx(registry, w, events), 50, 'fire', null, { noPerfect });
      expect(w.hero.hp).toBe(hp);
      return events.filter((e) => e.kind === 'perfectDodge').length;
    };
    expect([perfect(false), perfect(true)]).toEqual([1, 0]);
  });

  it('a knockback keeps the hit that set it going', () => {
    const w = arena([dummy(13, 30)]);
    const m = w.monsters[0];
    const ctx = makeCtx(registry, w, []);
    const amount = hitMonster(ctx, m, 40, null, { source: 'skill' });
    expect(m.kbHit).toBe(0);
    const pushed = hitMonster(ctx, m, 40, null, {
      source: 'skill',
      knockback: 1,
      kbFrom: { x: 13, y: 34 },
    });
    expect([amount > 0, m.kbHit]).toEqual([true, pushed]);
  });
});
