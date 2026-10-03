import { describe, it, expect } from 'vitest';
import {
  blocked,
  isWalkable,
  lineOfSight,
  moveCircle,
  openRoom,
  snapToWalkable,
} from '../src/arpg/grid.js';
import { clamp } from '../src/arpg/geometry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { FloorMap } from '../src/types/floor-map.js';

// See the floor maps spec: "Movement and combat on the grid".

/** A map from rows: '.' floor, '#' wall, 'D' one door's cells (closed when `closed`). */
function mapOf(rows: string[], closed = false): FloorMap {
  const map = openRoom(rows[0].length, rows.length);
  const door: { x: number; y: number }[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      map.cells[y * map.width + x] = ch === '#' ? 1 : ch === 'D' ? 2 : 0;
      if (ch === 'D') door.push({ x, y });
    }),
  );
  if (door.length) map.doors.push({ id: 0, cells: door, rooms: [0, 1], closed });
  return map;
}

/** Column 5 a wall, from top to bottom, in a 10 × 10 map. */
const WALL = mapOf(Array.from({ length: 10 }, () => '.....#....'));
/** The same, its row 5 a door. */
const DOORWAY = Array.from({ length: 10 }, (_, y) => (y === 5 ? '.....D....' : '.....#....'));
const R = 0.4;

/** Whether a circle's bounding square overlaps a blocked cell. */
function overlaps(map: FloorMap, p: { x: number; y: number }, r: number): boolean {
  for (let cy = Math.floor(p.y - r + 1e-9); cy <= Math.floor(p.y + r - 1e-9); cy++)
    for (let cx = Math.floor(p.x - r + 1e-9); cx <= Math.floor(p.x + r - 1e-9); cx++)
      if (blocked(map, cx, cy)) return true;
  return false;
}

describe('the open room', () => {
  const room = openRoom(26, 40);

  it("is today's arena: one open room, the hero at (w/2, h − 4)", () => {
    expect(room).toMatchObject({ width: 26, height: 40, open: true, start: { x: 13, y: 36 } });
    expect(room.rooms).toHaveLength(1);
    expect(room.doors).toEqual([]);
    expect(room.cells.every((c) => c === 0)).toBe(true);
  });

  it("moves a circle exactly as the arena's clamp did, from anywhere, by anything", () => {
    const rng = new SeededRNG(5);
    for (let i = 0; i < 2000; i++) {
      const r = 0.2 + rng.next() * 1.4;
      const p = { x: rng.next() * 30 - 2, y: rng.next() * 44 - 2 };
      const dx = (rng.next() - 0.5) * 60;
      const dy = (rng.next() - 0.5) * 60;
      expect(moveCircle(room, p, r, dx, dy)).toEqual({
        x: clamp(p.x + dx, r, 26 - r),
        y: clamp(p.y + dy, r, 40 - r),
      });
    }
  });

  it('snaps a point as the clamps did, and is walkable on exactly the closed rectangle', () => {
    const rng = new SeededRNG(6);
    for (let i = 0; i < 2000; i++) {
      const x = rng.next() * 40 - 7;
      const y = rng.next() * 54 - 7;
      for (const margin of [0, 1])
        expect(snapToWalkable(room, x, y, margin)).toEqual({
          x: Math.max(margin, Math.min(26 - margin, x)),
          y: Math.max(margin, Math.min(40 - margin, y)),
        });
      expect(isWalkable(room, x, y)).toBe(!(x < 0 || y < 0 || x > 26 || y > 40));
    }
    expect([isWalkable(room, 26, 40), isWalkable(room, 0, 0)]).toEqual([true, true]);
  });

  it('lets any two points on it see each other', () => {
    const rng = new SeededRNG(7);
    for (let i = 0; i < 500; i++) {
      const a = { x: rng.next() * 26, y: rng.next() * 40 };
      const b = { x: rng.next() * 26, y: rng.next() * 40 };
      expect(lineOfSight(room, a, b)).toBe(true);
    }
    expect(lineOfSight(room, { x: 0, y: 0 }, { x: 26, y: 40 })).toBe(true);
  });
});

describe('moveCircle', () => {
  it('slides along a wall: the blocked axis stops at it, the other moves on', () => {
    expect(moveCircle(WALL, { x: 3.5, y: 5 }, R, 3, 1)).toEqual({ x: 5 - R, y: 6 });
    expect(moveCircle(WALL, { x: 7.5, y: 5 }, R, -3, -1)).toEqual({ x: 6 + R, y: 4 });
  });

  it('never tunnels, however far one step goes', () => {
    expect(moveCircle(WALL, { x: 1, y: 5 }, R, 100, 0).x).toBe(5 - R);
    expect(moveCircle(WALL, { x: 9, y: 5 }, R, -100, 0).x).toBe(6 + R);
  });

  it('holds the map edges as walls', () => {
    expect(moveCircle(WALL, { x: 1, y: 1 }, R, -5, -5)).toEqual({ x: R, y: R });
    expect(moveCircle(WALL, { x: 9, y: 9 }, R, 5, 5)).toEqual({ x: 10 - R, y: 10 - R });
  });

  it('puts a circle pressed into a wall back out; a closed door stops it, an open one not', () => {
    expect(moveCircle(WALL, { x: 4.9, y: 5 }, R, 0, 0)).toEqual({ x: 5 - R, y: 5 });
    expect(moveCircle(mapOf(DOORWAY, true), { x: 3.5, y: 5.5 }, R, 3, 0).x).toBe(5 - R);
    expect(moveCircle(mapOf(DOORWAY, false), { x: 3.5, y: 5.5 }, R, 3, 0).x).toBe(6.5);
  });

  it('never ends inside a wall: random moves among pillars', () => {
    const map = mapOf([
      '............',
      '..#.....#...',
      '.....##.....',
      '..#.....#...',
      '........##..',
      '.##.........',
      '......#.....',
      '............',
    ]);
    const rng = new SeededRNG(9);
    let p = { x: 0.5, y: 0.5 };
    for (let i = 0; i < 5000; i++) {
      const r = 0.25 + rng.next() * 0.2;
      if (overlaps(map, p, r)) p = { x: 0.5, y: 0.5 };
      p = moveCircle(map, p, r, (rng.next() - 0.5) * 6, (rng.next() - 0.5) * 6);
      expect(overlaps(map, p, r), `${p.x}, ${p.y} r ${r}`).toBe(false);
    }
  });
});

describe('snapToWalkable', () => {
  it('moves a point in a wall to the nearest walkable cell, inside the margin', () => {
    expect(snapToWalkable(WALL, 5.2, 3.5)).toEqual({ x: 4.5, y: 3.5 });
    expect(snapToWalkable(WALL, 5.8, 3.5)).toEqual({ x: 6.5, y: 3.5 });
    expect(snapToWalkable(WALL, -3, 20, 1)).toEqual({ x: 1, y: 9 });
  });
});

describe('lineOfSight', () => {
  it('stops at a wall, a closed door and the map edge; passes an open door', () => {
    expect(lineOfSight(WALL, { x: 2, y: 2 }, { x: 8, y: 8 })).toBe(false);
    expect(lineOfSight(WALL, { x: 2, y: 2 }, { x: 4.9, y: 9 })).toBe(true);
    expect(lineOfSight(WALL, { x: 2, y: 2 }, { x: 5.5, y: 2 })).toBe(false);
    expect(lineOfSight(WALL, { x: 2, y: 2 }, { x: -1, y: 2 })).toBe(false);
    expect(lineOfSight(mapOf(DOORWAY, false), { x: 2, y: 5.5 }, { x: 8, y: 5.5 })).toBe(true);
    expect(lineOfSight(mapOf(DOORWAY, true), { x: 2, y: 5.5 }, { x: 8, y: 5.5 })).toBe(false);
  });

  it('sees past a pillar only where nothing is in the way, never through a diagonal crack', () => {
    const map = mapOf(['......', '..#...', '......', '......']);
    expect(lineOfSight(map, { x: 0.5, y: 0.5 }, { x: 5.5, y: 0.5 })).toBe(true);
    expect(lineOfSight(map, { x: 0.5, y: 1.5 }, { x: 5.5, y: 1.5 })).toBe(false);
    expect(lineOfSight(map, { x: 0.5, y: 2.5 }, { x: 5.5, y: 0.5 })).toBe(false);
    expect(lineOfSight(mapOf(['.#', '#.']), { x: 0.5, y: 0.5 }, { x: 1.5, y: 1.5 })).toBe(false);
  });

  it('is the same both ways', () => {
    const map = mapOf(['........', '..#..#..', '...##...', '........', '.#....#.']);
    const rng = new SeededRNG(3);
    for (let i = 0; i < 500; i++) {
      const a = { x: rng.next() * 8, y: rng.next() * 5 };
      const b = { x: rng.next() * 8, y: rng.next() * 5 };
      expect(lineOfSight(map, a, b)).toBe(lineOfSight(map, b, a));
    }
  });
});
