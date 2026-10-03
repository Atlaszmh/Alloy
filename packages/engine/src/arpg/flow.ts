import type { MonsterEntity, Vec } from '../types/arpg.js';
import type { FloorMap, Room } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';
import { dirTo, dist } from './geometry.js';
import { blocked } from './grid.js';

/**
 * Foes' pathing and leashing on the grid (see the floor maps spec's
 * "Monsters"). Each tick is a no-op on the open room.
 */

/** A flow field's value where it doesn't reach. */
export const UNREACHED = 65535;

/** The large clearance class's width in cells (a foe wider than one cell), at most `hallWidth`. */
const LARGE = 2;

/** A foe's clearance class: `large` when it is wider than a cell. */
export function clearanceOf(m: MonsterEntity): 'small' | 'large' {
  return m.radius > 0.5 ? 'large' : 'small';
}

/** The cell a coordinate falls in, kept on the map. */
function cellAt(v: number, n: number): number {
  return Math.min(n - 1, Math.max(0, Math.floor(v)));
}

/**
 * Steps from each walkable cell to `target` (BFS over the four neighbours,
 * within `radius` steps) for a foe `clearance` cells wide: a cell counts only
 * if the odd square round it that fits such a foe is open (one cell for 1, three
 * for 2 or 3). UNREACHED where it doesn't reach. The target's own cell is 0
 * whatever stands there.
 */
export function flowField(
  map: FloorMap,
  target: Vec,
  radius: number,
  clearance: number,
): Uint16Array {
  const { width: w, height: h } = map;
  const field = new Uint16Array(w * h).fill(UNREACHED);
  const half = Math.floor(clearance / 2);
  const fits = (cx: number, cy: number) => {
    for (let y = cy - half; y <= cy + half; y++)
      for (let x = cx - half; x <= cx + half; x++) if (blocked(map, x, y)) return false;
    return true;
  };
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const start = cellAt(target.y, h) * w + cellAt(target.x, w);
  field[start] = 0;
  queue[tail++] = start;
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
 * field), or straight at `target` in its own cell; null where the field
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
    if (dx && dy && (at(cx + dx, cy) === UNREACHED || at(cx, cy + dy) === UNREACHED)) continue;
    best = v;
    to = { x: cx + dx + 0.5, y: cy + dy + 0.5 };
  }
  return to && dirTo(p.x, p.y, to.x, to.y);
}

/** Rebuild both flow fields toward the hero at each `ai.flowEvery` mark (`ArpgWorld.flow`). */
export function flowTick(ctx: SimCtx): void {
  const { world, bal } = ctx;
  const flow = world.flow;
  if (world.map.open || world.t < flow.nextAt) return;
  flow.nextAt = world.t + bal.ai.flowEvery;
  const { flowRadius } = bal.ai;
  flow.small = flowField(world.map, world.hero, flowRadius, 1);
  flow.large = flowField(world.map, world.hero, flowRadius, Math.min(LARGE, bal.layout.hallWidth));
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

/**
 * The leash (see the floor maps spec): an awake foe farther than `ai.leashRadius`
 * from its room's centre for more than `ai.leashSeconds` turns home
 * (`goingHome`, walked in `monstersTick`); home, it heals to full and sleeps
 * again (`aggro` and `aggroAt` reset, so a boss's enrage restarts). None in the
 * open room.
 */
export function leashTick(ctx: SimCtx): void {
  const { world, bal } = ctx;
  if (world.map.open) return;
  const { leashRadius, leashSeconds } = bal.ai;
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
    if (!m.aggro || dist(m.x, m.y, home.at.x, home.at.y) <= leashRadius) m.farSince = null;
    else if (m.farSince === null) m.farSince = world.t;
    else if (world.t - m.farSince > leashSeconds) {
      m.goingHome = true;
      m.windupUntil = 0;
      m.chargeUntil = 0;
    }
  }
}
