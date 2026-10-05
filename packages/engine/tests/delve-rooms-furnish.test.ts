import { describe, it, expect } from 'vitest';
import { openRoom, solid } from '../src/arpg/grid.js';
import { footprintsOf, furnishFloor, type Furnishing } from '../src/arpg/layout/furnish.js';
import { generateFloor } from '../src/arpg/layout/generate.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { CELL, LOOK_IDS, type FloorMap } from '../src/types/floor-map.js';
import { registry } from './fixtures/arena.js';

// The furnisher (see the room objects spec's "The furnisher"): set pieces by each room's
// budget, under the invariants, swept over many seeds × biomes × depths.

const biomes = registry.getDelveData().biomes;
const data = registry.getSetPieces();
/** A registry whose floors come bare (no pieces in any budget), to furnish by hand. */
const unfurnished = createDefaultRegistry();
for (const b of Object.values(unfurnished.getDelveBalance().layout.furnish)) b.pieces = 0;
const SEEDS = Array.from({ length: 8 }, (_, i) => 3 + i * 7717);
const DEPTHS = [1, 6, 14, 30];

interface Furnished {
  label: string;
  depth: number;
  map: FloorMap;
  bare: FloorMap;
  f: Furnishing;
  feet: Set<number>;
}

/** A generated floor in `biome`, furnished here, beside the same floor bare. */
function furnished(
  seed: number,
  depth: number,
  biome = registry.getBiomeForDepth(depth),
): Furnished {
  const map = generateFloor(unfurnished, seed, depth, biome, null);
  const bare = generateFloor(unfurnished, seed, depth, biome, null);
  const f = furnishFloor(registry, map, seed, depth, biome);
  return {
    label: `seed ${seed} depth ${depth} ${biome.id}`,
    depth,
    map,
    bare,
    f,
    feet: footprintsOf(registry, map, f),
  };
}

const ALL = SEEDS.flatMap((seed) =>
  DEPTHS.flatMap((depth) => biomes.map((b) => furnished(seed, depth, b))),
);

/** Cells (indices) of each door's two front rows inside its room. */
function fronts(map: FloorMap): number[] {
  return map.doors.flatMap((d) => {
    const r = map.rooms[d.rooms[0]].rect;
    return d.cells.flatMap((c) => {
      const [dx, dy] =
        c.y === r.y - 1 ? [0, 1] : c.y === r.y + r.h ? [0, -1] : c.x === r.x - 1 ? [1, 0] : [-1, 0];
      return [1, 2].map((k) => (c.y + dy * k) * map.width + c.x + dx * k);
    });
  });
}

/**
 * The cells no large foe (a 3 × 3) can reach from the start over the whole floor, doors open,
 * footprints blocked and `open` walkable, plus the walkable cells no 3 × 3 it reaches covers.
 */
function stranded(map: FloorMap, feet: Set<number>, open: Set<number>): number[] {
  const W = map.width;
  const free = (x: number, y: number) =>
    open.has(y * W + x) || (!solid(map, x, y) && !feet.has(y * W + x));
  const fits = (x: number, y: number) => {
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) if (!free(x + i, y + j)) return false;
    return true;
  };
  // The start's room centre is kept clear, so some 3 × 3 round the start fits.
  const sx = Math.floor(map.start.x);
  const sy = Math.floor(map.start.y);
  const seen = new Set<number>([sy * W + sx]);
  for (const queue = [sy * W + sx]; queue.length > 0; ) {
    const k = queue.shift()!;
    const x = k % W;
    const y = (k - x) / W;
    for (const [i, j] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ])
      if (!seen.has(j * W + i) && fits(i, j)) {
        seen.add(j * W + i);
        queue.push(j * W + i);
      }
  }
  const covered = new Set<number>();
  for (const k of seen)
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) covered.add(k + j * W + i);
  const out: number[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < W; x++) if (free(x, y) && !covered.has(y * W + x)) out.push(y * W + x);
  return out;
}

const roomOf = (map: FloorMap, x: number, y: number) =>
  map.rooms.find(({ rect: r }) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h);

describe('the furnisher', () => {
  it('keeps every walkable cell in a 3 × 3 a large foe reaches from the start, with each structure crumbled alone', () => {
    const bad: string[] = [];
    for (const { label, map, feet } of ALL)
      for (const open of [[], ...map.structures.map((s) => s.cells)]) {
        const cells = new Set(open.map((c) => c.y * map.width + c.x));
        const lost = stranded(map, feet, cells);
        if (lost.length > 0) bad.push(`${label}: ${lost.length} cells, first ${lost[0]}`);
      }
    expect(bad.slice(0, 5), `${bad.length} floors`).toEqual([]);
  });

  it('keeps the halls bare, the doors two cells clear inside, and the start and every interactable clear', () => {
    const bad: string[] = [];
    for (const { label, map, bare, feet } of ALL) {
      const inside = new Uint8Array(map.cells.length);
      for (const { rect: r } of map.rooms)
        for (let y = r.y; y < r.y + r.h; y++)
          inside.fill(1, y * map.width + r.x, y * map.width + r.x + r.w);
      map.cells.forEach((c, i) => {
        if (!inside[i] && (c !== bare.cells[i] || map.look[i] !== 0))
          bad.push(`${label}: hall ${i}`);
      });
      for (const i of fronts(map))
        if (map.cells[i] !== CELL.floor || feet.has(i)) bad.push(`${label}: front ${i}`);
      for (const p of [
        map.start,
        ...map.rooms.flatMap((r) => (r.interactable ? [r.interactable] : [])),
      ])
        for (let j = -1; j <= 1; j++)
          for (let i = -1; i <= 1; i++) {
            const k = (Math.floor(p.y) + j) * map.width + Math.floor(p.x) + i;
            if (map.cells[k] !== bare.cells[k] || feet.has(k)) bad.push(`${label}: centre ${k}`);
          }
    }
    expect(bad.slice(0, 5), `${bad.length} cells`).toEqual([]);
  });

  it('stands hazards their burst and a cell from the doors, their fronts, the start and every interactable', () => {
    let hazards = 0;
    const { interactRadius } = registry.getDelveBalance().ai;
    for (const { label, map, f } of ALL) {
      const its = map.rooms.flatMap((r) => (r.interactable ? [r.interactable] : []));
      const far = [
        map.start,
        ...map.rooms.flatMap((r) => (r.interactable ? [r.interactable] : [])),
        ...[
          ...map.doors.flatMap((d) => d.cells.map((c) => c.y * map.width + c.x)),
          ...fronts(map),
        ].map((k) => ({ x: (k % map.width) + 0.5, y: Math.floor(k / map.width) + 0.5 })),
      ];
      for (const h of f.hazards) {
        hazards++;
        const burst = data.hazards.find((d) => d.id === h.kind)!.burst;
        const near = far.filter((p) => Math.hypot(p.x - h.x, p.y - h.y) < burst + 1);
        expect(near, `${label} ${h.kind} at ${h.x},${h.y}`).toEqual([]);
        // An interactable's too where the hero stands to use it (`ai.interactRadius` off).
        const using = its.filter(
          (p) => Math.hypot(p.x - h.x, p.y - h.y) < burst + 1 + interactRadius,
        );
        expect(using, `${label} ${h.kind} at ${h.x},${h.y}`).toEqual([]);
      }
    }
    expect(hazards).toBeGreaterThan(0);
  });

  it("keeps each room kind's budget: no hazards in the start or boss room, no crumbling cover in a boss room", () => {
    for (const { label, map, f } of ALL) {
      for (const h of f.hazards)
        expect(['start', 'boss'], label).not.toContain(roomOf(map, h.x, h.y)!.kind);
      for (const s of map.structures)
        expect(roomOf(map, s.cells[0].x, s.cells[0].y)!.kind, label).not.toBe('boss');
    }
    // The start is furnished lightest.
    const density = (kind: string) => {
      const rooms = ALL.flatMap(({ map, bare }) =>
        map.rooms
          .filter((r) => r.kind === kind)
          .map((r) => {
            let n = 0;
            for (let y = r.rect.y; y < r.rect.y + r.rect.h; y++)
              for (let x = r.rect.x; x < r.rect.x + r.rect.w; x++)
                n += Number(map.cells[y * map.width + x] !== bare.cells[y * map.width + x]);
            return n / (r.rect.w * r.rect.h);
          }),
      );
      return rooms.reduce((a, b) => a + b, 0) / rooms.length;
    };
    expect(density('den')).toBeGreaterThan(density('start'));
    expect(density('combat')).toBeGreaterThan(density('start'));
  });

  it("writes each crumbling structure's cells, its life by depth, and every furnished cell's look from the palette", () => {
    const life = (depth: number) => {
      const s = ALL.filter((f) => f.depth === depth).flatMap(({ map }) => map.structures)[0];
      return s.maxLife / s.cells.length;
    };
    expect(life(30)).toBeGreaterThan(life(1));
    const overrides = data.pieces.flatMap((p) => Object.values(p.looks ?? {}));
    const bad: string[] = [];
    for (const { label, map, f, bare } of ALL) {
      map.structures.forEach((s, id) => {
        const cells = s.cells.map((c) => map.cells[c.y * map.width + c.x]);
        if (s.id !== id || s.life !== s.maxLife || cells.some((c) => c !== CELL.crumbling))
          bad.push(`${label}: structure ${id}`);
      });
      const crumbling = map.cells.filter((c) => c === CELL.crumbling).length;
      if (map.structures.reduce((n, s) => n + s.cells.length, 0) !== crumbling)
        bad.push(`${label}: crumbling cells outside the structures`);
      const palette = data.palettes[label.split(' ').pop()!];
      const allowed: Record<number, string[]> = {
        [CELL.cover]: [...palette.looks.cover, ...overrides],
        [CELL.crumbling]: [...palette.looks.crumbling, ...overrides],
        [CELL.foliage]: palette.looks.foliage,
        [CELL.slow]: palette.looks.slow,
      };
      map.cells.forEach((c, i) => {
        const ok =
          c === bare.cells[i] ? map.look[i] === 0 : allowed[c]?.includes(LOOK_IDS[map.look[i]]);
        if (!ok) bad.push(`${label}: look ${LOOK_IDS[map.look[i]]} on ${c} at ${i}`);
      });
      for (const p of f.props)
        if (!palette.props.includes(p.kind)) bad.push(`${label}: prop ${p.kind}`);
    }
    expect(bad.slice(0, 5), `${bad.length} cells`).toEqual([]);
  });

  it("places cover, crumbling cover, slow ground, props and hazards, mostly of the palette's, and foliage where the palette has it", () => {
    const count = (floors: Furnished[], code: number) =>
      floors.reduce((n, { map }) => n + map.cells.filter((c) => c === code).length, 0);
    for (const code of [CELL.cover, CELL.crumbling, CELL.slow])
      expect(count(ALL, code), `${code}`).toBeGreaterThan(0);
    for (const biome of biomes) {
      const floors = ALL.filter(({ label }) => label.endsWith(biome.id));
      const leafy = data.palettes[biome.id].looks.foliage.length > 0;
      expect(count(floors, CELL.foliage) > 0, biome.id).toBe(leafy);
      expect(floors.flatMap(({ f }) => f.props).length, biome.id).toBeGreaterThan(0);
    }
    const hazards = ALL.flatMap(({ f }) => f.hazards);
    for (const h of hazards)
      expect(h.element).toBe(data.hazards.find((d) => d.id === h.kind)!.element);
    const off = ALL.flatMap(({ label, f }) =>
      f.hazards.filter((h) => !data.palettes[label.split(' ').pop()!].hazards.includes(h.kind)),
    );
    expect(off.length).toBeGreaterThan(0);
    expect(off.length).toBeLessThan(hazards.length / 2);
    const hides = ALL.filter(({ label }) => label.endsWith('sunken_quarry')).some(({ map }) =>
      map.cells.some((_, k) => {
        const x = k % map.width;
        const y = (k - x) / map.width;
        for (let j = -1; j <= 1; j++)
          for (let i = -1; i <= 1; i++)
            if (map.cells[(y + j) * map.width + x + i] !== CELL.foliage) return false;
        return true;
      }),
    );
    expect(hides).toBe(true);
  });

  it('is the same for the same seed, furnishes the open room not at all, and follows its budget', () => {
    const a = furnished(77, 9);
    const b = furnished(77, 9);
    expect([b.map, b.f]).toEqual([a.map, a.f]);
    const open = openRoom(26, 40);
    expect(furnishFloor(registry, open, 1, 1, biomes[0])).toEqual({ props: [], hazards: [] });
    expect(open.cells.every((c) => c === 0)).toBe(true);
    const map = generateFloor(unfurnished, 77, 9, registry.getBiomeForDepth(9), null);
    expect(furnishFloor(unfurnished, map, 77, 9, registry.getBiomeForDepth(9))).toEqual({
      props: [],
      hazards: [],
    });
    expect(map).toEqual(furnished(77, 9).bare);
  });
});
