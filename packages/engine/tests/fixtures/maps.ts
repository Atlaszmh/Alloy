import { openRoom } from '../../src/arpg/grid.js';
import type { ArpgWorld } from '../../src/types/arpg.js';
import type { FloorMap } from '../../src/types/floor-map.js';

/**
 * A hand-built floor map (not the open room, so walls, sight and the AI's
 * rules hold): `width` × `height` cells, these cells walls; one room covering
 * it all.
 */
export function walledMap(width: number, height: number, walls: [number, number][]): FloorMap {
  const map = { ...openRoom(width, height), open: false };
  for (const [x, y] of walls) map.cells[y * width + x] = 1;
  return map;
}

/** The cells of the rectangle from (x0, y0) to (x1, y1), both included. */
export function block(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const cells: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push([x, y]);
  return cells;
}

/** The fixture's world (26 × 40, the hero at (13, 36)) on a hand-built map with these walls. */
export function onMap(w: ArpgWorld, walls: [number, number][]): ArpgWorld {
  w.map = walledMap(w.width, w.height, walls);
  return w;
}

/** Row 30 a wall from side to side, two cells thick (rows 30 and 31): the hero starts below it. */
export const WALL_30 = block(0, 30, 25, 31);
