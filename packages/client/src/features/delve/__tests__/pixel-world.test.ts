import { describe, it, expect } from 'vitest';
import type { ArpgEvent } from '@alloy/engine';
import { PixelWorld, MAT, PROP } from '../arena/pixel/world';
import { renderPixelWorld } from '../arena/pixel/render';
import { PIXEL_THEMES, type PixelTheme } from '../arena/pixel/themes';
import { applyArenaEvent, arenaToCell } from '../arena/pixel/arena-effects';

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

function make(
  theme: PixelTheme = PIXEL_THEMES.sunken_quarry,
  seed = 7,
  weather = false,
  extra: { fireSpread?: number; burnRate?: number } = {},
): PixelWorld {
  return new PixelWorld({
    ...extra,
    width: (26 + MARGIN * 2) * PPU,
    height: (40 + MARGIN * 2) * PPU,
    margin: MARGIN * PPU,
    seed,
    theme,
    weather,
    random: seeded(99),
  });
}

function count(pw: PixelWorld, test: (i: number) => boolean): number {
  let n = 0;
  for (let i = 0; i < pw.size; i++) if (test(i)) n++;
  return n;
}

function find(
  pw: PixelWorld,
  test: (i: number, x: number, y: number) => boolean,
): { x: number; y: number } {
  for (let y = pw.margin + 4; y < pw.height - pw.margin - 4; y++) {
    for (let x = pw.margin + 4; x < pw.width - pw.margin - 4; x++) {
      if (test(y * pw.width + x, x, y)) return { x, y };
    }
  }
  throw new Error('no matching cell');
}

function neighborhood(
  pw: PixelWorld,
  x: number,
  y: number,
  r: number,
  test: (i: number) => boolean,
): boolean {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) if (!test((y + dy) * pw.width + x + dx)) return false;
  return true;
}

describe('pixel world generation', () => {
  it('builds the same floor from the same seed', () => {
    const a = make();
    const b = make();
    expect(Array.from(a.mat)).toEqual(Array.from(b.mat));
    expect(Array.from(a.terrain.slice(0, 400))).toEqual(Array.from(b.terrain.slice(0, 400)));
    expect(Array.from(make(undefined, 8).mat)).not.toEqual(Array.from(a.mat));
  });

  it('frames the arena with cliffs and fills it with foliage, glowing water and a rune plaza', () => {
    const pw = make();
    expect(pw.mat[0]).toBe(MAT.WALL);
    const inside = (i: number) => {
      const x = i % pw.width;
      const y = (i / pw.width) | 0;
      return (
        x >= pw.margin && x < pw.width - pw.margin && y >= pw.margin && y < pw.height - pw.margin
      );
    };
    const playable = count(pw, inside);
    const green = count(
      pw,
      (i) => inside(i) && (pw.mat[i] === MAT.GRASS || pw.mat[i] === MAT.BUSH),
    );
    expect(green / playable).toBeGreaterThan(0.3);
    expect(count(pw, (i) => inside(i) && pw.fluid[i] > 0.01)).toBeGreaterThan(200);
    expect(count(pw, (i) => pw.mat[i] === MAT.STONE)).toBeGreaterThan(100);
    expect(count(pw, (i) => pw.prop[i] === PROP.RUNE)).toBeGreaterThan(10);
    expect(count(pw, (i) => pw.prop[i] === PROP.FLOWER)).toBeGreaterThan(20);
    expect(count(pw, (i) => pw.prop[i] === PROP.MUSHROOM)).toBeGreaterThan(4);
  });
});

describe('pixel world physics', () => {
  it('runs fluid downhill', () => {
    const pw = make();
    pw.fluid.fill(0);
    pw.springs.length = 0;
    const start = find(pw, (i) => pw.mat[i] === MAT.SOIL || pw.mat[i] === MAT.GRASS);
    pw.splash(start.x, start.y, 3, 0.6);
    const centroid = () => {
      let sum = 0;
      let wy = 0;
      for (let i = 0; i < pw.size; i++) {
        sum += pw.fluid[i];
        wy += pw.fluid[i] * ((i / pw.width) | 0);
      }
      return wy / sum;
    };
    const before = centroid();
    for (let s = 0; s < 120; s++) pw.step();
    expect(centroid()).toBeGreaterThan(before + 1);
  });

  it('spreads fire through grass, leaves ash, and never burns stone', () => {
    const pw = make();
    pw.springs.length = 0;
    const spot = find(
      pw,
      (i, x, y) =>
        pw.fluid[i] === 0 &&
        neighborhood(pw, x, y, 4, (j) => pw.mat[j] === MAT.GRASS && pw.fluid[j] === 0),
    );
    pw.fireBlast(spot.x, spot.y, 2);
    for (let s = 0; s < 400; s++) pw.step();
    expect(count(pw, (i) => pw.mat[i] === MAT.ASH)).toBeGreaterThan(25);
    expect(count(pw, (i) => pw.mat[i] === MAT.STONE && pw.fire[i] > 120)).toBe(0);
  });

  it('keeps gameplay fires to a patch when spread is low', () => {
    const burnedArea = (extra: { fireSpread?: number; burnRate?: number }) => {
      const pw = make(PIXEL_THEMES.sunken_quarry, 7, false, extra);
      pw.springs.length = 0;
      const spot = find(
        pw,
        (i, x, y) =>
          pw.fluid[i] === 0 &&
          neighborhood(pw, x, y, 4, (j) => pw.mat[j] === MAT.GRASS && pw.fluid[j] === 0),
      );
      pw.fireBlast(spot.x, spot.y, 3);
      for (let s = 0; s < 600; s++) pw.step();
      return count(pw, (i) => pw.mat[i] === MAT.ASH);
    };
    const wild = burnedArea({});
    const calm = burnedArea({ fireSpread: 0.12, burnRate: 2 });
    expect(calm).toBeGreaterThan(5);
    expect(calm).toBeLessThan(wild / 3);
  });

  it('puts fire out with water', () => {
    const pw = make();
    const spot = find(pw, (_i, x, y) => neighborhood(pw, x, y, 3, (j) => pw.mat[j] === MAT.GRASS));
    pw.fireBlast(spot.x, spot.y, 3);
    expect(pw.fire[spot.y * pw.width + spot.x]).toBeGreaterThan(0);
    pw.splash(spot.x, spot.y, 5, 0.5);
    for (let s = 0; s < 3; s++) pw.step();
    expect(neighborhood(pw, spot.x, spot.y, 2, (j) => pw.fire[j] === 0)).toBe(true);
  });

  it('freezes fluid with frost and melts it with fire', () => {
    const pw = make();
    const spot = find(pw, (_i, x, y) => neighborhood(pw, x, y, 2, (j) => pw.fluid[j] > 0.02));
    const i = spot.y * pw.width + spot.x;
    pw.frostBlast(spot.x, spot.y, 5);
    expect(pw.frost[i]).toBeGreaterThan(0.5);
    pw.fireBlast(spot.x, spot.y, 5);
    expect(pw.frost[i]).toBeLessThan(0.5);
  });

  it('cools lava into obsidian under frost', () => {
    const pw = make(PIXEL_THEMES.cinder_mines);
    const spot = find(pw, (_i, x, y) => neighborhood(pw, x, y, 1, (j) => pw.fluid[j] > 0.01));
    const i = spot.y * pw.width + spot.x;
    pw.frostBlast(spot.x, spot.y, 4);
    expect(pw.mat[i]).toBe(MAT.OBSIDIAN);
    expect(pw.fluid[i]).toBe(0);
  });

  it('carves a crater and lets the debris settle as rubble', () => {
    const pw = make();
    const spot = find(pw, (_i, x, y) =>
      neighborhood(pw, x, y, 6, (j) => pw.fluid[j] === 0 && pw.mat[j] !== MAT.WALL),
    );
    const i = spot.y * pw.width + spot.x;
    const before = pw.terrain[i];
    pw.earthImpact(spot.x, spot.y, 6);
    expect(pw.terrain[i]).toBeLessThan(before - 0.02);
    expect(pw.particleCount).toBeGreaterThan(30);
    for (let s = 0; s < 300; s++) pw.step();
    expect(count(pw, (j) => pw.mat[j] === MAT.RUBBLE)).toBeGreaterThan(10);
  });

  it('parts foliage under footsteps and lets it spring back', () => {
    const pw = make();
    const spot = find(pw, (i) => pw.mat[i] === MAT.GRASS);
    const i = spot.y * pw.width + spot.x;
    pw.disturb(spot.x, spot.y, 3);
    expect(pw.trample[i]).toBeGreaterThan(0.5);
    for (let s = 0; s < 240; s++) pw.step();
    expect(pw.trample[i]).toBeLessThan(0.1);
  });

  it('rains onto the floor and snows frost onto it', () => {
    const rainy = make(PIXEL_THEMES.sunken_quarry, 7, true);
    for (let s = 0; s < 40; s++) rainy.step();
    expect(rainy.particleCount).toBeGreaterThan(100);
    expect(count(rainy, (i) => rainy.wet[i] > 0.2)).toBeGreaterThan(50);

    const snowy = make(PIXEL_THEMES.frostvault, 7, true);
    const frostBefore = snowy.frost.reduce((a, b) => a + b, 0);
    for (let s = 0; s < 120; s++) snowy.step();
    expect(snowy.frost.reduce((a, b) => a + b, 0)).toBeGreaterThan(frostBefore + 5);
  });
});

describe('pixel world rendering', () => {
  function luminanceNearFluid(theme: PixelTheme): number {
    const pw = make(theme);
    const out = new Uint8ClampedArray(pw.size * 4);
    renderPixelWorld(pw, out, 1);
    let sum = 0;
    for (let y = pw.margin; y < pw.height - pw.margin; y++) {
      for (let x = pw.margin; x < pw.width - pw.margin; x++) {
        const i = y * pw.width + x;
        if (pw.fluid[i] > 0.003 || pw.prop[i] !== PROP.NONE) continue;
        const near =
          pw.fluid[i + 3] > 0.01 ||
          pw.fluid[i - 3] > 0.01 ||
          pw.fluid[i + 3 * pw.width] > 0.01 ||
          pw.fluid[i - 3 * pw.width] > 0.01;
        if (near) sum += out[i * 4] + out[i * 4 + 1] + out[i * 4 + 2];
      }
    }
    return sum;
  }

  it('lets glowing water light up its banks', () => {
    const lit = luminanceNearFluid(PIXEL_THEMES.sunken_quarry);
    const dark = luminanceNearFluid({ ...PIXEL_THEMES.sunken_quarry, fluidGlowStrength: 0 });
    expect(lit).toBeGreaterThan(dark * 1.1);
  });

  it('renders a window of the floor at double resolution', () => {
    const pw = make();
    const view = { x0: 40, y0: 60, w: 50, h: 70, scale: 2 };
    const out = new Uint8ClampedArray(view.w * 2 * view.h * 2 * 4);
    renderPixelWorld(pw, out, 1, view);
    let opaque = 0;
    for (let k = 3; k < out.length; k += 4) if (out[k] === 255) opaque++;
    expect(opaque).toBe(view.w * view.h * 4);
    // Finer detail: the four output pixels of a grass cell are not all identical.
    const cell = find(
      pw,
      (i, x, y) => pw.mat[i] === MAT.GRASS && x > 45 && x < 85 && y > 65 && y < 125,
    );
    const px = (cell.x - view.x0) * 2;
    const py = (cell.y - view.y0) * 2;
    const at = (x: number, y: number) => out[(y * view.w * 2 + x) * 4 + 1];
    const quad = [at(px, py), at(px + 1, py), at(px, py + 1), at(px + 1, py + 1)];
    expect(new Set(quad).size).toBeGreaterThan(1);
  });

  it('fills every pixel with an opaque color', () => {
    const pw = make(PIXEL_THEMES.bone_crypts);
    const out = new Uint8ClampedArray(pw.size * 4);
    renderPixelWorld(pw, out, 0.5);
    expect(count(pw, (i) => out[i * 4 + 3] !== 255)).toBe(0);
    expect(count(pw, (i) => out[i * 4] + out[i * 4 + 1] + out[i * 4 + 2] > 30)).toBeGreaterThan(
      pw.size * 0.5,
    );
  });
});

describe('arena events on the pixel floor', () => {
  /** An explosion centred on a dry, open cell (in arena units). */
  function explodeOnDryGround(
    pw: PixelWorld,
    element: 'fire' | 'frost' | 'earth' | 'storm' | 'shadow' | null,
  ) {
    const cell = find(pw, (_i, x, y) =>
      neighborhood(
        pw,
        x,
        y,
        4,
        (j) => pw.fluid[j] === 0 && pw.mat[j] !== MAT.WALL && pw.mat[j] !== MAT.STONE,
      ),
    );
    const event: ArpgEvent = {
      kind: 'explode',
      x: cell.x / PPU - MARGIN,
      y: cell.y / PPU - MARGIN,
      radius: 1.8,
      element,
    };
    return { i: cell.y * pw.width + cell.x, event };
  }

  it('maps arena units onto floor cells', () => {
    expect(arenaToCell(0, 0, PPU, MARGIN)).toEqual({ x: 15, y: 15 });
    expect(arenaToCell(13, 20, PPU, MARGIN)).toEqual({ x: 80, y: 115 });
  });

  it('scorches the floor under a fire explosion', () => {
    const pw = make();
    const { i, event } = explodeOnDryGround(pw, 'fire');
    applyArenaEvent(pw, event, PPU, MARGIN);
    expect(pw.scorch[i]).toBeGreaterThan(0.5);
  });

  it('craters the floor under an earth explosion', () => {
    const pw = make();
    const { i, event } = explodeOnDryGround(pw, 'earth');
    const before = pw.terrain[i];
    applyArenaEvent(pw, event, PPU, MARGIN);
    expect(pw.terrain[i]).toBeLessThan(before - 0.02);
    expect(pw.mat[i]).toBe(MAT.CRATER);
  });

  it('frosts the floor under a frost explosion', () => {
    const pw = make();
    const { i, event } = explodeOnDryGround(pw, 'frost');
    applyArenaEvent(pw, event, PPU, MARGIN);
    expect(pw.frost[i]).toBeGreaterThan(0.5);
  });

  it('electrifies connected water under a storm explosion', () => {
    const pw = make();
    const cell = find(pw, (_i, x, y) =>
      neighborhood(pw, x, y, 2, (j) => pw.fluid[j] > 0.02 && pw.frost[j] === 0),
    );
    applyArenaEvent(
      pw,
      {
        kind: 'explode',
        x: cell.x / PPU - MARGIN,
        y: cell.y / PPU - MARGIN,
        radius: 1,
        element: 'storm',
      },
      PPU,
      MARGIN,
    );
    expect(count(pw, (j) => pw.charge[j] > 0.5 && pw.fluid[j] > 0.006)).toBeGreaterThan(100);
  });
});
