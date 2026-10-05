import type { DataRegistry } from '../../data/registry.js';
import { weightedPick } from '../../loot/item-generator.js';
import { SeededRNG } from '../../rng/seeded-rng.js';
import type { Vec } from '../../types/arpg.js';
import type { BiomeDef } from '../../types/delve.js';
import {
  CELL,
  LOOK_IDS,
  type BiomePalette,
  type FloorMap,
  type PieceLookChar,
  type Room,
  type SetPiece,
} from '../../types/floor-map.js';
import type { ManaType } from '../../types/mana.js';
import { clearanceCells, squareFits } from '../flow.js';
import { dist } from '../geometry.js';
import { solid } from '../grid.js';
import { footprint } from '../objects-base.js';
import { depthGrowth } from '../world.js';

/** What the furnisher placed beside the cells: the props and hazards for `createFloorWorld` to stand. */
export interface Furnishing {
  props: { kind: string; x: number; y: number }[];
  hazards: { kind: string; element: ManaType; x: number; y: number }[];
}

/** Tries a room makes for each piece its budget holds (a den, dense cover, more). */
const TRIES = 4;
const DEN_TRIES = 12;
/** How much likelier a den takes a piece with cover or crumbling cover. */
const DEN_COVER = 3;
/** How far round a room's centre, the start and an interactable the floor stays clear, in cells (a 5 × 5). */
const CLEAR = 2;
/** The legend's cells that the furnisher writes, by the cell code and the palette's look kind. */
const WRITES: Record<PieceLookChar, { code: number; kind: keyof BiomePalette['looks'] }> = {
  '#': { code: CELL.cover, kind: 'cover' },
  c: { code: CELL.crumbling, kind: 'crumbling' },
  f: { code: CELL.foliage, kind: 'foliage' },
  '~': { code: CELL.slow, kind: 'slow' },
};

/**
 * Furnish a generated floor (see the room objects spec's "The furnisher"): each
 * room, by its kind's budget (`delve.layout.furnish`, pieces per 100 floor
 * cells, the arena's its own), takes set pieces from the biome's palette by
 * weight and tag, mirrored and turned when they may be, written into the map's
 * `cells`, `look` and `structures`; a piece that would break an invariant is
 * skipped. Drawn on the floor seed's `furnish` fork, a fork a room. The open
 * room is never furnished.
 */
export function furnishFloor(
  registry: DataRegistry,
  map: FloorMap,
  seed: number,
  depth: number,
  biome: BiomeDef,
): Furnishing {
  const out: Furnishing = { props: [], hazards: [] };
  if (map.open) return out;
  const rng = new SeededRNG(seed).fork('furnish');
  for (const room of map.rooms)
    furnishRoom(registry, map, room, depth, biome, rng.fork(`room:${room.id}`), out);
  return out;
}

/** Every cell a furnishing's props and hazards stand on (their footprints), as one set. */
export function footprintsOf(registry: DataRegistry, map: FloorMap, f: Furnishing): Set<number> {
  const { props, hazards } = registry.getSetPieces();
  const cells = new Set<number>();
  for (const [placed, defs] of [
    [f.props, props],
    [f.hazards, hazards],
  ] as const)
    for (const o of placed) {
      const radius = defs.find((d) => d.id === o.kind)!.radius;
      for (const c of footprint(map, { x: o.x, y: o.y, radius })) cells.add(c);
    }
  return cells;
}

/** `rows` transposed (when `flip`), then turned a quarter clockwise `quarters` times. */
function orient(rows: string[], flip: boolean, quarters: number): string[] {
  let g = rows.map((r) => [...r]);
  if (flip) g = g[0].map((_, x) => g.map((row) => row[x]));
  for (let k = 0; k < quarters; k++) g = g[0].map((_, x) => g.map((row) => row[x]).reverse());
  return g.map((r) => r.join(''));
}

/** A room's pieces, under its budget (see `furnishFloor`). */
function furnishRoom(
  registry: DataRegistry,
  map: FloorMap,
  room: Room,
  depth: number,
  biome: BiomeDef,
  rng: SeededRNG,
  out: Furnishing,
): void {
  const data = registry.getSetPieces();
  const bal = registry.getDelveBalance();
  const budget = bal.layout.furnish[room.arena ? 'arena' : room.kind];
  const palette = data.palettes[biome.id];
  const W = map.width;
  const { x: rx, y: ry, w: rw, h: rh } = room.rect;
  const want = Math.round((rw * rh * budget.pieces) / 100);
  const has = (p: SetPiece, ch: string) => p.rows.some((row) => row.includes(ch));
  const usable = data.pieces.filter(
    (p) =>
      (!p.biomes || p.biomes.includes(biome.id)) &&
      (!has(p, 'f') || palette.looks.foliage.length > 0) &&
      (!has(p, 'u') || palette.props.length > 0) &&
      (!has(p, 'h') || (budget.hazards && palette.hazards.length > 0)) &&
      (!has(p, 'c') || budget.crumbling),
  );
  if (want === 0 || usable.length === 0) return;
  const den = room.kind === 'den';

  // Kept clear: two cells in front of each door, and round the room's centre (where its
  // interactable stands and its foes walk home), the start and the interactable.
  const doors = map.doors.filter((d) => d.rooms[0] === room.id);
  const kept = new Set<number>();
  // What hazards keep their burst and a cell from (`pad` more: an interactable's use reach).
  const reach = bal.ai.interactRadius;
  const shun: (Vec & { pad?: number })[] = [
    map.start,
    ...map.rooms.flatMap((r) => (r.interactable ? [{ ...r.interactable, pad: reach }] : [])),
  ];
  for (const d of doors)
    for (const c of d.cells) {
      const [dx, dy] =
        c.y === ry - 1 ? [0, 1] : c.y === ry + rh ? [0, -1] : c.x === rx - 1 ? [1, 0] : [-1, 0];
      shun.push({ x: c.x + 0.5, y: c.y + 0.5 });
      for (let k = 1; k <= 2; k++) {
        kept.add((c.y + dy * k) * W + c.x + dx * k);
        shun.push({ x: c.x + dx * k + 0.5, y: c.y + dy * k + 0.5 });
      }
    }
  for (const p of [{ x: rx + rw / 2, y: ry + rh / 2 }, map.start, room.interactable])
    if (p && p.x >= rx && p.y >= ry && p.x < rx + rw && p.y < ry + rh)
      for (let j = -CLEAR; j <= CLEAR; j++)
        for (let i = -CLEAR; i <= CLEAR; i++)
          kept.add((Math.floor(p.y) + j) * W + Math.floor(p.x) + i);

  const taken = new Set<number>();
  const structures: number[][] = [];
  const others = data.hazards.filter((h) =>
    palette.hazards.every((id) => data.hazards.find((d) => d.id === id)!.element !== h.element),
  );
  const tries = want * (den ? DEN_TRIES : TRIES);
  for (let t = 0, placed = 0; t < tries && placed < want; t++) {
    // The piece, where it stands and which way it faces.
    const piece = weightedPick(
      usable,
      (p) => p.weight * (den && (has(p, '#') || has(p, 'c')) ? DEN_COVER : 1),
      rng,
    );
    const tag = piece.tags[rng.nextInt(0, piece.tags.length - 1)];
    const flip = piece.turns && rng.next() < 0.5;
    const face = piece.turns ? rng.nextInt(0, 3) : 0;
    // A piece's top row faces the wall it stands on (a corner piece's top-left its corner).
    const quarters = tag === 'edge' && flip ? (face + 1) % 4 : face;
    const rows = orient(piece.rows, flip, quarters);
    const pw = rows[0].length;
    const ph = rows.length;
    const along = (len: number, size: number) =>
      len - 6 >= size ? rng.nextInt(3, len - 3 - size) : -1;
    let x0 = rx;
    let y0 = ry;
    if (tag === 'centre') {
      x0 += along(rw, pw);
      y0 += along(rh, ph);
      if (x0 < rx || y0 < ry) continue;
    } else if (tag === 'edge') {
      const a = along(face % 2 === 0 ? rw : rh, face % 2 === 0 ? pw : ph);
      if (a < 0) continue;
      if (face % 2 === 0) x0 += a;
      else y0 += a;
      if (face === 1) x0 = rx + rw - pw;
      if (face === 2) y0 = ry + rh - ph;
    } else {
      if (face === 1 || face === 2) x0 = rx + rw - pw;
      if (face >= 2) y0 = ry + rh - ph;
    }
    if (pw > rw || ph > rh) continue;

    // What it holds: a prop or a hazard on each spot, a look for each kind of cell.
    const spots: { i: number; prop?: string; hazard?: string }[] = [];
    const writes: { i: number; ch: PieceLookChar }[] = [];
    let fits = true;
    rows.forEach((row, dy) =>
      [...row].forEach((ch, dx) => {
        const x = x0 + dx;
        const y = y0 + dy;
        const i = y * W + x;
        if (ch === '?') return;
        if (ch === '.') fits &&= !solid(map, x, y) && !taken.has(i);
        else fits &&= map.cells[i] === CELL.floor && !kept.has(i) && !taken.has(i);
        if (ch === 'u')
          spots.push({ i, prop: palette.props[rng.nextInt(0, palette.props.length - 1)] });
        else if (ch === 'h') {
          const pool =
            others.length > 0 && rng.next() < bal.terrain.hazardOffElement
              ? others.map((h) => h.id)
              : palette.hazards;
          spots.push({ i, hazard: pool[rng.nextInt(0, pool.length - 1)] });
        } else if (ch in WRITES) writes.push({ i, ch: ch as PieceLookChar });
      }),
    );
    const looks = new Map<PieceLookChar, number>();
    for (const ch of ['#', 'c', 'f', '~'] as const)
      if (writes.some((w) => w.ch === ch)) {
        const list = palette.looks[WRITES[ch].kind];
        const look = piece.looks?.[ch] ?? list[rng.nextInt(0, list.length - 1)];
        looks.set(ch, LOOK_IDS.indexOf(look));
      }
    if (!fits) continue;

    // Hazards keep their burst and a cell from the doors, their fronts, the start and every
    // interactable (and where the hero stands to use it).
    const at = (i: number) => ({ x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 });
    const burst = (id: string) => data.hazards.find((h) => h.id === id)!.burst;
    if (
      spots.some(
        (s) =>
          s.hazard &&
          shun.some(
            (p) => dist(p.x, p.y, at(s.i).x, at(s.i).y) < burst(s.hazard!) + 1 + (p.pad ?? 0),
          ),
      )
    )
      continue;
    const feet = spots.flatMap((s) => {
      const def = s.prop
        ? data.props.find((p) => p.id === s.prop)!
        : data.hazards.find((h) => h.id === s.hazard)!;
      return footprint(map, { ...at(s.i), radius: def.radius });
    });
    if (feet.some((i) => kept.has(i))) continue;

    // Write it, then keep it only if every invariant holds with each structure crumbled alone.
    const before = writes.map((w) => [map.cells[w.i], map.look[w.i]]);
    for (const w of writes) {
      map.cells[w.i] = WRITES[w.ch].code;
      map.look[w.i] = looks.get(w.ch)!;
    }
    const fresh = groups(
      writes.filter((w) => w.ch === 'c').map((w) => w.i),
      W,
    );
    const added = feet.filter((i) => !taken.has(i));
    for (const i of added) taken.add(i);
    if (!sound(map, room, taken, [...structures, ...fresh])) {
      writes.forEach((w, k) => ([map.cells[w.i], map.look[w.i]] = before[k]));
      for (const i of added) taken.delete(i);
      continue;
    }
    placed++;
    structures.push(...fresh);
    const growth = depthGrowth(registry, depth);
    for (const cells of fresh) {
      const life = Math.round(bal.terrain.structureLife * cells.length * growth.hp * growth.ramp);
      map.structures.push({
        id: map.structures.length,
        cells: cells.map((i) => ({ x: i % W, y: Math.floor(i / W) })),
        life,
        maxLife: life,
      });
    }
    for (const s of spots) {
      if (s.prop) out.props.push({ kind: s.prop, ...at(s.i) });
      else {
        const element = data.hazards.find((h) => h.id === s.hazard)!.element;
        out.hazards.push({ kind: s.hazard!, element, ...at(s.i) });
      }
    }
  }
}

/** Cells (map indices) grouped by 4-neighbour contact: a piece's crumbling structures. */
function groups(cells: number[], W: number): number[][] {
  const left = new Set(cells);
  const out: number[][] = [];
  for (const first of cells) {
    if (!left.delete(first)) continue;
    const group = [first];
    for (let k = 0; k < group.length; k++)
      for (const n of [group[k] + 1, group[k] - 1, group[k] + W, group[k] - W])
        if (left.delete(n)) group.push(n);
    out.push(group.sort((a, b) => a - b));
  }
  return out;
}

/**
 * The room's invariants (see `reached`) as they stand, then with each crumbling structure
 * crumbled on its own: on a grid of the room and two cells round it (its doors and the
 * halls' mouths), 1 where walkable (neither solid nor a footprint).
 */
function sound(map: FloorMap, room: Room, taken: Set<number>, structures: number[][]): boolean {
  const W = map.width;
  const { x: rx, y: ry, w: rw, h: rh } = room.rect;
  const x0 = rx - 2;
  const y0 = ry - 2;
  const gw = rw + 4;
  const gh = rh + 4;
  const base = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++)
      base[j * gw + i] = !solid(map, x0 + i, y0 + j) && !taken.has((y0 + j) * W + x0 + i) ? 1 : 0;
  const doors = map.doors
    .filter((d) => d.rooms[0] === room.id)
    .map((d) => d.cells[1] ?? d.cells[0])
    .map((c) => (c.y - y0) * gw + c.x - x0);
  // A boss room: its boss (a huge foe, a 5 × 5) reaches every walkable cell from the centre too.
  const centre = (Math.floor(ry + rh / 2) - y0) * gw + Math.floor(rx + rw / 2) - x0;
  const huge = Math.floor(clearanceCells('huge', 0) / 2);
  return [[], ...structures].every((cells) => {
    const grid = base.slice();
    for (const k of cells) grid[(Math.floor(k / W) - y0) * gw + (k % W) - x0] = 1;
    return (
      reached(grid, gw, gh, doors, 1) &&
      (room.kind !== 'boss' || reached(grid, gw, gh, [centre], huge))
    );
  });
}

/**
 * On a room's grid (see `sound`): whether a foe filling the odd square `half` cells round its
 * cell (1: a large foe's 3 × 3) reaches every one of `doors` from the first, and every
 * walkable cell of the room lies in a square it reaches.
 */
function reached(grid: Uint8Array, gw: number, gh: number, doors: number[], half: number): boolean {
  const open = (i: number, j: number) =>
    i >= 0 && j >= 0 && i < gw && j < gh && grid[j * gw + i] === 1;
  const fits = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) fits[j * gw + i] = squareFits(open, i, j, half) ? 1 : 0;
  if (!fits[doors[0]]) return false;
  const seen = new Uint8Array(gw * gh);
  seen[doors[0]] = 1;
  const queue = [doors[0]];
  for (let q = 0; q < queue.length; q++)
    for (const n of [queue[q] + 1, queue[q] - 1, queue[q] + gw, queue[q] - gw])
      if (fits[n] && !seen[n]) {
        seen[n] = 1;
        queue.push(n);
      }
  if (doors.some((k) => !seen[k])) return false;
  for (let j = 2; j < gh - 2; j++)
    for (let i = 2; i < gw - 2; i++) {
      if (!grid[j * gw + i]) continue;
      let near = 0;
      for (let b = -half; b <= half; b++)
        for (let a = -half; a <= half; a++) near |= seen[(j + b) * gw + i + a];
      if (!near) return false;
    }
  return true;
}
