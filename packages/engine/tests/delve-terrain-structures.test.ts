import { describe, it, expect } from 'vitest';
import { makeCtx } from '../src/arpg/combat.js';
import { UNREACHED } from '../src/arpg/flow.js';
import { perceives } from '../src/arpg/grid.js';
import { hitStructures, structureLifeAt } from '../src/arpg/terrain.js';
import { depthGrowth } from '../src/arpg/world.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import { CELL, LOOK_IDS, type FloorMap } from '../src/types/floor-map.js';
import { arena, bal, dummy, press, registry, run, STEP } from './fixtures/arena.js';
import { floorWorld } from './fixtures/flow-map.js';
import { block, walledMap } from './fixtures/maps.js';

// See the room objects spec's "Crumbling cover": heavy and hold blows, ability areas and hazard
// bursts wear a structure where their area reaches its face (a cell of it beside a walkable cell
// the hit sees); at 0 life its cells turn to slow ground (rubble) and the map's version moves.

/** These cells of `map` one crumbling structure of `life`. */
function structure(map: FloorMap, cells: [number, number][], life = 100) {
  for (const [x, y] of cells) map.cells[y * map.width + x] = CELL.crumbling;
  const s = {
    id: map.structures.length,
    cells: cells.map(([x, y]) => ({ x, y })),
    life,
    maxLife: life,
  };
  map.structures.push(s);
  return s;
}

/**
 * A 16 × 16 map: a wall at x 10 (y 2–12), and structure 0 at x 8 (y 5–7), in front of it; a
 * world on it with its events.
 */
function setup() {
  const map = walledMap(16, 16, block(10, 2, 10, 12));
  const s = structure(map, block(8, 5, 8, 7));
  const w = floorWorld(map);
  const events: ArpgEvent[] = [];
  return { map, s, w, ctx: makeCtx(registry, w, events), events };
}

describe('structureLifeAt', () => {
  it("is structureLife a cell × the depth's foe life growth", () => {
    for (const depth of [1, 4, 12]) {
      const g = depthGrowth(registry, depth);
      expect(structureLifeAt(registry, depth, 3)).toBeCloseTo(
        bal.terrain.structureLife * 3 * g.hp * g.ramp,
        9,
      );
    }
  });
});

describe('hitStructures', () => {
  it('wears a structure whose face its area reaches, once a hit', () => {
    const { s, ctx, events } = setup();
    hitStructures(ctx, { x: 6.5, y: 6.5 }, 2, 30);
    expect(s.life).toBe(70);
    expect(events).toEqual([]);
  });

  it('leaves it be when its area falls short, or reaches it only from behind a wall', () => {
    const { s, ctx } = setup();
    hitStructures(ctx, { x: 6.5, y: 6.5 }, 1, 30);
    hitStructures(ctx, { x: 11.5, y: 6.5 }, 4, 30);
    expect(s.life).toBe(100);
  });

  it('a cone reaches it only facing it', () => {
    const { s, ctx } = setup();
    hitStructures(ctx, { x: 6.5, y: 6.5 }, 2, 30, { x: -1, y: 0 }, 120);
    expect(s.life).toBe(100);
    hitStructures(ctx, { x: 6.5, y: 6.5 }, 2, 30, { x: 1, y: 0 }, 120);
    expect(s.life).toBe(70);
  });

  it('wears every structure it reaches', () => {
    const { map, s, ctx } = setup();
    const other = structure(map, block(8, 8, 8, 9));
    hitStructures(ctx, { x: 7.5, y: 7.5 }, 1.5, 30);
    expect([s.life, other.life]).toEqual([70, 70]);
  });

  it('crumbles it to rubble at 0 life: slow ground, the version, the event, the fields rebuilt', () => {
    const { map, s, w, ctx, events } = setup();
    w.flow.nextAt = 99;
    hitStructures(ctx, { x: 6.5, y: 6.5 }, 2, 60);
    hitStructures(ctx, { x: 6.5, y: 6.5 }, 2, 60);
    const at = s.cells.map((c) => c.y * 16 + c.x);
    expect(at.map((i) => map.cells[i])).toEqual([CELL.slow, CELL.slow, CELL.slow]);
    expect(at.map((i) => map.look[i])).toEqual(Array(3).fill(LOOK_IDS.indexOf('rubble')));
    expect([s.life, map.version, w.flow.nextAt]).toEqual([0, 1, w.t]);
    expect(events).toEqual([{ kind: 'crumble', structure: 0, cells: s.cells }]);
    // Rubble is no structure: nothing more to wear.
    hitStructures(ctx, { x: 6.5, y: 6.5 }, 2, 60);
    expect([events.length, map.version]).toEqual([1, 1]);
  });

  it('is a no-op in the open room', () => {
    const w = arena([]);
    const s = structure(w.map, [[5, 5]]);
    hitStructures(makeCtx(registry, w, []), { x: 4.5, y: 5.5 }, 2, 30);
    expect(s.life).toBe(100);
  });
});

describe('a crumbled structure', () => {
  it('opens the way: the flow fields, sight and the fog follow it', () => {
    const map = walledMap(12, 12, []);
    structure(map, block(6, 0, 6, 11), 50);
    map.start = { x: 3.5, y: 6.5 };
    const w = floorWorld(map);
    run(w, STEP);
    const far = { x: 9.5, y: 6.5 };
    expect([w.flow.small![6 * 12 + 9], w.fog[6 * 12 + 9]]).toEqual([UNREACHED, 0]);
    expect(perceives(map, w.hero, far)).toBe(false);
    hitStructures(makeCtx(registry, w, []), w.hero, 3, 50);
    run(w, 2 * bal.ai.fogEvery);
    expect(w.flow.small![6 * 12 + 9]).toBe(6);
    expect(w.fog[6 * 12 + 9]).toBe(2);
    expect(perceives(map, w.hero, far)).toBe(true);
  });

  it("a Nova beside one wears it, as every ability's area does", () => {
    const map = walledMap(26, 40, []);
    const s = structure(map, block(15, 34, 15, 38));
    const w = arena([dummy(11, 36)], { noBasic: true, ultimate: { payment: 'mana' } });
    w.map = map;
    press(w, 2);
    expect(s.life).toBeLessThan(s.maxLife);
  });
});
