import { describe, it, expect } from 'vitest';
import { bindTerrain, openRoom, perceives, sees, terrainOf } from '../src/arpg/grid.js';
import { makeCtx } from '../src/arpg/combat.js';
import { nearestMonster } from '../src/arpg/abilities/targeting.js';
import { CELL, type FloorMap } from '../src/types/floor-map.js';
import { bal, dummy, registry, run, STEP } from './fixtures/arena.js';
import { floorWorld } from './fixtures/flow-map.js';
import { block, walledMap } from './fixtures/maps.js';

// See the room objects spec's "Foliage": what stands in foliage is perceived only within
// `foliageSight`, and a line through more than `foliageDepth` of foliage (its ends' own cells
// left out) is blocked. Hits and shots never stop at foliage.

const { foliageSight, foliageDepth } = bal.terrain;

/** A 20 × 20 map (walls nowhere) with these cells foliage, `delve.terrain` bound. */
function leafy(cells: [number, number][]): FloorMap {
  const map = walledMap(20, 20, []);
  for (const [x, y] of cells) map.cells[y * 20 + x] = CELL.foliage;
  bindTerrain(map, bal.terrain);
  return map;
}

/** A patch of foliage, cells x 7–10 and y 8–14. */
const PATCH = block(7, 8, 10, 14);

describe('perceives in foliage', () => {
  it('sees what stands in foliage only within foliageSight, either end, both ways', () => {
    const map = leafy(PATCH);
    const inside = { x: 7.5, y: 11.5 };
    const near = { x: 7.5 - foliageSight + 0.1, y: 11.5 };
    const far = { x: 7.5 - foliageSight - 0.1, y: 11.5 };
    expect([perceives(map, near, inside), perceives(map, inside, near)]).toEqual([true, true]);
    expect([perceives(map, far, inside), perceives(map, inside, far)]).toEqual([false, false]);
  });

  it('inside a patch, cell centres within foliageSight perceive each other and no farther', () => {
    const map = leafy(PATCH);
    for (const [ax, ay] of PATCH)
      for (const [bx, by] of PATCH) {
        const a = { x: ax + 0.5, y: ay + 0.5 };
        const b = { x: bx + 0.5, y: by + 0.5 };
        const d = Math.hypot(bx - ax, by - ay);
        expect(perceives(map, a, b), `${ax},${ay} → ${bx},${by}`).toBe(d <= foliageSight);
      }
  });

  it('a line through more than foliageDepth of foliage is blocked, its ends outside', () => {
    expect(foliageDepth).toBeGreaterThanOrEqual(1);
    expect(foliageDepth).toBeLessThan(2);
    const a = { x: 4.5, y: 4.5 };
    const b = { x: 15.5, y: 4.5 };
    // One cell thick: 1 unit of foliage; two cells thick: 2.
    expect(perceives(leafy(block(10, 0, 10, 19)), a, b)).toBe(true);
    expect(perceives(leafy(block(10, 0, 11, 19)), a, b)).toBe(false);
  });

  it("leaves out the ends' own cells", () => {
    // A hedge two cells thick, x 10–11: from just inside one side to just inside the other.
    const map = leafy(block(10, 0, 11, 19));
    expect(perceives(map, { x: 10.5, y: 4.5 }, { x: 11.5, y: 4.5 })).toBe(true);
    expect(perceives(map, { x: 10.5, y: 4.5 }, { x: 12.5, y: 4.5 })).toBe(true);
    expect(perceives(map, { x: 9.5, y: 4.5 }, { x: 12.5, y: 4.5 })).toBe(false);
  });

  it('walls still block it, and the open room and an unbound map have no foliage rules', () => {
    const map = leafy([]);
    map.cells[4 * 20 + 4] = CELL.wall;
    expect(perceives(map, { x: 2.5, y: 4.5 }, { x: 6.5, y: 4.5 })).toBe(false);
    const open = openRoom(20, 20);
    open.cells.fill(CELL.foliage);
    bindTerrain(open, bal.terrain);
    expect(perceives(open, { x: 0.5, y: 0.5 }, { x: 19.5, y: 19.5 })).toBe(true);
    const unbound = walledMap(20, 20, []);
    for (const [x, y] of PATCH) unbound.cells[y * 20 + x] = CELL.foliage;
    expect(terrainOf(unbound)).toBeUndefined();
    expect(perceives(unbound, { x: 2.5, y: 11.5 }, { x: 17.5, y: 11.5 })).toBe(true);
  });

  it('never stops a hit or a shot: sees ignores foliage', () => {
    const map = leafy(PATCH);
    const a = { x: 2.5, y: 11.5 };
    const b = { x: 17.5, y: 11.5 };
    expect([sees(map, a, b), perceives(map, a, b)]).toEqual([true, false]);
  });
});

describe('the sim perceives through foliage', () => {
  /** The fixture's world on a 20 × 20 map with `PATCH` foliage, the hero at (4.5, 11.5). */
  function world(foes: ReturnType<typeof dummy>[] = []) {
    const map = walledMap(20, 20, []);
    for (const [x, y] of PATCH) map.cells[y * 20 + x] = CELL.foliage;
    map.start = { x: 4.5, y: 11.5 };
    return floorWorld(map, foes);
  }

  it('binds the terrain on its first tick', () => {
    const w = world();
    expect(terrainOf(w.map)).toBeUndefined();
    run(w, STEP);
    expect(terrainOf(w.map)).toBe(bal.terrain);
  });

  it("the fog lights a patch's cells only within foliageSight, and what lies past a thick one not at all", () => {
    const w = world();
    run(w, STEP);
    const fog = (x: number, y: number) => w.fog[y * 20 + x];
    // The patch's near edge, 3 units off; the floor just past it, beyond 4 cells of foliage.
    expect([fog(7, 11), fog(11, 11)]).toEqual([0, 0]);
    // The floor round the patch is in sight.
    expect([fog(6, 11), fog(5, 6)]).toEqual([2, 2]);
    Object.assign(w.hero, { x: 5.5, y: 11.5 });
    run(w, 2 * bal.ai.fogEvery);
    expect([fog(7, 11), fog(8, 11)]).toEqual([2, 0]);
  });

  it('a foe in foliage is out of reach of auto-aim and its wake beyond foliageSight', () => {
    const w = world([dummy(8.5, 11.5, { damage: 1 })]);
    const m = w.monsters[0];
    run(w, STEP);
    expect(nearestMonster(makeCtx(registry, w, []), w.hero.x, w.hero.y, 30)).toBeNull();
    expect(m.aggro).toBe(false);
    Object.assign(w.hero, { x: 8.5 - foliageSight + 0.2, y: 11.5 });
    run(w, STEP);
    expect(nearestMonster(makeCtx(registry, w, []), w.hero.x, w.hero.y, 30)).toBe(m);
    expect(m.aggro).toBe(true);
  });
});
