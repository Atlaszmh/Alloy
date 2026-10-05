import { describe, it, expect } from 'vitest';
import { flowField, UNREACHED } from '../src/arpg/flow.js';
import type { HazardEntity, PropEntity } from '../src/types/arpg.js';
import { bal, run, STEP } from './fixtures/arena.js';
import { floorWorld } from './fixtures/flow-map.js';
import { walledMap } from './fixtures/maps.js';

// See the room objects spec's "Footprints": the flow fields treat every cell a standing prop or
// hazard overlaps as blocked, so foes path round it; a broken prop's cells open again.

/** Column 6 of a 12 × 12 map (no walls), as cell indices. */
const COLUMN = new Set(Array.from({ length: 12 }, (_, y) => y * 12 + 6));

const prop = (x: number, y: number, dead = false): PropEntity => ({
  type: 'prop',
  id: 900,
  kind: 'urn',
  x,
  y,
  radius: 0.4,
  life: 1,
  dead,
});

const hazard = (x: number, y: number): HazardEntity => ({
  type: 'hazard',
  id: 901,
  kind: 'brazier',
  element: 'fire',
  x,
  y,
  radius: 0.45,
  burst: 2,
  state: 'dormant',
  until: 1e9,
});

describe('flowField', () => {
  it('treats the cells it is given as blocked', () => {
    const map = walledMap(12, 12, []);
    const target = { x: 9.5, y: 6.5 };
    expect(flowField(map, target, 100, 1)[6 * 12 + 3]).toBe(6);
    const field = flowField(map, target, 100, 1, COLUMN);
    expect([field[6 * 12 + 3], field[6 * 12 + 6]]).toEqual([UNREACHED, UNREACHED]);
  });

  it("keeps a large foe's square off them too", () => {
    const map = walledMap(12, 12, []);
    const field = flowField(map, { x: 2.5, y: 2.5 }, 100, 2, new Set([6 * 12 + 6]));
    expect([field[5 * 12 + 5], field[6 * 12 + 7], field[8 * 12 + 8]]).toEqual([
      UNREACHED,
      UNREACHED,
      11, // from (3, 3), a step off: its square holds the target's cell
    ]);
  });
});

describe('flowTick', () => {
  it("routes round a standing prop's or hazard's footprint, and through a broken prop", () => {
    const w = floorWorld(walledMap(12, 12, []));
    Object.assign(w.hero, { x: 2.5, y: 2.5 });
    w.props = [prop(6.5, 6.5)];
    w.hazards = [hazard(9.5, 9.5)];
    run(w, STEP);
    expect(w.flow.small![6 * 12 + 6]).toBe(UNREACHED);
    expect(w.flow.small![9 * 12 + 9]).toBe(UNREACHED);
    expect(w.flow.small![6 * 12 + 7]).toBe(9);
    w.props[0].dead = true;
    run(w, bal.ai.flowEvery);
    expect(w.flow.small![6 * 12 + 6]).toBe(8);
    expect(w.flow.small![9 * 12 + 9]).toBe(UNREACHED);
  });
});
