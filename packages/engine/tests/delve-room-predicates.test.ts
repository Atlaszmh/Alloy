import { describe, it, expect } from 'vitest';
import { flowField, UNREACHED } from '../src/arpg/flow.js';
import {
  isWalkable,
  moveCircle,
  perceives,
  sees,
  snapToWalkable,
  solid,
  solidCode,
} from '../src/arpg/grid.js';
import { generateFloor } from '../src/arpg/layout/generate.js';
import { CELL } from '../src/types/floor-map.js';
import { registry, run, STEP } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';
import { walledMap } from './fixtures/maps.js';

// See the room objects spec's two predicates: `solid` (a wall, a shut door, cover, crumbling
// cover) for movement, the fields, spawns, shots and hits; `perceives` for sight (`sees` and
// foliage's two rules: `delve-terrain-sight`). Every reader asks one of them, so the new cells
// act at once.

/** A 12 × 12 map with column 6 of `code`, the hero starting at (3.5, 6.5). */
function column(code: number) {
  const map = walledMap(12, 12, []);
  for (let y = 0; y < 12; y++) map.cells[y * 12 + 6] = code;
  map.start = { x: 3.5, y: 6.5 };
  return map;
}

describe('solidCode and solid', () => {
  it('a wall, cover and crumbling cover are solid; floor, foliage and slow ground never', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(solidCode)).toEqual([
      false,
      true,
      false,
      true,
      true,
      false,
      false,
    ]);
    expect([CELL.cover, CELL.crumbling, CELL.foliage, CELL.slow]).toEqual([3, 4, 5, 6]);
  });

  it("a door's cell is solid while its door is shut, and so is off the map", () => {
    const map = twoRooms('combat');
    expect(solid(map, 9, 6)).toBe(false);
    map.doors[0].closed = true;
    expect(solid(map, 9, 6)).toBe(true);
    expect([solid(map, -1, 0), solid(map, 0, map.height)]).toEqual([true, true]);
  });

  it('is the rule on every cell of generated, furnished floors: the code alone, but a shut door', () => {
    for (const depth of [1, 3, 5, 7]) {
      const biome = registry.getBiomeForDepth(depth);
      const map = generateFloor(registry, 11 + depth, depth, biome, null);
      map.doors[0].closed = true;
      expect(map.cells.some((c) => c > 2)).toBe(true);
      expect(map.version).toBe(0);
      for (let y = 0; y < map.height; y++)
        for (let x = 0; x < map.width; x++) {
          const c = map.cells[y * map.width + x];
          const shut = map.doors[0].cells.some((v) => v.x === x && v.y === y);
          expect(solid(map, x, y)).toBe(solidCode(c) || (c === 2 && shut));
        }
    }
  });
});

describe('every reader asks a predicate', () => {
  for (const [name, code, isSolid] of [
    ['cover', CELL.cover, true],
    ['crumbling cover', CELL.crumbling, true],
    ['foliage', CELL.foliage, false],
    ['slow ground', CELL.slow, false],
  ] as const)
    it(`${name} ${isSolid ? 'stops' : 'never stops'} movement, the fields, shots, hits and sight`, () => {
      const map = column(code);
      const a = { x: 3.5, y: 6.5 };
      const b = { x: 9.5, y: 6.5 };
      // Movement and placement.
      expect(moveCircle(map, a, 0.4, 6, 0).x < 6).toBe(isSolid);
      expect(isWalkable(map, 6.5, 6.5)).toBe(!isSolid);
      expect(snapToWalkable(map, 6.5, 6.5).x !== 6.5).toBe(isSolid);
      // The flow fields: the column cuts the map in two.
      expect(flowField(map, b, 100, 1)[6 * 12 + 3] === UNREACHED).toBe(isSolid);
      // Shots and hits, and sight (one cell of foliage hides nothing: `foliageDepth`).
      expect(sees(map, a, b)).toBe(!isSolid);
      expect(perceives(map, a, b)).toBe(!isSolid);
      // The fog: a solid column is lit as a wall beside lit floor, and hides what's past it; a
      // foliage cell 3 units off is out of sight (`foliageSight`).
      const w = floorWorld(map);
      run(w, STEP);
      expect(w.fog[6 * 12 + 6]).toBe(code === CELL.foliage ? 0 : 2);
      expect(w.fog[6 * 12 + 9]).toBe(isSolid ? 0 : 2);
      // The hero's walk.
      run(w, 1, { x: 1, y: 0 });
      expect(w.hero.x <= 6 - w.hero.radius + 1e-9).toBe(isSolid);
    });
});
