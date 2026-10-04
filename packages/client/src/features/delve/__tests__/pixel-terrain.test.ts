import { describe, it, expect } from 'vitest';
import { CELL, LOOK_IDS, type FloorMap, type LookId } from '@alloy/engine';
import { FLOOR_CELL, FLOOR_LOOKS, LOOK, MAT, PixelWorld } from '../arena/pixel/world';
import { renderPixelWorld } from '../arena/pixel/render';
import { PIXEL_THEMES, type PixelTheme } from '../arena/pixel/themes';
import { ringMap } from './hand-map';

// See the room objects spec's "Client": the pixel floor paints its terrain from the map's cells
// (cover and crumbling cover as low ruins, foliage, slow ground by its look) and nothing else.

const PPU = 5;
const MARGIN = 3;

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * ringMap with its combat room (24, 22; 16 × 14) furnished by hand: a cover line
 * (26–29, 24), crumbling cover (34–35, 24–25), foliage (26–28, 30–32), mud
 * (31–32, 30) and shallow water (35–37, 30–32).
 */
function furnished(): FloorMap {
  const map = ringMap();
  const put = (x0: number, y0: number, x1: number, y1: number, code: number, look: LookId) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        map.cells[y * map.width + x] = code;
        map.look[y * map.width + x] = LOOK_IDS.indexOf(look);
      }
  };
  put(26, 24, 29, 24, CELL.cover, 'ruin');
  put(34, 24, 35, 25, CELL.crumbling, 'cracked_wall');
  put(26, 30, 28, 32, CELL.foliage, 'undergrowth');
  put(31, 30, 32, 30, CELL.slow, 'mud');
  put(35, 30, 37, 32, CELL.slow, 'shallow_water');
  return map;
}

function floor(map: FloorMap, theme: PixelTheme = PIXEL_THEMES.sunken_quarry): PixelWorld {
  return new PixelWorld({
    width: (map.width + MARGIN * 2) * PPU,
    height: (map.height + MARGIN * 2) * PPU,
    margin: MARGIN * PPU,
    seed: 7,
    theme,
    weather: false,
    random: seeded(99),
    plan: {
      width: map.width,
      height: map.height,
      cells: map.cells,
      look: map.look,
      rooms: map.rooms,
      ppu: PPU,
    },
  });
}

/** The floor cells of map cell (mx, my). */
function cellsOf(pw: PixelWorld, mx: number, my: number): number[] {
  const out: number[] = [];
  for (let dy = 0; dy < PPU; dy++)
    for (let dx = 0; dx < PPU; dx++)
      out.push((pw.margin + my * PPU + dy) * pw.width + pw.margin + mx * PPU + dx);
  return out;
}

/** The floor cell in the middle of map cell (mx, my). */
const mid = (pw: PixelWorld, mx: number, my: number) => cellsOf(pw, mx, my)[12];

describe('the pixel floor reads the engine', () => {
  it("mirrors the engine's cell codes and looks", () => {
    expect([...FLOOR_LOOKS]).toEqual([...LOOK_IDS]);
    expect(FLOOR_CELL).toEqual({
      wall: CELL.wall,
      cover: CELL.cover,
      crumbling: CELL.crumbling,
      foliage: CELL.foliage,
      slow: CELL.slow,
    });
  });
});

// Each builds a 64 × 64 floor: about a third of a second, more on a busy machine.
describe("a floor painted from its map's cells", { timeout: 20000 }, () => {
  it('raises cover and crumbling cover as low ruins: above the ground, below the cliffs, never rock', () => {
    const pw = floor(furnished());
    for (const [mx, my] of [
      [26, 24],
      [29, 24],
      [34, 24],
      [35, 25],
    ])
      for (const i of cellsOf(pw, mx, my)) {
        expect(pw.mat[i]).toBe(MAT.RUIN);
        expect(pw.edge[i]).toBe(0);
      }
    const ruin = pw.terrain[mid(pw, 27, 24)];
    expect(ruin).toBeGreaterThan(pw.terrain[mid(pw, 27, 26)] + 0.1);
    expect(ruin).toBeLessThan(0.6); // a cliff stands at 0.6 and up
    expect(pw.lookAt(mid(pw, 34, 24))).toBe(LOOK.cracked_wall);
  });

  it('grows shrubs only on foliage, and they never burn away; slow ground takes its look', () => {
    const pw = floor(furnished());
    for (const i of cellsOf(pw, 27, 31)) {
      expect(pw.mat[i]).toBe(MAT.BUSH);
      expect(pw.fuel[i]).toBe(0);
    }
    for (const i of cellsOf(pw, 31, 30)) {
      expect(pw.mat[i]).toBe(MAT.SLOW);
      expect(pw.lookAt(i)).toBe(LOOK.mud);
    }
    // No shrub off the foliage but the cliffs' overhang.
    for (let i = 0; i < pw.size; i++)
      if (pw.mat[i] === MAT.BUSH && pw.codeAt(i) !== FLOOR_CELL.foliage)
        expect(pw.codeAt(i)).toBe(FLOOR_CELL.wall);
    const f = mid(pw, 27, 31);
    pw.fireBlast(f % pw.width, Math.floor(f / pw.width), 8);
    for (let s = 0; s < 300; s++) pw.step();
    expect(cellsOf(pw, 27, 31).every((i) => pw.mat[i] === MAT.BUSH)).toBe(true);
  });

  it('lays shallow water full in its cells, holds it there, and lets no water anywhere else', () => {
    const map = furnished();
    const pw = floor(map);
    const water = new Set<number>();
    for (let my = 30; my <= 32; my++)
      for (let mx = 35; mx <= 37; mx++) for (const i of cellsOf(pw, mx, my)) water.add(i);
    for (const i of water) expect(pw.fluid[i]).toBeCloseTo(0.05, 6);
    for (let s = 0; s < 120; s++) pw.step();
    for (const i of water) expect(pw.fluid[i]).toBeGreaterThan(0.02);
    for (let i = 0; i < pw.size; i++) if (!water.has(i)) expect(pw.fluid[i]).toBeLessThan(0.003);
    // On a lava floor shallow water is slow ground: no lava.
    const lava = floor(map, PIXEL_THEMES.cinder_mines);
    expect(lava.mat[mid(lava, 36, 31)]).toBe(MAT.SLOW);
    expect(lava.fluid.every((f) => f === 0)).toBe(true);
  });

  it('lets an impact crater the ground but never a ruin, foliage or slow ground', () => {
    const pw = floor(furnished());
    const at = mid(pw, 30, 27);
    pw.earthImpact(at % pw.width, Math.floor(at / pw.width), 22);
    for (let s = 0; s < 300; s++) pw.step();
    expect(pw.mat[at]).toBe(MAT.CRATER);
    for (const [mx, my, m] of [
      [27, 24, MAT.RUIN],
      [27, 30, MAT.BUSH],
      [31, 30, MAT.SLOW],
    ])
      expect(cellsOf(pw, mx, my).every((i) => pw.mat[i] === m)).toBe(true);
  });

  it("draws a ruin in the biome's stone, brighter than the cliffs; timber and mud in their own colours", () => {
    const map = furnished();
    map.look[24 * map.width + 29] = LOOK_IDS.indexOf('timber');
    const pw = floor(map);
    const out = new Uint8ClampedArray(pw.size * 4);
    renderPixelWorld(pw, out, 1);
    const colour = (mx: number, my: number) =>
      [0, 1, 2].map((k) => cellsOf(pw, mx, my).reduce((s, i) => s + out[i * 4 + k], 0) / PPU ** 2);
    const sum = (c: number[]) => c[0] + c[1] + c[2];
    const ruin = colour(27, 24);
    expect(sum(ruin)).toBeGreaterThan(sum(colour(23, 28)) + 40); // the combat room's west wall
    const timber = colour(29, 24);
    expect(timber[0] - timber[2]).toBeGreaterThan(ruin[0] - ruin[2] + 10); // brown, not grey
    const mud = colour(31, 30);
    const ground = colour(30, 27);
    expect(Math.max(...mud.map((v, k) => Math.abs(v - ground[k])))).toBeGreaterThan(15);
  });
});
