import type { ArpgWorld, MonsterEntity } from '../../src/types/arpg.js';
import type { FloorMap, Interactable, RoomKind } from '../../src/types/floor-map.js';
import { arena } from './arena.js';

/**
 * A small floor for the floor flow's tests (no generator needed), 26 × 12:
 * room 0, the start (cells x 1–8, y 1–10), and room 1 of `kind` (cells x 13–24,
 * y 1–10), joined by a hall 3 cells wide at y 5–7 that is all doors: door 0
 * (x 9–10, `rooms` [0, 1]) in room 0's wall, door 1 (x 11–12, [1, 0]) in room
 * 1's. The hero starts at (4.5, 6); room 1's centre, (19, 6), holds `it` (its id
 * `<depth>:1`) and the exit.
 */
export function twoRooms(
  kind: RoomKind,
  it?: Partial<Interactable> & Pick<Interactable, 'kind'>,
  depth = 2,
): FloorMap {
  const width = 26;
  const height = 12;
  const cells = new Uint8Array(width * height).fill(1);
  const fill = (x0: number, x1: number, y0: number, y1: number, v: 0 | 2) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells[y * width + x] = v;
  };
  fill(1, 8, 1, 10, 0);
  fill(13, 24, 1, 10, 0);
  fill(9, 12, 5, 7, 2);
  const door = (id: number, x0: number, rooms: [number, number]) => ({
    id,
    cells: [x0, x0 + 1].flatMap((x) => [5, 6, 7].map((y) => ({ x, y }))),
    rooms,
    closed: false,
  });
  return {
    width,
    height,
    cells,
    rooms: [
      {
        id: 0,
        kind: 'start',
        rect: { x: 1, y: 1, w: 8, h: 10 },
        revealed: false,
        cleared: false,
        sealed: false,
      },
      {
        id: 1,
        kind,
        rect: { x: 13, y: 1, w: 12, h: 10 },
        revealed: false,
        cleared: false,
        sealed: false,
        ...(it && { interactable: { id: `${depth}:1`, x: 19, y: 6, used: false, ...it } }),
      },
    ],
    doors: [door(0, 9, [0, 1]), door(1, 11, [1, 0])],
    start: { x: 4.5, y: 6 },
    exit: { x: 19, y: 6 },
    open: false,
  };
}

/** `w` on `map`: its size, an unseen fog, the hero at the map's start. */
export function onMap(w: ArpgWorld, map: FloorMap): ArpgWorld {
  w.map = map;
  w.width = map.width;
  w.height = map.height;
  w.fog = new Uint8Array(map.width * map.height);
  w.hero.x = map.start.x;
  w.hero.y = map.start.y;
  return w;
}

/** The fixture's arena on `map` (the hero's basic attack stopped), holding exactly `monsters`. */
export function floorWorld(map: FloorMap, monsters: Partial<MonsterEntity>[] = []): ArpgWorld {
  return onMap(arena(monsters, { noBasic: true }), map);
}
