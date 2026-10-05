import type { Vec } from '../types/arpg.js';
import { CELL, type Door, type FloorMap, type TerrainBalance } from '../types/floor-map.js';
import { clamp } from './geometry.js';

/**
 * The floor grid (see the floor maps spec): 1-unit cells, out of bounds a
 * wall, a shut door's cells walls too. A point on the map's far edge
 * (x = width, y = height) is in its last cell, so the map is the closed
 * rectangle [0, width] × [0, height], as the arena's clamps had it. Every
 * reader asks one of two predicates (see the room objects spec): `solid` (a
 * cell that stops movement, shots and hits) or `perceives` (sight).
 */

const EPS = 1e-9;

/** Today's arena as a map: one open room, the hero starting at (w/2, h − 4). */
export function openRoom(width: number, height: number): FloorMap {
  const start = { x: width / 2, y: height - 4 };
  return {
    width,
    height,
    cells: new Uint8Array(width * height),
    look: new Uint8Array(width * height),
    structures: [],
    version: 0,
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

/** Whether a door is shut: closed by a seal, or held by the guided start's gate. */
export function doorShut(d: Door): boolean {
  return d.closed || !!d.held;
}

/**
 * Set a door's `closed` (the seal's) or `held` (the guided start's), bumping
 * the map's `version` when that opens or shuts it (see the room objects spec).
 */
export function setDoor(map: FloorMap, d: Door, by: 'closed' | 'held', on: boolean): void {
  const was = doorShut(d);
  d[by] = on;
  if (doorShut(d) !== was) map.version++;
}

/**
 * Whether a cell code is solid by itself: a wall, cover or crumbling cover. A
 * door's cell is solid only while its door is shut (`solid` reads the doors);
 * foliage and slow ground never are.
 */
export function solidCode(code: number): boolean {
  return code === CELL.wall || code === CELL.cover || code === CELL.crumbling;
}

/**
 * Whether cell (cx, cy) is solid (see the room objects spec's predicates): out
 * of bounds, a wall, cover, crumbling cover or a shut door's. Movement, the
 * flow fields, spawns, shots and hits stop at it; foliage never stops a hit or
 * a shot.
 */
export function solid(map: FloorMap, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return true;
  const cell = map.cells[cy * map.width + cx];
  if (cell !== CELL.door) return solidCode(cell);
  // ponytail: scans the doors for each door cell; index them if sealing ever runs hot.
  return map.doors.some((d) => doorShut(d) && d.cells.some((c) => c.x === cx && c.y === cy));
}

/** The cell a coordinate falls in along an axis of `n` cells (the far edge is the last cell's). */
function cellOf(v: number, n: number): number {
  return v === n ? n - 1 : Math.floor(v);
}

/** Whether the point (x, y) stands on a cell that isn't solid (out of the map counts as solid). */
export function isWalkable(map: FloorMap, x: number, y: number): boolean {
  return !solid(map, cellOf(x, map.width), cellOf(y, map.height));
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
      if (alongX ? solid(map, c, k) : solid(map, k, c)) return true;
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
        if (Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== ring || solid(map, i, j)) continue;
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
 * Whether no solid cell blocks the segment from `a` to `b`: a DDA walk of the
 * cells it crosses, both ends included. A segment through a cell corner is
 * blocked if either cell beside the corner is, so nothing sees through a
 * diagonal crack. In the open room any two points on the map see each other.
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
  if (solid(map, cx, cy)) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  // Where along the segment (0 at a, 1 at b) it crosses the next column (row) line, worked out
  // afresh each step so no error builds up.
  const tx = () => (sx ? (cx + (sx > 0 ? 1 : 0) - a.x) / dx : Infinity);
  const ty = () => (sy ? (cy + (sy > 0 ? 1 : 0) - a.y) / dy : Infinity);
  for (let x = tx(), y = ty(); Math.min(x, y) < 1; x = tx(), y = ty()) {
    if (x === y && (solid(map, cx + sx, cy) || solid(map, cx, cy + sy))) return x;
    if (x <= y) cx += sx;
    if (y <= x) cy += sy;
    if (solid(map, cx, cy)) return Math.min(x, y);
  }
  return isWalkable(map, b.x, b.y) ? null : 1;
}

/**
 * Whether nothing solid stands between `a` and `b` (see the floor maps spec's
 * "Line of sight"): a hit's or a shot's line, which every hit site asks
 * (foliage never stops one). The open room has no walls, so there anything
 * reaches anything.
 */
export function sees(map: FloorMap, a: Vec, b: Vec): boolean {
  return map.open || lineOfSight(map, a, b);
}

/** The terrain numbers each map's sight and ground read (`bindTerrain`). */
const terrains = new WeakMap<FloorMap, TerrainBalance>();

/**
 * Bind `delve.terrain` to a map, for `perceives`' foliage and `groundSpeed`'s
 * slow ground. `terrainTick` binds it every tick, so only a world's very first
 * step (its hero's, before the hook) reads the map unbound: no foliage hides
 * and no ground slows.
 */
export function bindTerrain(map: FloorMap, terrain: TerrainBalance): void {
  terrains.set(map, terrain);
}

/** The terrain numbers bound to a map (`bindTerrain`), if any. */
export function terrainOf(map: FloorMap): TerrainBalance | undefined {
  return terrains.get(map);
}

/**
 * The ground's pace at point `p` (see the room objects spec's "Slow ground"):
 * `terrain.slowMult` on slow ground (`bossSlowMult` for a boss), else 1, and 1
 * off the map or on a map with no terrain bound. `groundSpeed` and the hero's
 * pushes read it.
 */
export function groundAt(map: FloorMap, p: Vec, boss = false): number {
  const t = terrains.get(map);
  const cx = Math.floor(p.x);
  const cy = Math.floor(p.y);
  if (!t || cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return 1;
  if (map.cells[cy * map.width + cx] !== CELL.slow) return 1;
  return boss ? t.bossSlowMult : t.slowMult;
}

/** The index (`y × width + x`) of the cell a point stands in. */
function cellIndex(map: FloorMap, p: Vec): number {
  return cellOf(p.y, map.height) * map.width + cellOf(p.x, map.width);
}

/**
 * Whether `a` perceives `b` (see the room objects spec's predicates): sight,
 * which the fog, a foe's aggro and sight, `nearestMonster`, auto-aim and the
 * bot's targeting ask. Solid cells block it as they block `sees`, and foliage
 * twice: what stands in foliage (either end) is perceived only within
 * `terrain.foliageSight` (that alone decides it), and between two ends outside
 * foliage a line running through more than `terrain.foliageDepth` of it is
 * blocked.
 * A map with no terrain bound (`bindTerrain`) has no foliage rules.
 */
export function perceives(map: FloorMap, a: Vec, b: Vec): boolean {
  if (!sees(map, a, b)) return false;
  const t = terrains.get(map);
  if (map.open || !t) return true;
  const leafy =
    map.cells[cellIndex(map, a)] === CELL.foliage || map.cells[cellIndex(map, b)] === CELL.foliage;
  if (leafy) return Math.hypot(b.x - a.x, b.y - a.y) <= t.foliageSight;
  return foliageAlong(map, a, b) <= t.foliageDepth;
}

/** How far the segment from `a` to `b` runs through foliage: the DDA walk `lineOfSight` takes. */
function foliageAlong(map: FloorMap, a: Vec, b: Vec): number {
  let cx = cellOf(a.x, map.width);
  let cy = cellOf(a.y, map.height);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const tx = () => (sx ? (cx + (sx > 0 ? 1 : 0) - a.x) / dx : Infinity);
  const ty = () => (sy ? (cy + (sy > 0 ? 1 : 0) - a.y) / dy : Infinity);
  let sum = 0;
  // Where along the segment (0 at a, 1 at b) the cell being walked begins.
  for (let from = 0; ; ) {
    const x = tx();
    const y = ty();
    const to = Math.min(x, y, 1);
    const i = cy * map.width + cx;
    if (map.cells[i] === CELL.foliage) sum += (to - from) * len;
    if (to >= 1) return sum;
    from = to;
    if (x <= y) cx += sx;
    if (y <= x) cy += sy;
  }
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
