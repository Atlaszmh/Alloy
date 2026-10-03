import { describe, it, expect } from 'vitest';
import { clipSight, isWalkable, lineOfSight, openRoom, sees, shift } from '../src/arpg/grid.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { block, walledMap } from './fixtures/maps.js';

// The grid's sight helpers (see the floor maps spec's "Line of sight"): every hit
// site asks `sees`, and `clipSight` clips what can't be seen.

/** Column 5 a wall, from top to bottom, in a 10 × 10 map. */
const WALL = walledMap(10, 10, block(5, 0, 5, 9));

describe('sees', () => {
  it('is lineOfSight on a map with walls, and always true in the open room', () => {
    expect(sees(WALL, { x: 2, y: 2 }, { x: 8, y: 2 })).toBe(false);
    expect(sees(WALL, { x: 2, y: 2 }, { x: 4, y: 8 })).toBe(true);
    const open = openRoom(10, 10);
    expect(sees(open, { x: 2, y: 2 }, { x: 8, y: 2 })).toBe(true);
    // Even from off the map: the open room keeps no sight rules at all.
    expect(sees(open, { x: -1, y: 2 }, { x: 8, y: 2 })).toBe(true);
  });
});

describe('clipSight', () => {
  it('is the far point when nothing is in the way', () => {
    expect(clipSight(WALL, { x: 2, y: 2 }, { x: 4, y: 8 })).toEqual({ x: 4, y: 8 });
  });

  it('stops a hair short of the first blocked cell, on a walkable point', () => {
    const p = clipSight(WALL, { x: 2, y: 2 }, { x: 8, y: 5 });
    expect(p.x).toBeCloseTo(5, 5);
    expect(p.x).toBeLessThan(5);
    expect(p.y).toBeCloseTo(3.5, 5);
    expect(isWalkable(WALL, p.x, p.y)).toBe(true);
    expect(lineOfSight(WALL, { x: 2, y: 2 }, p)).toBe(true);
  });

  it('stops at the map edge, and stays put from inside a wall', () => {
    const map = walledMap(10, 10, []);
    expect(clipSight(map, { x: 2, y: 2 }, { x: -3, y: 2 }).x).toBeCloseTo(0, 5);
    expect(clipSight(WALL, { x: 5.5, y: 2 }, { x: 8, y: 2 })).toEqual({ x: 5.5, y: 2 });
  });

  it('always lands where its start can see, among pillars', () => {
    const map = walledMap(12, 12, [...block(3, 3, 4, 4), ...block(7, 2, 7, 9), [2, 8]]);
    const rng = new SeededRNG(5);
    for (let i = 0; i < 500; i++) {
      const a = { x: rng.next() * 12, y: rng.next() * 12 };
      if (!isWalkable(map, a.x, a.y)) continue;
      const p = clipSight(map, a, { x: rng.next() * 14 - 1, y: rng.next() * 14 - 1 });
      expect(lineOfSight(map, a, p), `${a.x}, ${a.y} → ${p.x}, ${p.y}`).toBe(true);
    }
  });

  it('is the far point in the open room, wherever that is', () => {
    expect(clipSight(openRoom(10, 10), { x: 2, y: 2 }, { x: 14, y: 2 })).toEqual({ x: 14, y: 2 });
  });
});

describe('shift', () => {
  it('slides a body along a wall, and moves it freely in the open room', () => {
    const body = { x: 3, y: 2 };
    shift(WALL, body, 0.5, 4, 1);
    expect(body).toEqual({ x: 4.5, y: 3 });
    const free = { x: 3, y: 2 };
    shift(openRoom(10, 10), free, 0.5, 9, 1);
    expect(free).toEqual({ x: 12, y: 3 });
  });
});
