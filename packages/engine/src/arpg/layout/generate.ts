import type { DataRegistry } from '../../data/registry.js';
import { weightedPick } from '../../loot/item-generator.js';
import { SeededRNG } from '../../rng/seeded-rng.js';
import type { Vec } from '../../types/arpg.js';
import type { BiomeDef, DoorDef } from '../../types/delve.js';
import {
  DRAWN_ROOM_KINDS,
  type Door,
  type FloorMap,
  type Interactable,
  type InteractableKind,
  type Rect,
  type Room,
  type RoomKind,
} from '../../types/floor-map.js';
import { clamp } from '../geometry.js';
import { snapToWalkable, solid } from '../grid.js';
import { isBossFloor } from '../world.js';

/** How far a room may sit off its coarse cell's centre, in cells (so facing walls share a hall's width). */
// ponytail: a constant; into `delve.layout` if rooms ever need to wander further.
const JITTER = 2;
const UNREACHED = 65535;
const DIRS = [
  { c: 1, r: 0 },
  { c: -1, r: 0 },
  { c: 0, r: 1 },
  { c: 0, r: -1 },
];
const INTERACTABLE: Partial<Record<RoomKind, InteractableKind>> = {
  vault: 'chest',
  sanctum: 'shrine',
  alcove: 'alcove',
  exit: 'gate',
  boss: 'gate',
};

/** A generated floor: its map, and how many packs each room holds (by room id). */
export interface FloorPlan {
  map: FloorMap;
  packs: number[];
}

/** A floor's packs: today's count (`dive.packs*`, × the door's `packs`), 2 on a boss floor. */
export function floorPacks(registry: DataRegistry, depth: number, door: DoorDef | null): number {
  const dive = registry.getDelveBalance().dive;
  const base = isBossFloor(registry, depth)
    ? 2
    : Math.min(dive.packsMax, dive.packsBase + depth * dive.packsPerDepth);
  return Math.max(1, Math.round(base * (door?.mods.packs ?? 1)));
}

/**
 * A floor's rooms and halls (see the floor maps spec's "Generator"): pure and
 * deterministic on the floor seed's `layout` fork.
 */
export function generateFloor(
  registry: DataRegistry,
  seed: number,
  depth: number,
  biome: BiomeDef,
  door: DoorDef | null,
): FloorMap {
  return planFloor(registry, seed, depth, biome, door).map;
}

/**
 * `generateFloor` with where the packs go. Rooms are placed by a random walk on
 * the coarse grid (its first steps into each cell the spanning tree), plus
 * `layout.loops` links between neighbours; the start is the walk's first room
 * and the exit (a boss floor's boss room) the farthest from it. The drawn kinds
 * are drawn first, so the overflow rule can add combat rooms before the walk.
 */
export function planFloor(
  registry: DataRegistry,
  seed: number,
  depth: number,
  biome: BiomeDef,
  door: DoorDef | null,
): FloorPlan {
  const L = registry.getDelveBalance().layout;
  const { layouts, shrines } = registry.getDelveData();
  const rng = new SeededRNG(seed).fork('layout');
  const boss = isBossFloor(registry, depth);
  const C = L.coarseCell;

  // The kinds: the drawn rooms' (at least `minCombatRooms` combat), then combat rooms
  // the packs need past `packsPerRoom` each, up to `rooms.max`.
  let n = Math.min(L.rooms.max, Math.floor(L.rooms.base + depth * L.rooms.perDepth));
  const band = [...L.kindWeights].reverse().find((b) => depth >= b.fromDepth)!;
  const drawn: RoomKind[] = [];
  for (let i = 0; i < n - 2; i++) {
    const alcoves = drawn.filter((k) => k === 'alcove').length;
    drawn.push(
      i < L.minCombatRooms
        ? 'combat'
        : weightedPick(
            DRAWN_ROOM_KINDS,
            (k) =>
              (k === 'alcove' && alcoves >= L.alcoveMax) || (k === 'den' && boss)
                ? 0
                : band.weights[k],
            rng,
          ),
    );
  }
  const packs = floorPacks(registry, depth, door);
  const holders = drawn.filter((k) => k === 'combat' || k === 'den').length;
  const extra = clamp(Math.ceil(packs / L.packsPerRoom) - holders, 0, L.rooms.max - n);
  for (let i = 0; i < extra; i++) drawn.push('combat');
  n += extra;

  // The walk: each new coarse cell a room, linked to the one it came from.
  const key = (p: { c: number; r: number }) => p.r * L.coarseCols + p.c;
  let at = { c: rng.nextInt(0, L.coarseCols - 1), r: rng.nextInt(0, L.coarseRows - 1) };
  const coarse = [at];
  const index = new Map([[key(at), 0]]);
  const links: [number, number][] = [];
  let from = 0;
  while (coarse.length < n) {
    const moves = DIRS.map((d) => ({ c: at.c + d.c, r: at.r + d.r })).filter(
      (p) => p.c >= 0 && p.r >= 0 && p.c < L.coarseCols && p.r < L.coarseRows,
    );
    at = moves[rng.nextInt(0, moves.length - 1)];
    let id = index.get(key(at));
    if (id === undefined) {
      id = coarse.length;
      coarse.push(at);
      index.set(key(at), id);
      links.push([from, id]);
    }
    from = id;
  }
  const linked = (a: number, b: number) =>
    links.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const loops: [number, number][] = [];
  coarse.forEach((p, a) =>
    coarse.forEach((q, b) => {
      if (a < b && Math.abs(p.c - q.c) + Math.abs(p.r - q.r) === 1 && !linked(a, b))
        loops.push([a, b]);
    }),
  );
  for (let k = rng.nextInt(L.loops[0], L.loops[1]); k > 0 && loops.length > 0; k--)
    links.push(loops.splice(rng.nextInt(0, loops.length - 1), 1)[0]);
  const near = coarse.map((_, a) =>
    links.flatMap(([x, y]) => (x === a ? [y] : y === a ? [x] : [])),
  );

  // Start, exit (the farthest by links, ties by seed), then the drawn kinds, the vaults
  // and sanctums first, leaning toward dead ends.
  const steps = graphSteps(near, 0);
  const far = Math.max(...steps);
  const ends = steps.flatMap((s, i) => (s === far ? [i] : []));
  const exit = ends[rng.nextInt(0, ends.length - 1)];
  const kinds: RoomKind[] = coarse.map(() => 'combat');
  kinds[0] = 'start';
  kinds[exit] = boss ? 'boss' : 'exit';
  const free = coarse.map((_, i) => i).filter((i) => i !== 0 && i !== exit);
  const deadEnd = (k: RoomKind) => k === 'vault' || k === 'sanctum';
  for (const k of [...drawn.filter(deadEnd), ...drawn.filter((k) => !deadEnd(k))]) {
    const id = weightedPick(
      free,
      (i) => (deadEnd(k) && near[i].length === 1 ? L.deadEndWeight : 1),
      rng,
    );
    free.splice(free.indexOf(id), 1);
    kinds[id] = k;
  }

  // The rooms' rects, the map cropped to the coarse cells in use.
  const c0 = Math.min(...coarse.map((p) => p.c));
  const r0 = Math.min(...coarse.map((p) => p.r));
  const width = (Math.max(...coarse.map((p) => p.c)) - c0 + 1) * C;
  const height = (Math.max(...coarse.map((p) => p.r)) - r0 + 1) * C;
  const lo = Math.ceil(L.minWall / 2);
  const hi = Math.floor(L.minWall / 2);
  const place = (origin: number, size: number) =>
    clamp(
      origin + Math.floor((C - size) / 2) + rng.nextInt(-JITTER, JITTER),
      origin + lo,
      origin + C - hi - size,
    );
  const templates = layouts.rooms[biome.id] ?? layouts.rooms.default;
  const cells = new Uint8Array(width * height).fill(1);
  const rooms: Room[] = coarse.map((p, id) => {
    const t = kinds[id] === 'boss' ? layouts.boss : templates[rng.nextInt(0, templates.length - 1)];
    const rect = { x: place((p.c - c0) * C, t.w), y: place((p.r - r0) * C, t.h), w: t.w, h: t.h };
    const masked = t.masks.length > 0 && rng.next() < L.pillarChance;
    const rows = masked ? t.masks[rng.nextInt(0, t.masks.length - 1)] : null;
    const mask = rows
      ? Uint8Array.from(rows.join(''), (ch) => (ch === '#' ? 1 : ch === '%' ? 2 : 0))
      : undefined;
    for (let j = 0; j < t.h; j++)
      for (let i = 0; i < t.w; i++)
        cells[(rect.y + j) * width + rect.x + i] = mask?.[j * t.w + i] ? 1 : 0;
    return { id, kind: kinds[id], rect, mask, revealed: false, cleared: false, sealed: false };
  });

  // The halls, each with a door where it meets each room's wall.
  const doors: Door[] = [];
  for (const [a, b] of links) {
    const [p, q] = coarse[a].c + coarse[a].r < coarse[b].c + coarse[b].r ? [a, b] : [b, a];
    const h = hall(
      rooms[p].rect,
      rooms[q].rect,
      coarse[p].r === coarse[q].r,
      L.hallWidth,
      L.minWall,
    );
    for (const v of h.floor) cells[v.y * width + v.x] = 0;
    for (const [cs, room, other] of [
      [h.doorA, p, q],
      [h.doorB, q, p],
    ] as const) {
      for (const v of cs) cells[v.y * width + v.x] = 2;
      doors.push({ id: doors.length, cells: cs, rooms: [room, other], closed: false });
    }
  }

  const map: FloorMap = {
    width,
    height,
    cells,
    look: new Uint8Array(width * height),
    structures: [],
    version: 0,
    rooms,
    doors,
    start: { x: 0, y: 0 },
    exit: { x: 0, y: 0 },
    open: false,
  };
  const centre = (r: Rect) => snapToWalkable(map, r.x + r.w / 2, r.y + r.h / 2);
  map.start = centre(rooms[0].rect);
  for (const room of rooms) {
    const kind = INTERACTABLE[room.kind];
    if (kind) {
      const it: Interactable = {
        id: `${depth}:${room.id}`,
        kind,
        ...centre(room.rect),
        used: false,
      };
      if (kind === 'shrine') it.shrine = weightedPick(shrines, (s) => s.weight, rng).id;
      if (kind === 'gate') map.exit = { x: it.x, y: it.y };
      room.interactable = it;
    }
    room.homeField = cellSteps(map, centre(room.rect));
  }

  // The packs: dealt one a room in turn over the dens, then the combat rooms on a shortest
  // way to the exit, then the rest; a vault may keep one as its guard.
  const back = graphSteps(near, exit);
  const onWay = (id: number) => steps[id] + back[id] === steps[exit];
  const order = rooms
    .filter((r) => r.kind === 'den' || r.kind === 'combat')
    .sort(
      (r, s) =>
        Number(r.kind !== 'den') - Number(s.kind !== 'den') ||
        Number(!onWay(r.id)) - Number(!onWay(s.id)) ||
        r.id - s.id,
    );
  const counts = rooms.map((r) => (r.kind === 'vault' && rng.next() < L.vaultGuardChance ? 1 : 0));
  for (let k = 0; k < packs && order.length > 0; k++) counts[order[k % order.length].id]++;
  return { map, packs: counts };
}

/** Links from `from` to each room (breadth first). */
function graphSteps(near: number[][], from: number): number[] {
  const steps = near.map(() => Infinity);
  steps[from] = 0;
  for (const queue = [from]; queue.length > 0; ) {
    const a = queue.shift()!;
    for (const b of near[a])
      if (steps[b] === Infinity) {
        steps[b] = steps[a] + 1;
        queue.push(b);
      }
  }
  return steps;
}

/** Steps from `p`'s cell to every cell, over cells that aren't solid (`UNREACHED` past them). */
function cellSteps(map: FloorMap, p: Vec): Uint16Array {
  const { width, height } = map;
  const field = new Uint16Array(width * height).fill(UNREACHED);
  const first = Math.floor(p.y) * width + Math.floor(p.x);
  field[first] = 0;
  for (const queue = [first]; queue.length > 0; ) {
    const k = queue.shift()!;
    const x = k % width;
    const y = (k - x) / width;
    for (const d of DIRS) {
      const i = x + d.c;
      const j = y + d.r;
      const n = j * width + i;
      if (solid(map, i, j) || field[n] !== UNREACHED) continue;
      field[n] = field[k] + 1;
      queue.push(n);
    }
  }
  return field;
}

/**
 * A hall `hallWidth` cells wide from room `a` to room `b` (`b` right of `a`, or below it
 * when not `across`): an elbow between their facing walls' midpoints when the gap holds a
 * bend with `minWall` either side, else straight across the rows (columns) both walls share.
 */
function hall(
  a: Rect,
  b: Rect,
  across: boolean,
  width: number,
  minWall: number,
): { floor: Vec[]; doorA: Vec[]; doorB: Vec[] } {
  // u runs from a to b, v across it.
  const uv = (r: Rect) =>
    across ? { u: r.x, ul: r.w, v: r.y, vl: r.h } : { u: r.y, ul: r.h, v: r.x, vl: r.w };
  const A = uv(a);
  const B = uv(b);
  const half = Math.floor(width / 2);
  const u0 = A.u + A.ul;
  const u1 = B.u - 1;
  let va = A.v + Math.floor(A.vl / 2);
  let vb = B.v + Math.floor(B.vl / 2);
  const bend = va !== vb && u1 - u0 + 1 >= width + 2 * minWall;
  if (!bend && va !== vb) {
    const o0 = Math.max(A.v, B.v);
    va = vb = o0 + Math.floor((Math.min(A.v + A.vl, B.v + B.vl) - o0) / 2);
  }
  const um = u0 + Math.floor((u1 - u0 + 1 - width) / 2);
  const floor: Vec[] = [];
  const fill = (ua: number, ub: number, v: number, vEnd = v) => {
    for (let u = ua; u <= ub; u++)
      for (let w = Math.min(v, vEnd) - half; w < Math.max(v, vEnd) - half + width; w++)
        floor.push(across ? { x: u, y: w } : { x: w, y: u });
  };
  if (bend) {
    fill(u0, um + width - 1, va);
    fill(um, um + width - 1, va, vb);
    fill(um, u1, vb);
  } else fill(u0, u1, va);
  const at = (u: number) => floor.filter((p) => (across ? p.x : p.y) === u);
  return { floor, doorA: at(u0), doorB: at(u1) };
}
