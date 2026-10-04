import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { onRoomWall, tutorialFloorProblems } from '../src/data/tutorial-floor-schema.js';
import type { TutorialFloorDef } from '../src/types/tutorial-floor.js';

// See the tutorial spec's "Hand-built floors": each floor's data is checked (a reachable exit,
// markers and spawns on walkable cells inside their rooms, doors on room walls, one interactable
// a room).

const data = createDefaultRegistry().getTutorialData();
/** Start | door 0 | exit, the walk marker beside the gate. */
const TWO_ROOMS: TutorialFloorDef = {
  id: 'd1-1',
  dive: 1,
  depth: 1,
  rows: ['#########', '#...#...#', '#.S.0.X.#', '#...#...#', '#########'],
  rooms: [
    { id: 0, kind: 'start', rect: { x: 1, y: 1, w: 3, h: 3 } },
    { id: 1, kind: 'exit', rect: { x: 5, y: 1, w: 3, h: 3 } },
  ],
  spawns: [],
  markers: [{ id: 'walk', at: { x: 6.5, y: 1.5 } }],
  drops: [],
};
const floor = (f: Partial<TutorialFloorDef>) =>
  tutorialFloorProblems(
    new DataRegistry({
      ...loadAndValidateData(),
      tutorial: { ...data, floors: [{ ...TWO_ROOMS, ...f }] },
    }),
  );
/** TWO_ROOMS with cell (x, y) set to `c`. */
const put = (x: number, y: number, c: string) =>
  TWO_ROOMS.rows.map((r, j) => (j === y ? r.slice(0, x) + c + r.slice(x + 1) : r));
const rat = { id: 'rat', monster: 'mine_rat', at: { x: 6.5, y: 3.5 }, room: 1 };

describe('onRoomWall', () => {
  it('is a cell just outside a room, beside one of its edges', () => {
    const rect = { x: 1, y: 1, w: 3, h: 3 };
    const on = [
      [0, 1],
      [4, 3],
      [2, 0],
      [3, 4],
    ];
    const off = [
      [2, 2],
      [0, 0],
      [4, 4],
      [5, 2],
    ];
    expect(on.map(([x, y]) => onRoomWall(rect, { x, y }))).toEqual([true, true, true, true]);
    expect(off.map(([x, y]) => onRoomWall(rect, { x, y }))).toEqual([false, false, false, false]);
  });
});

describe("a hand-built floor's geometry", () => {
  it('passes two rooms joined by a door on their wall, the exit, the marker and a foe in reach', () => {
    expect(floor({ spawns: [rat] })).toEqual([]);
  });

  it('names an exit, a marker and a foe out of reach of the start', () => {
    expect(floor({ rows: put(4, 2, '#'), spawns: [rat] })).toEqual([
      'd1-1: X at (6, 2) out of reach',
      'd1-1: marker walk out of reach',
      'd1-1: spawn rat out of reach',
    ]);
  });

  it("names a door off every room's wall, and one on two sealing rooms' walls", () => {
    expect(floor({ rows: put(4, 4, '1') })).toEqual(["d1-1: door 1 on a room's wall"]);
    const rooms = TWO_ROOMS.rooms.map((r) => ({ ...r, kind: 'den' as const }));
    expect(floor({ rooms })).toEqual(["d1-1: door 0 on one sealing room's wall"]);
  });

  it('names the start and an interactable outside the rooms, and a second interactable in a room', () => {
    const rows = put(2, 2, '.').map((r, j) => (j === 3 ? '#...S...#' : r));
    expect(floor({ rows })).toEqual(['d1-1: S in a room']);
    expect(floor({ rows: put(4, 1, 'H') })).toEqual(['d1-1: H at (4, 1) in a room']);
    expect(floor({ rows: put(5, 1, 'C') })).toEqual(['d1-1: room 1 holds one interactable']);
  });

  it('names a marker in a doorway, outside every room', () => {
    expect(floor({ markers: [{ id: 'walk', at: { x: 4.5, y: 2.5 } }] })).toEqual([
      'd1-1: marker walk in a room',
    ]);
  });
});
