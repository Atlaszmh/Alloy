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
import { footprintsOf, furnishFloor, type Furnishing } from './furnish.js';

/** How far a room may sit off its coarse cell's centre, in cells (so facing walls share a hall's width). */
// ponytail: a constant; into `delve.layout` if rooms ever need to wander further.
const JITTER = 2;
const UNREACHED = 65535;
/** A coarse cell: its column and row on the coarse grid. */
type Coarse = { c: number; r: number };
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

/**
 * A generated floor: its map, how many packs each room holds (by room id; the arena
 * `arenaPacks` more), and the props and hazards its furnishing stands.
 */
export interface FloorPlan {
  map: FloorMap;
  packs: number[];
  furnishing: Furnishing;
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
 * the coarse grid (its first steps into each cell the spanning tree), the arena
 * on the two cells of one of its links (see the room objects spec), plus
 * `layout.loops` links between neighbours; the start is the walk's first room
 * and the exit (a boss floor's boss room) the farthest from it but the arena.
 * The drawn kinds are drawn first, so the overflow rule can add combat rooms
 * before the walk.
 */
export function planFloor(
  registry: DataRegistry,
  seed: number,
  depth: number,
  biome: BiomeDef,
  door: DoorDef | null,
): FloorPlan {
  const L = registry.getDelveBalance().layout;
  const { layouts } = registry.getDelveData();
  const shrines = registry.shrineBoons();
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

  // The walk: each new coarse cell linked to the one it came from, until the rooms and the
  // arena's second cell are placed.
  const key = (p: Coarse) => p.r * L.coarseCols + p.c;
  let at = { c: rng.nextInt(0, L.coarseCols - 1), r: rng.nextInt(0, L.coarseRows - 1) };
  const coarse = [at];
  const index = new Map([[key(at), 0]]);
  const tree: [number, number][] = [];
  let from = 0;
  while (coarse.length < n + 1) {
    const moves = DIRS.map((d) => ({ c: at.c + d.c, r: at.r + d.r })).filter(
      (p) => p.c >= 0 && p.r >= 0 && p.c < L.coarseCols && p.r < L.coarseRows,
    );
    at = moves[rng.nextInt(0, moves.length - 1)];
    let id = index.get(key(at));
    if (id === undefined) {
      id = coarse.length;
      coarse.push(at);
      index.set(key(at), id);
      tree.push([from, id]);
    }
    from = id;
  }

  // The arena: the two cells of a tree link, neither the start's, one room (its id the first's).
  const twos = tree.filter(([a, b]) => a !== 0 && b !== 0);
  const [arenaA, arenaB] = twos[rng.nextInt(0, twos.length - 1)];
  const cellsOf: Coarse[][] = [];
  const roomOf: number[] = [];
  coarse.forEach((p, i) => {
    if (i === arenaB) return;
    roomOf[i] = cellsOf.length;
    cellsOf.push([p]);
  });
  const arenaId = roomOf[arenaA];
  roomOf[arenaB] = arenaId;
  cellsOf[arenaId].push(coarse[arenaB]);

  // The links between rooms: the tree's but the arena's own, then `layout.loops` more
  // between neighbouring rooms.
  const links = tree
    .filter(([a, b]) => a !== arenaA || b !== arenaB)
    .map(([a, b]): [number, number] => [roomOf[a], roomOf[b]]);
  const linked = (a: number, b: number) =>
    links.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const loops: [number, number][] = [];
  cellsOf.forEach((p, a) =>
    cellsOf.forEach((q, b) => {
      if (a < b && touching(p, q) && !linked(a, b)) loops.push([a, b]);
    }),
  );
  for (let k = rng.nextInt(L.loops[0], L.loops[1]); k > 0 && loops.length > 0; k--)
    links.push(loops.splice(rng.nextInt(0, loops.length - 1), 1)[0]);
  const near = cellsOf.map((_, a) =>
    links.flatMap(([x, y]) => (x === a ? [y] : y === a ? [x] : [])),
  );

  // Start, exit (the farthest by links but the arena, ties by seed), the arena a combat
  // room, then the drawn kinds (one combat fewer: the arena is it), the vaults and
  // sanctums first, leaning toward dead ends.
  const steps = graphSteps(near, 0);
  const far = Math.max(...steps.filter((_, i) => i !== arenaId));
  const ends = steps.flatMap((s, i) => (s === far && i !== arenaId ? [i] : []));
  const exit = ends[rng.nextInt(0, ends.length - 1)];
  const kinds: RoomKind[] = cellsOf.map(() => 'combat');
  kinds[0] = 'start';
  kinds[exit] = boss ? 'boss' : 'exit';
  drawn.splice(drawn.indexOf('combat'), 1);
  const free = cellsOf.map((_, i) => i).filter((i) => i !== 0 && i !== exit && i !== arenaId);
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

  // The rooms' rects (the arena's over its two cells, drawn wide and turned when they
  // stand in a column), the map cropped to the coarse cells in use.
  const c0 = Math.min(...coarse.map((p) => p.c));
  const r0 = Math.min(...coarse.map((p) => p.r));
  const width = (Math.max(...coarse.map((p) => p.c)) - c0 + 1) * C;
  const height = (Math.max(...coarse.map((p) => p.r)) - r0 + 1) * C;
  const lo = Math.ceil(L.minWall / 2);
  const hi = Math.floor(L.minWall / 2);
  const place = (origin: number, size: number, span: number) =>
    clamp(
      origin + Math.floor((span - size) / 2) + rng.nextInt(-JITTER, JITTER),
      origin + lo,
      origin + span - hi - size,
    );
  const templates = layouts.rooms[biome.id] ?? layouts.rooms.default;
  const cells = new Uint8Array(width * height).fill(1);
  const rooms: Room[] = cellsOf.map((cs, id) => {
    const t =
      id === arenaId
        ? layouts.arena[rng.nextInt(0, layouts.arena.length - 1)]
        : kinds[id] === 'boss'
          ? layouts.boss
          : templates[rng.nextInt(0, templates.length - 1)];
    const cols = new Set(cs.map((p) => p.c)).size;
    const rows = new Set(cs.map((p) => p.r)).size;
    const [w, h] = rows > cols ? [t.h, t.w] : [t.w, t.h];
    const x = place((Math.min(...cs.map((p) => p.c)) - c0) * C, w, cols * C);
    const y = place((Math.min(...cs.map((p) => p.r)) - r0) * C, h, rows * C);
    for (let j = y; j < y + h; j++) cells.fill(0, j * width + x, j * width + x + w);
    return {
      id,
      kind: kinds[id],
      rect: { x, y, w, h },
      ...(id === arenaId ? { arena: true as const } : {}),
      revealed: false,
      cleared: false,
      sealed: false,
    };
  });

  // The halls, each with a door where it meets each room's wall, between the two coarse
  // cells that touch (the arena's rect cut, across the hall, to its cell's rows or columns).
  const doors: Door[] = [];
  for (const [a, b] of links) {
    const [p, q] = cellsOf[a].flatMap((p) =>
      cellsOf[b].flatMap((q) => (adjacent(p, q) ? [[p, q]] : [])),
    )[0];
    const [ra, rb, pa, pb] = p.c + p.r < q.c + q.r ? [a, b, p, q] : [b, a, q, p];
    const across = pa.r === pb.r;
    const within = (r: Rect, cell: Coarse): Rect => {
      if (across) {
        const y = Math.max(r.y, (cell.r - r0) * C);
        return { ...r, y, h: Math.min(r.y + r.h, (cell.r - r0 + 1) * C) - y };
      }
      const x = Math.max(r.x, (cell.c - c0) * C);
      return { ...r, x, w: Math.min(r.x + r.w, (cell.c - c0 + 1) * C) - x };
    };
    const h = hall(
      within(rooms[ra].rect, pa),
      within(rooms[rb].rect, pb),
      across,
      L.hallWidth,
      L.minWall,
    );
    for (const v of h.floor) cells[v.y * width + v.x] = 0;
    for (const [cs, room, other] of [
      [h.doorA, ra, rb],
      [h.doorB, rb, ra],
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
      if (kind === 'shrine') it.shrine = weightedPick(shrines, (s) => s.shrine!, rng).id;
      if (kind === 'gate') map.exit = { x: it.x, y: it.y };
      room.interactable = it;
    }
  }

  // The furnishing (see the room objects spec), then each room's way home round it.
  const furnishing = furnishFloor(registry, map, seed, depth, biome);
  const feet = footprintsOf(registry, map, furnishing);
  for (const room of rooms) room.homeField = cellSteps(map, centre(room.rect), feet);

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
  counts[arenaId] += L.arenaPacks;
  return { map, packs: counts, furnishing };
}

/** Whether two coarse cells share a side. */
function adjacent(p: Coarse, q: Coarse): boolean {
  return Math.abs(p.c - q.c) + Math.abs(p.r - q.r) === 1;
}

/** Whether two rooms' coarse cells share a side. */
function touching(a: Coarse[], b: Coarse[]): boolean {
  return a.some((p) => b.some((q) => adjacent(p, q)));
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

/** Steps from `p`'s cell to every cell, over cells neither solid nor in `feet` (`UNREACHED` past them). */
function cellSteps(map: FloorMap, p: Vec, feet: Set<number>): Uint16Array {
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
      if (solid(map, i, j) || feet.has(n) || field[n] !== UNREACHED) continue;
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
