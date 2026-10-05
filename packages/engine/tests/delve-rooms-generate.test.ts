import { describe, it, expect } from 'vitest';
import { footprintsOf, furnishFloor } from '../src/arpg/layout/furnish.js';
import { generateFloor, planFloor } from '../src/arpg/layout/generate.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { CELL, type Room } from '../src/types/floor-map.js';
import { bal, registry } from './fixtures/arena.js';

// Bigger rooms and the arena (see the room objects spec's "Sizes and grid"): rooms 12 to 20
// cells a side, a 20 × 20 boss room, one arena a floor over two coarse cells, maps at most
// 96 × 96, each furnished, its rooms' ways home round its props and hazards.

const L = bal.layout;
const { layouts } = registry.getDelveData();
const SEEDS = Array.from({ length: 16 }, (_, i) => 5 + i * 6113);
const DEPTHS = [1, 3, 5, 9, 10, 15, 18, 22, 30, 45];
const ALL = SEEDS.flatMap((seed) =>
  DEPTHS.map((depth) => ({
    label: `seed ${seed} depth ${depth}`,
    seed,
    depth,
    ...planFloor(registry, seed, depth, registry.getBiomeForDepth(depth), null),
  })),
);

describe('bigger rooms', () => {
  it('draws rooms 12 to 20 cells a side, a 20 × 20 boss room and an arena up to 28 × 22, on coarse cells of 24', () => {
    expect(L.coarseCell).toBe(24);
    for (const t of Object.values(layouts.rooms).flat())
      for (const side of [t.w, t.h]) {
        expect(side, t.id).toBeGreaterThanOrEqual(12);
        expect(side, t.id).toBeLessThanOrEqual(20);
      }
    expect([layouts.boss.w, layouts.boss.h]).toEqual([20, 20]);
    for (const t of layouts.arena) {
      expect(t.w, t.id).toBe(28);
      expect(t.h, t.id).toBeLessThanOrEqual(22);
    }
  });

  it('keeps every map within 96 × 96', () => {
    for (const { label, map } of ALL) {
      expect(map.width, label).toBeLessThanOrEqual(96);
      expect(map.height, label).toBeLessThanOrEqual(96);
    }
  });
});

describe('the arena', () => {
  it('is one combat room a floor over two neighbouring coarse cells, never the start, the exit or the boss room', () => {
    const fit = L.coarseCell - L.minWall;
    for (const { label, map } of ALL) {
      const arenas = map.rooms.filter((r) => r.arena);
      expect(arenas, label).toHaveLength(1);
      const [a] = arenas;
      expect([a.kind, a.id === 0], label).toEqual(['combat', false]);
      expect(Math.max(a.rect.w, a.rect.h), label).toBeGreaterThan(fit);
      expect(Math.min(a.rect.w, a.rect.h), label).toBeLessThanOrEqual(fit);
      expect(
        map.doors.some((d) => d.rooms[0] === a.id),
        label,
      ).toBe(true);
    }
    // Both ways round.
    const wide = ALL.filter(({ map }) => map.rooms.some((r) => r.arena && r.rect.w > r.rect.h));
    expect(wide.length).toBeGreaterThan(0);
    expect(wide.length).toBeLessThan(ALL.length);
  });

  it('holds arenaPacks more packs than the deal gives it', () => {
    const none = createDefaultRegistry();
    none.getDelveBalance().layout.arenaPacks = 0;
    for (const { label, seed, depth, map, packs } of ALL.slice(0, 40)) {
      const dealt = planFloor(none, seed, depth, registry.getBiomeForDepth(depth), null).packs;
      expect(packs, label).toEqual(
        dealt.map((n, id) => n + (map.rooms[id].arena ? L.arenaPacks : 0)),
      );
    }
  });
});

describe('the furnished floor', () => {
  it("gives every biome's floors cover, crumbling cover, slow ground, props and hazards, the arena the most", () => {
    for (const biome of registry.getDelveData().biomes) {
      const floors = ALL.filter(({ depth }) => registry.getBiomeForDepth(depth).id === biome.id);
      const cells = (code: number) =>
        floors.reduce((n, { map }) => n + map.cells.filter((c) => c === code).length, 0);
      for (const code of [CELL.cover, CELL.crumbling, CELL.slow])
        expect(cells(code), `${biome.id} ${code}`).toBeGreaterThan(0);
      for (const kind of ['props', 'hazards'] as const)
        expect(
          floors.flatMap(({ furnishing }) => furnishing[kind]).length,
          biome.id,
        ).toBeGreaterThan(0);
    }
    // Furnished cells and objects in a room, on average by kind.
    const held = (kind: (r: Room) => boolean) => {
      const counts = ALL.flatMap(({ map, furnishing }) =>
        map.rooms.filter(kind).map(({ rect: r }) => {
          const inside = (x: number, y: number) =>
            x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
          let n = [...furnishing.props, ...furnishing.hazards].filter((o) =>
            inside(o.x, o.y),
          ).length;
          for (let y = r.y; y < r.y + r.h; y++)
            for (let x = r.x; x < r.x + r.w; x++)
              n += Number(map.cells[y * map.width + x] > CELL.door);
          return n;
        }),
      );
      return counts.reduce((a, b) => a + b, 0) / counts.length;
    };
    expect(held((r) => !!r.arena)).toBeGreaterThan(held((r) => r.kind === 'combat' && !r.arena));
    expect(held((r) => r.kind === 'combat' && !r.arena)).toBeGreaterThan(
      held((r) => r.kind === 'start'),
    );
  });

  it('is the bare floor furnished on its own seed, and every room finds its way home round the props and hazards', () => {
    const bare = createDefaultRegistry();
    for (const b of Object.values(bare.getDelveBalance().layout.furnish)) b.pieces = 0;
    for (const { label, seed, depth, map, furnishing } of ALL.slice(0, 40)) {
      const biome = registry.getBiomeForDepth(depth);
      const plain = generateFloor(bare, seed, depth, biome, null);
      expect(furnishFloor(registry, plain, seed, depth, biome), label).toEqual(furnishing);
      expect([plain.cells, plain.look, plain.structures], label).toEqual([
        map.cells,
        map.look,
        map.structures,
      ]);
      const feet = footprintsOf(registry, map, furnishing);
      for (const room of map.rooms) {
        expect(
          [...feet].filter((k) => room.homeField![k] !== 65535),
          label,
        ).toEqual([]);
        const { x, y } = map.start;
        expect(room.homeField![Math.floor(y) * map.width + Math.floor(x)], label).toBeLessThan(
          65535,
        );
      }
    }
  });
});
