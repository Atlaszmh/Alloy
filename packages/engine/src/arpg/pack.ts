import type { ArpgWorld, MonsterEntity, Vec } from '../types/arpg.js';
import { CELL, type FloorMap, type PackAiBalance, type Rect } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';
import { clamp, dirTo, dist } from './geometry.js';
import { isWalkable, perceives, sees, snapToWalkable, solid } from './grid.js';
import { clearanceOf, downhill, flowField } from './flow.js';
import { objectsOnBeam } from './objects.js';

/**
 * The pack director (see the room objects spec's "Smarter packs"): every
 * `ai.pack.directorEvery` (`ArpgWorld.director.nextAt`) it gives each awake
 * foe a job (`MonsterEntity.job`) and a goal (`goal`), in list order; the sim
 * walks each foe toward its goal (`goalWay`). Off on the open room and the
 * hand-built floors; a boss keeps its own patterns (its adds are directed); a
 * foliage search's goal (B2's `search`) wins over a job's.
 */

/** A goal this near is reached. */
const REACHED = 0.25;
/** A ranged foe's cover lies at most this far from the hero (it fires from 8). */
const SHOOT_RANGE = 7;
/** A ranged foe hiding between volleys steps back out this long before its next. */
const PEEK = 0.6;
/** The eight neighbours, orthogonal first. */
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

/** What the director remembers of a world between its passes. */
interface DirectorState {
  /** Where the hero stood at the last pass. */
  hero: Vec | null;
  /** Per pack: the hero's distance from its centre at the last pass, and since when it has grown. */
  kite: Map<number, { d: number; since: number | null }>;
  /** Per ranged foe in cover: the cell it shoots from. */
  cover: Map<number, number>;
  /** Goal fields built since the last pass, by the map's version, the goal's cell and a clearance. */
  fields: Map<string, Uint16Array>;
}

const STATES = new WeakMap<ArpgWorld, DirectorState>();

function stateOf(world: ArpgWorld): DirectorState {
  let s = STATES.get(world);
  if (!s)
    STATES.set(world, (s = { hero: null, kite: new Map(), cover: new Map(), fields: new Map() }));
  return s;
}

/** Whether the director runs on this world: a generated floor (not the open room, not a hand-built floor). */
export function directorOn(world: ArpgWorld): boolean {
  return !world.map.open && world.tutorialFloor === null;
}

/** The share of a pack's melee foes that flank at `depth`: 0 before `fromDepth`, then rising to `max`. */
export function flankShare(share: PackAiBalance['flank']['flankShare'], depth: number): number {
  if (depth < share.fromDepth) return 0;
  return Math.min(share.max, share.base + share.perDepth * (depth - share.fromDepth));
}

/** A foe's room's rect, or the whole map for a foe with none. */
function roomRect(map: FloorMap, roomId: number | null): Rect {
  return (
    map.rooms.find((r) => r.id === roomId)?.rect ?? { x: 0, y: 0, w: map.width, h: map.height }
  );
}

/**
 * Where flankers cut the hero off: `leadTime` ahead of its motion, or (when
 * that leaves the room) as far on its side away from the pack's centre `c`;
 * kept a unit inside the room, on walkable ground.
 */
function intercept(world: ArpgWorld, rect: Rect, c: Vec, vel: Vec, lead: number): Vec {
  const h = world.hero;
  let at = { x: h.x + vel.x * lead, y: h.y + vel.y * lead };
  const inside = (p: Vec) =>
    p.x >= rect.x && p.y >= rect.y && p.x <= rect.x + rect.w && p.y <= rect.y + rect.h;
  if (!inside(at)) {
    const away = dirTo(c.x, c.y, h.x, h.y);
    const len = Math.hypot(vel.x, vel.y) * lead;
    at = { x: h.x + away.x * len, y: h.y + away.y * len };
  }
  return snapToWalkable(
    world.map,
    clamp(at.x, rect.x + 1, rect.x + rect.w - 1),
    clamp(at.y, rect.y + 1, rect.y + rect.h - 1),
  );
}

/**
 * Flankers: once the hero has kept moving away from the pack's centre for
 * `kiteTime`, the `flankShare` of its melee foes nearest the intercept point
 * go there. Returns them and the point.
 */
function flankers(
  ctx: SimCtx,
  st: DirectorState,
  packId: number,
  members: MonsterEntity[],
  vel: Vec,
): { foes: MonsterEntity[]; at: Vec | null } {
  const { world, bal } = ctx;
  const cfg = bal.ai.pack.flank;
  const h = world.hero;
  const c = {
    x: members.reduce((a, m) => a + m.x, 0) / members.length,
    y: members.reduce((a, m) => a + m.y, 0) / members.length,
  };
  const d = dist(c.x, c.y, h.x, h.y);
  const last = st.kite.get(packId);
  const away = h.moving && last !== undefined && d > last.d + 0.05;
  const since = away ? (last?.since ?? world.t) : null;
  st.kite.set(packId, { d, since });
  const melee = members.filter((m) => m.ai === 'melee');
  const n = Math.round(flankShare(cfg.flankShare, world.depth) * melee.length);
  if (!cfg.on || since === null || world.t - since < cfg.kiteTime - 1e-9 || n === 0)
    return { foes: [], at: null };
  const at = intercept(world, roomRect(world.map, members[0].roomId), c, vel, cfg.leadTime);
  const near = [...melee].sort((a, b) => dist(a.x, a.y, at.x, at.y) - dist(b.x, b.y, at.x, at.y));
  return { foes: near.slice(0, n), at };
}

/** The signed angle `a` brought into (−π, π]. */
function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Ring slots: `ring`'s foes spread evenly round the hero, each (in list order)
 * taking the free slot nearest its own angle, at its striking reach.
 */
function ringSlots(world: ArpgWorld, ring: MonsterEntity[]): void {
  const h = world.hero;
  const n = ring.length;
  if (n === 0) return;
  const angle = (m: MonsterEntity) => Math.atan2(m.y - h.y, m.x - h.x);
  const base = angle(ring[0]);
  const taken = new Array<boolean>(n).fill(false);
  for (const m of ring) {
    const a = angle(m);
    let best = -1;
    for (let k = 0; k < n; k++) {
      if (taken[k]) continue;
      const off = (k: number) => Math.abs(wrap(base + (2 * Math.PI * k) / n - a));
      if (best < 0 || off(k) < off(best) - 1e-9) best = k;
    }
    taken[best] = true;
    const slot = base + (2 * Math.PI * best) / n;
    const r = h.radius + m.radius + m.attackRange * 0.6;
    const at = { x: h.x + Math.cos(slot) * r, y: h.y + Math.sin(slot) * r };
    if (!m.search) m.goal = isWalkable(world.map, at.x, at.y) ? at : null;
  }
}

/** A foe's clearance in cells, as the flow fields count it (`flow.ts`'s large class). */
function clearanceCells(ctx: SimCtx, m: MonsterEntity): number {
  // ponytail: mirrors flow.ts's private LARGE (2); export it there if it ever changes.
  return clearanceOf(m) === 'large' ? Math.min(2, ctx.bal.layout.hallWidth) : 1;
}

/** The field toward `goal` for `m`'s clearance, within `ai.pack.flowRadius`: built once a pass. */
function goalField(ctx: SimCtx, m: MonsterEntity, goal: Vec): Uint16Array {
  const { world, bal } = ctx;
  const { map } = world;
  const clear = clearanceCells(ctx, m);
  const cell = Math.floor(goal.y) * map.width + Math.floor(goal.x);
  const key = `${map.version}:${cell}:${clear}`;
  const fields = stateOf(world).fields;
  let field = fields.get(key);
  if (!field) fields.set(key, (field = flowField(map, goal, bal.ai.pack.flowRadius, clear)));
  return field;
}

/** Whether cell `i` lies beside cover (a cover or crumbling cell, side by side). */
function besideCover(map: FloorMap, i: number): boolean {
  const x = i % map.width;
  const y = (i - x) / map.width;
  return AROUND.slice(0, 4).some(([dx, dy]) => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) return false;
    const c = map.cells[ny * map.width + nx];
    return c === CELL.cover || c === CELL.crumbling;
  });
}

/**
 * A ranged foe's spot in cover: the cell it shoots from, kept while it still
 * serves, else the nearest by steps (within `coverSearch`; ties in row order)
 * walkable cell beside cover that perceives the hero, within `SHOOT_RANGE` of
 * it and farther than `coverFlee`. Between volleys it waits on a cell beside
 * that one the hero can't see (if any). Null when there is none: it fights in
 * the open, as before.
 */
function coverSpot(ctx: SimCtx, st: DirectorState, m: MonsterEntity): Vec | null {
  const { world, bal } = ctx;
  const { map, hero: h } = world;
  const w = map.width;
  const { coverSearch, coverFlee } = bal.ai.pack.cover;
  const centre = (i: number): Vec => ({ x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5 });
  const serves = (i: number) => {
    const c = centre(i);
    const d = dist(c.x, c.y, h.x, h.y);
    return d > coverFlee && d <= SHOOT_RANGE && besideCover(map, i) && perceives(map, c, h);
  };
  let fire = st.cover.get(m.id);
  if (fire === undefined || !serves(fire)) {
    fire = undefined;
    const steps = flowField(map, m, coverSearch, clearanceCells(ctx, m));
    const cx = Math.floor(m.x);
    const cy = Math.floor(m.y);
    for (
      let y = Math.max(0, cy - coverSearch);
      y <= Math.min(map.height - 1, cy + coverSearch);
      y++
    )
      for (let x = Math.max(0, cx - coverSearch); x <= Math.min(w - 1, cx + coverSearch); x++) {
        const i = y * w + x;
        if (steps[i] > coverSearch || !serves(i)) continue;
        if (fire === undefined || steps[i] < steps[fire]) fire = i;
      }
    if (fire === undefined) {
      st.cover.delete(m.id);
      return null;
    }
    st.cover.set(m.id, fire);
  }
  if (world.t < m.nextAttackAt - PEEK) {
    const fx = fire % w;
    const fy = (fire - fx) / w;
    for (const [dx, dy] of AROUND) {
      const c = { x: fx + dx + 0.5, y: fy + dy + 0.5 };
      if (!solid(map, fx + dx, fy + dy) && !perceives(map, c, h)) return c;
    }
  }
  return centre(fire);
}

/**
 * Whether a body of radius `r` can go straight from `a` to `b` (a charger's
 * lane): its circle swept down the segment (its square, every quarter unit)
 * meets no solid cell.
 */
export function laneOpen(map: FloorMap, a: Vec, b: Vec, r: number): boolean {
  const n = Math.max(1, Math.ceil(dist(a.x, a.y, b.x, b.y) / 0.25));
  for (let i = 0; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n;
    const y = a.y + ((b.y - a.y) * i) / n;
    for (let cy = Math.floor(y - r + 1e-9); cy <= Math.floor(y + r - 1e-9); cy++)
      for (let cx = Math.floor(x - r + 1e-9); cx <= Math.floor(x + r - 1e-9); cx++)
        if (solid(map, cx, cy)) return false;
  }
  return true;
}

/**
 * Where `m` walks this tick toward its goal, or null to go after the hero as
 * before (`pursue`). A ring slot is walked to only `near` the hero (with sight,
 * in `ai.directRange`) and a flanker turns on the hero there; any other goal
 * (a search's, an intercept) is walked straight when in reach and sight with
 * no prop or hazard in the way, else down its field; a reached goal holds.
 */
export function goalWay(ctx: SimCtx, m: MonsterEntity, near: boolean): Vec | null {
  const goal = m.goal;
  if (!goal) return null;
  const { world, bal } = ctx;
  const d = dist(m.x, m.y, goal.x, goal.y);
  if (!m.search) {
    if (m.job === 'ring') return near && d > REACHED ? dirTo(m.x, m.y, goal.x, goal.y) : null;
    if (m.job === 'flank' && near) return null;
  }
  if (d <= REACHED) return { x: 0, y: 0 };
  if (
    d <= bal.ai.directRange &&
    sees(world.map, m, goal) &&
    objectsOnBeam(world, m, goal, m.radius).length === 0
  )
    return dirTo(m.x, m.y, goal.x, goal.y);
  return downhill(world.map, goalField(ctx, m, goal), m, goal);
}

/**
 * Each `ai.pack.directorEvery`: every awake foe a job and a goal (see the file's
 * note). A foe asleep, going home, scripted or a boss has none; a searching
 * foe keeps its search's goal.
 */
export function directorTick(ctx: SimCtx): void {
  const { world, bal } = ctx;
  if (!directorOn(world) || world.t < world.director.nextAt) return;
  const cfg = bal.ai.pack;
  world.director.nextAt = world.t + cfg.directorEvery;
  const st = stateOf(world);
  st.fields.clear();
  const h = world.hero;
  const vel = st.hero
    ? { x: (h.x - st.hero.x) / cfg.directorEvery, y: (h.y - st.hero.y) / cfg.directorEvery }
    : { x: 0, y: 0 };
  st.hero = { x: h.x, y: h.y };

  const packs = new Map<number, MonsterEntity[]>();
  for (const m of world.monsters) {
    if (m.dead || m.dummy) continue;
    if (!m.aggro || m.goingHome || m.script || m.kind === 'boss') {
      m.job = null;
      if (!m.search) m.goal = null;
      continue;
    }
    const members = packs.get(m.packId);
    if (members) members.push(m);
    else packs.set(m.packId, [m]);
  }
  const ring: MonsterEntity[] = [];
  for (const [packId, members] of packs) {
    const flank = flankers(ctx, st, packId, members, vel);
    for (const m of members) {
      m.job = null;
      if (!m.search) m.goal = null;
      if (m.ai === 'charger' && cfg.charge.on) m.job = 'charge';
      if (m.ai === 'ranged') {
        const spot = cfg.cover.on ? coverSpot(ctx, st, m) : null;
        if (spot) {
          m.job = 'cover';
          if (!m.search) m.goal = spot;
        } else st.cover.delete(m.id);
      }
      if (m.ai !== 'melee') continue;
      if (flank.foes.includes(m)) {
        m.job = 'flank';
        if (!m.search) m.goal = flank.at;
      } else if (cfg.ring.on) {
        m.job = 'ring';
        ring.push(m);
      }
    }
  }
  for (const id of st.kite.keys()) if (!packs.has(id)) st.kite.delete(id);
  for (const id of st.cover.keys())
    if (!world.monsters.some((m) => m.id === id && m.job === 'cover')) st.cover.delete(id);
  ringSlots(world, ring);
}
