import type { Vec } from '../types/arpg.js';
import type { FloorMap } from '../types/floor-map.js';
import { clamp } from './geometry.js';

/**
 * The floor grid (see the floor maps spec): 1-unit cells, out of bounds a
 * wall, a closed door's cells walls too. A point on the map's far edge
 * (x = width, y = height) is in its last cell, so the map is the closed
 * rectangle [0, width] × [0, height], as the arena's clamps had it.
 */

const EPS = 1e-9;

/** Today's arena as a map: one open room, the hero starting at (w/2, h − 4). */
export function openRoom(width: number, height: number): FloorMap {
  const start = { x: width / 2, y: height - 4 };
  return {
    width,
    height,
    cells: new Uint8Array(width * height),
    rooms: [
      {
        id: 0,
        kind: 'combat',
        rect: { x: 0, y: 0, w: width, h: height },
        revealed: true,
        cleared: false,
        sealed: false,
      },
    ],
    doors: [],
    start,
    exit: { ...start },
    open: true,
  };
}

/** Whether cell (cx, cy) stops movement and sight: out of bounds, a wall, or a closed door's. */
export function blocked(map: FloorMap, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return true;
  const cell = map.cells[cy * map.width + cx];
  if (cell !== 2) return cell === 1;
  // ponytail: scans the doors for each door cell; index them if sealing ever runs hot.
  return map.doors.some((d) => d.closed && d.cells.some((c) => c.x === cx && c.y === cy));
}

/** The cell a coordinate falls in along an axis of `n` cells (the far edge is the last cell's). */
function cellOf(v: number, n: number): number {
  return v === n ? n - 1 : Math.floor(v);
}

/** Whether the point (x, y) stands on a cell nothing blocks (out of the map counts as blocked). */
export function isWalkable(map: FloorMap, x: number, y: number): boolean {
  return !blocked(map, cellOf(x, map.width), cellOf(y, map.height));
}

/**
 * Move a circle by (dx, dy), sliding along walls: x first, then y, each axis
 * stopping where the circle's bounding square (half-side `radius`) would
 * touch the first blocked cell along its sweep, so nothing tunnels however
 * far it moves. A circle already pressed into a wall beside it is put back
 * out, and the map's edges hold it `radius` inside. In the open room this is
 * the arena's clamp to [r, width − r] × [r, height − r] exactly.
 */
export function moveCircle(map: FloorMap, pos: Vec, radius: number, dx: number, dy: number): Vec {
  const x = slide(map, pos.x, pos.y, radius, dx, true);
  return { x, y: slide(map, pos.y, x, radius, dy, false) };
}

/** One axis of `moveCircle`: `at` along the axis (x when `alongX`), `across` the other coordinate. */
function slide(
  map: FloorMap,
  at: number,
  across: number,
  r: number,
  d: number,
  alongX: boolean,
): number {
  const n = alongX ? map.width : map.height;
  const m = alongX ? map.height : map.width;
  // The rows (or columns) the square covers across the axis.
  const first = Math.max(0, Math.floor(across - r + EPS));
  const last = Math.min(m - 1, Math.floor(across + r - EPS));
  const wall = (c: number) => {
    for (let k = first; k <= last; k++)
      if (alongX ? blocked(map, c, k) : blocked(map, k, c)) return true;
    return false;
  };
  const c0 = Math.floor(at);
  let lo = r;
  let hi = n - r;
  const ahead = at + Math.max(0, d) + r;
  for (let c = Math.max(0, c0 + 1); c < n && c < ahead - EPS; c++)
    if (wall(c)) {
      hi = Math.min(hi, c - r);
      break;
    }
  const behind = at + Math.min(0, d) - r;
  for (let c = Math.min(n - 1, c0 - 1); c >= 0 && c + 1 > behind + EPS; c--)
    if (wall(c)) {
      lo = Math.max(lo, c + 1 + r);
      break;
    }
  // A gap narrower than the body: it holds where it is on this axis, never pushed into either side.
  if (lo > hi) return at;
  return clamp(at + d, lo, hi);
}

/**
 * (x, y) kept `margin` inside the map's edges; if that is a blocked cell, the
 * centre of the nearest walkable cell instead (ring by ring around it). In the
 * open room this is the arena's clamp to [margin, width − margin] ×
 * [margin, height − margin] exactly.
 */
export function snapToWalkable(map: FloorMap, x: number, y: number, margin = 0): Vec {
  const p = { x: clamp(x, margin, map.width - margin), y: clamp(y, margin, map.height - margin) };
  if (isWalkable(map, p.x, p.y)) return p;
  const cx = cellOf(p.x, map.width);
  const cy = cellOf(p.y, map.height);
  for (let ring = 1; ring < Math.max(map.width, map.height); ring++) {
    let best: Vec | null = null;
    let bestD = Infinity;
    for (let j = cy - ring; j <= cy + ring; j++)
      for (let i = cx - ring; i <= cx + ring; i++) {
        if (Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== ring || blocked(map, i, j)) continue;
        const d = (i + 0.5 - p.x) ** 2 + (j + 0.5 - p.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: i + 0.5, y: j + 0.5 };
        }
      }
    if (best) return best;
  }
  return p;
}

/**
 * Whether nothing blocks the segment from `a` to `b`: a DDA walk of the cells
 * it crosses, both ends included. A segment through a cell corner is blocked
 * if either cell beside the corner is, so nothing sees through a diagonal
 * crack. In the open room any two points on the map see each other.
 */
export function lineOfSight(map: FloorMap, a: Vec, b: Vec): boolean {
  return blockedAt(map, a, b) === null;
}

/**
 * Where along the segment from `a` to `b` (0 at a, 1 at b) it first meets a
 * blocked cell, as `lineOfSight` walks it; null when nothing blocks it.
 */
function blockedAt(map: FloorMap, a: Vec, b: Vec): number | null {
  let cx = cellOf(a.x, map.width);
  let cy = cellOf(a.y, map.height);
  if (blocked(map, cx, cy)) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  // Where along the segment (0 at a, 1 at b) it crosses the next column (row) line, worked out
  // afresh each step so no error builds up.
  const tx = () => (sx ? (cx + (sx > 0 ? 1 : 0) - a.x) / dx : Infinity);
  const ty = () => (sy ? (cy + (sy > 0 ? 1 : 0) - a.y) / dy : Infinity);
  for (let x = tx(), y = ty(); Math.min(x, y) < 1; x = tx(), y = ty()) {
    if (x === y && (blocked(map, cx + sx, cy) || blocked(map, cx, cy + sy))) return x;
    if (x <= y) cx += sx;
    if (y <= x) cy += sy;
    if (blocked(map, cx, cy)) return Math.min(x, y);
  }
  return isWalkable(map, b.x, b.y) ? null : 1;
}

/**
 * Whether `a` sees `b` (see the floor maps spec's "Line of sight"): every hit
 * site asks this. The open room has no walls, so there anything sees anything.
 */
export function sees(map: FloorMap, a: Vec, b: Vec): boolean {
  return map.open || lineOfSight(map, a, b);
}

/**
 * `b` if `a` sees it, else the last point before the segment from `a` meets
 * its first blocked cell (`a` itself in a wall): where a beam ends, a shot
 * bursts, Blink lands, and an aim point or a scattered impact is clipped to.
 */
export function clipSight(map: FloorMap, a: Vec, b: Vec): Vec {
  if (map.open) return b;
  const at = blockedAt(map, a, b);
  if (at === null) return b;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  // A hair short of the blocked cell, so the point stands in the last open one.
  const k = len > 0 ? Math.max(0, at - 1e-6 / len) : 0;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/**
 * Move a body by (dx, dy) on the grid (`moveCircle`); in the open room it
 * moves freely, as it always has (the end of the tick puts a foe back inside).
 */
export function shift(
  map: FloorMap,
  body: { x: number; y: number },
  radius: number,
  dx: number,
  dy: number,
): void {
  if (map.open) {
    body.x += dx;
    body.y += dy;
  } else Object.assign(body, moveCircle(map, body, radius, dx, dy));
}
