import type { MonsterEntity, Vec } from '../types/arpg.js';
import type { FloorMap, Rect, Room } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';
import { dirTo, dist } from './geometry.js';
import { solid } from './grid.js';
import { footprints } from './objects-base.js';

/**
 * Foes' pathing and leashing on the grid (see the floor maps spec's
 * "Monsters"). Each tick is a no-op on the open room.
 */

/** A flow field's value where it doesn't reach. */
export const UNREACHED = 65535;

/** The large clearance class's width in cells (a foe wider than one cell), at most `hallWidth`. */
const LARGE = 2;
/** The huge clearance class's width in cells: a foe wider than three cells (a boss), a 5 × 5. */
const HUGE = 5;

/** A foe's clearance class: `large` when it is wider than a cell, `huge` wider than three. */
export type Clearance = 'small' | 'large' | 'huge';

/** A foe's clearance class (see `Clearance`). */
export function clearanceOf(m: { radius: number }): Clearance {
  return m.radius > 1.5 ? 'huge' : m.radius > 0.5 ? 'large' : 'small';
}

/** A clearance class's width in cells, as `flowField` takes it (the large class at most `hallWidth`). */
export function clearanceCells(c: Clearance, hallWidth: number): number {
  return c === 'huge' ? HUGE : c === 'large' ? Math.min(LARGE, hallWidth) : 1;
}

/**
 * Whether the odd square of side `2 × half + 1` round cell (cx, cy) is all `open`: the
 * one clearance test the flow fields and the furnisher share.
 */
export function squareFits(
  open: (x: number, y: number) => boolean,
  cx: number,
  cy: number,
  half: number,
): boolean {
  for (let y = cy - half; y <= cy + half; y++)
    for (let x = cx - half; x <= cx + half; x++) if (!open(x, y)) return false;
  return true;
}

/** The cell a coordinate falls in, kept on the map. */
function cellAt(v: number, n: number): number {
  return Math.min(n - 1, Math.max(0, Math.floor(v)));
}

/**
 * Steps from each walkable cell to `target` (BFS over the four neighbours,
 * within `radius` steps) for a foe `clearance` cells wide: a cell counts only
 * if the odd square round it that fits such a foe is open (one cell for 1, three
 * for 2 or 3, five for 5): no solid cell, nor one of `blocked` (cell indices: the
 * props' and hazards' footprints). UNREACHED where it doesn't reach. The target's
 * own cell is 0 whatever stands there, and a cell whose open square holds it is 1
 * (a wide foe there already stands over the target, so one in a gap too narrow
 * for it is still reached from round it).
 */
export function flowField(
  map: FloorMap,
  target: Vec,
  radius: number,
  clearance: number,
  blocked?: ReadonlySet<number>,
): Uint16Array {
  const { width: w, height: h } = map;
  const field = new Uint16Array(w * h).fill(UNREACHED);
  const half = Math.floor(clearance / 2);
  const open = (x: number, y: number) => !solid(map, x, y) && !blocked?.has(y * w + x);
  const fits = (cx: number, cy: number) => squareFits(open, cx, cy, half);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const start = cellAt(target.y, h) * w + cellAt(target.x, w);
  field[start] = 0;
  queue[tail++] = start;
  const sx = start % w;
  const sy = (start - sx) / w;
  for (let y = Math.max(0, sy - half); y <= Math.min(h - 1, sy + half); y++)
    for (let x = Math.max(0, sx - half); x <= Math.min(w - 1, sx + half); x++) {
      const n = y * w + x;
      if (n === start || !fits(x, y) || radius < 1) continue;
      field[n] = 1;
      queue[tail++] = n;
    }
  while (head < tail) {
    const c = queue[head++];
    const d = field[c];
    if (d >= radius) continue;
    const cx = c % w;
    const cy = (c - cx) / w;
    for (const [nx, ny] of [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (field[n] !== UNREACHED || !fits(nx, ny)) continue;
      field[n] = d + 1;
      queue[tail++] = n;
    }
  }
  return field;
}

/** The eight neighbours, orthogonal first: on a tie the straight step wins. */
const AROUND = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/**
 * The way down `field` from `p`: toward the centre of the neighbouring cell
 * nearest its target (a diagonal only where both cells beside it are in the
 * field, unless `p`'s own cell isn't), or straight at `target` in its own cell; null where the field
 * doesn't reach (nor any neighbour) or nothing is nearer.
 */
export function downhill(map: FloorMap, field: Uint16Array, p: Vec, target: Vec): Vec | null {
  const w = map.width;
  const cx = cellAt(p.x, w);
  const cy = cellAt(p.y, map.height);
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= map.height ? UNREACHED : field[y * w + x];
  const here = at(cx, cy);
  if (here === 0) return dirTo(p.x, p.y, target.x, target.y);
  let best = here;
  let to: Vec | null = null;
  for (const [dx, dy] of AROUND) {
    const v = at(cx + dx, cy + dy);
    if (v >= best) continue;
    // A diagonal only past two reached cells, unless the foe stands off the field (in a
    // pocket too narrow for it): then any way back onto it.
    if (
      here !== UNREACHED &&
      dx &&
      dy &&
      (at(cx + dx, cy) === UNREACHED || at(cx, cy + dy) === UNREACHED)
    )
      continue;
    best = v;
    to = { x: cx + dx + 0.5, y: cy + dy + 0.5 };
  }
  return to && dirTo(p.x, p.y, to.x, to.y);
}

/**
 * Rebuild the flow fields toward the hero at each `ai.flowEvery` mark
 * (`ArpgWorld.flow`), round the standing props' and hazards' footprints.
 */
export function flowTick(ctx: SimCtx): void {
  const { world, bal } = ctx;
  const flow = world.flow;
  if (world.map.open || world.t < flow.nextAt) return;
  flow.nextAt = world.t + bal.ai.flowEvery;
  const { flowRadius } = bal.ai;
  const feet = footprints(world);
  const { hallWidth } = bal.layout;
  flow.small = flowField(world.map, world.hero, flowRadius, 1, feet);
  flow.large = flowField(
    world.map,
    world.hero,
    flowRadius,
    clearanceCells('large', hallWidth),
    feet,
  );
  // Only a floor with a huge foe standing (a boss) pays for its field.
  flow.huge = world.monsters.some((m) => !m.dead && clearanceOf(m) === 'huge')
    ? flowField(world.map, world.hero, flowRadius, HUGE, feet)
    : null;
}

/** A foe's room and its centre, where it leashes to; null for one with no room. */
function homeOf(map: FloorMap, m: MonsterEntity): { room: Room; at: Vec } | null {
  const room = m.roomId === null ? undefined : map.rooms.find((r) => r.id === m.roomId);
  if (!room) return null;
  const { x, y, w, h } = room.rect;
  return { room, at: { x: x + w / 2, y: y + h / 2 } };
}

/** A leashed foe's way home: down its room's `homeField` (straight without one); null when lost. */
export function homeWay(map: FloorMap, m: MonsterEntity): Vec | null {
  const home = homeOf(map, m);
  if (!home) return null;
  const field = home.room.homeField;
  return field ? downhill(map, field, m, home.at) : dirTo(m.x, m.y, home.at.x, home.at.y);
}

/** Home: a step from the bottom of its room's `homeField` (a unit from the centre without one). */
function atHome(map: FloorMap, m: MonsterEntity, home: { room: Room; at: Vec }): boolean {
  const field = home.room.homeField;
  if (!field) return dist(m.x, m.y, home.at.x, home.at.y) <= 1;
  return field[cellAt(m.y, map.height) * map.width + cellAt(m.x, map.width)] <= 1;
}

/** How far a point lies outside a rect (0 on or inside it). */
function outside(r: Rect, p: Vec): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/**
 * The leash (see the floor maps spec, and the room objects spec's "The
 * leash"): an awake foe more than `terrain.leashMargin` outside its room's
 * rect for more than `ai.leashSeconds` turns home (`goingHome`, walked in
 * `monstersTick`), so a pack anywhere in its room never leashes; home, it
 * heals to full and sleeps again (`aggro` and `aggroAt` reset, so a boss's
 * enrage restarts). A foliage search given up (`terrainTick`) comes home the
 * same way. None in the open room.
 */
export function leashTick(ctx: SimCtx): void {
  const { world, bal } = ctx;
  if (world.map.open) return;
  const { leashSeconds } = bal.ai;
  const { leashMargin } = bal.terrain;
  for (const m of world.monsters) {
    if (m.dead || m.dummy) continue;
    const home = homeOf(world.map, m);
    if (!home) continue;
    if (m.goingHome) {
      if (!atHome(world.map, m, home)) continue;
      Object.assign(m, { goingHome: false, farSince: null, aggro: false, aggroAt: 0 });
      m.hp = m.maxHp;
      continue;
    }
    const far = outside(home.room.rect, m) > leashMargin;
    if (!m.aggro || !far) m.farSince = null;
    else if (m.farSince === null) m.farSince = world.t;
    else if (world.t - m.farSince > leashSeconds) {
      m.goingHome = true;
      m.windupUntil = 0;
      m.chargeUntil = 0;
    }
  }
}
