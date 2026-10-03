import { describe, it, expect } from 'vitest';
import { UNREACHED, downhill, flowField } from '../src/arpg/flow.js';
import { arena, bal, dummy, run } from './fixtures/arena.js';
import { block, onMap, walledMap } from './fixtures/maps.js';

// Flow-field pathing (see the floor maps spec's "Monsters"): a BFS toward the hero
// per clearance class, rebuilt at `ai.flowEvery` marks, that foes step down.

/**
 * 12 × 7: a wall down column 6 with a one-cell gap at row 1 and a three-cell
 * gap at rows 4 to 6 (the bottom edge).
 */
const GAPS = walledMap(12, 7, [
  [6, 0],
  [6, 2],
  [6, 3],
]);
const at = (f: Uint16Array, x: number, y: number) => f[y * 12 + x];

describe('flowField', () => {
  it('counts steps to the target round walls, and stops at its radius', () => {
    const f = flowField(GAPS, { x: 10.5, y: 1.5 }, 30, 1);
    expect(at(f, 10, 1)).toBe(0);
    expect(at(f, 7, 1)).toBe(3);
    // Through the one-cell gap.
    expect(at(f, 5, 1)).toBe(5);
    expect(at(f, 6, 0)).toBe(UNREACHED);
    const near = flowField(GAPS, { x: 10.5, y: 1.5 }, 4, 1);
    expect(at(near, 7, 1)).toBe(3);
    expect(at(near, 5, 1)).toBe(UNREACHED);
  });

  it('a large foe goes round by the wide gap, never the narrow one', () => {
    const f = flowField(GAPS, { x: 10.5, y: 1.5 }, 30, 2);
    // Each counted cell's 3 × 3 is open: the one-cell gap isn't.
    expect(at(f, 6, 1)).toBe(UNREACHED);
    expect(at(f, 6, 5)).not.toBe(UNREACHED);
    expect(at(f, 4, 4)).toBeGreaterThan(at(flowField(GAPS, { x: 10.5, y: 1.5 }, 30, 1), 4, 4));
  });

  it('a closed door is a wall to it', () => {
    const map = walledMap(5, 3, [
      [2, 0],
      [2, 2],
    ]);
    map.cells[1 * 5 + 2] = 2;
    map.doors.push({ id: 0, cells: [{ x: 2, y: 1 }], rooms: [0, 1], closed: false });
    expect(at5(flowField(map, { x: 4.5, y: 1.5 }, 30, 1), 0, 1)).toBe(4);
    map.doors[0].closed = true;
    expect(at5(flowField(map, { x: 4.5, y: 1.5 }, 30, 1), 0, 1)).toBe(UNREACHED);
  });
});

const at5 = (f: Uint16Array, x: number, y: number) => f[y * 5 + x];

describe('downhill', () => {
  it('steps toward the nearer neighbour, diagonally where both sides are open', () => {
    const f = flowField(GAPS, { x: 10.5, y: 1.5 }, 30, 1);
    const d = downhill(GAPS, f, { x: 8.5, y: 3.5 }, { x: 10.5, y: 1.5 })!;
    expect(d.x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(d.y).toBeCloseTo(-Math.SQRT1_2, 9);
    // In the target's own cell: straight at it.
    expect(downhill(GAPS, f, { x: 10.2, y: 1.5 }, { x: 10.5, y: 1.5 })).toEqual({ x: 1, y: 0 });
  });

  it('is null where the field doesn’t reach', () => {
    const f = flowField(GAPS, { x: 10.5, y: 1.5 }, 2, 1);
    expect(downhill(GAPS, f, { x: 2.5, y: 3.5 }, { x: 10.5, y: 1.5 })).toBeNull();
  });
});

describe('flowTick', () => {
  it('builds both fields at its marks on a map, and none in the open room', () => {
    const open = arena([dummy(2, 2)], { noBasic: true });
    run(open, 0.5);
    expect(open.flow.small).toBeNull();
    const w = onMap(arena([dummy(2, 2)], { noBasic: true }), block(0, 30, 25, 31));
    run(w, 1 / 30);
    const first = w.flow.small;
    expect(first).not.toBeNull();
    expect(w.flow.large).not.toBeNull();
    expect(w.flow.nextAt).toBeCloseTo(w.t + bal.ai.flowEvery, 9);
    run(w, 1 / 30);
    expect(w.flow.small).toBe(first);
    run(w, bal.ai.flowEvery);
    expect(w.flow.small).not.toBe(first);
    // The hero's cell is 0.
    expect(w.flow.small![Math.floor(w.hero.y) * w.width + Math.floor(w.hero.x)]).toBe(0);
  });
});
