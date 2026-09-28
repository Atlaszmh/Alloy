import { describe, it, expect } from 'vitest';
import type { ArpgEvent, ManaType } from '@alloy/engine';
import { PixelWorld, MAT, PROP } from '../arena/pixel/world';
import { renderPixelWorld } from '../arena/pixel/render';
import { PIXEL_THEMES, type PixelTheme } from '../arena/pixel/themes';
import { MAX_STAMPS, RIM_STAMPS, applyArenaEvent, arenaToCell } from '../arena/pixel/arena-effects';

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
      infusion: null,
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
        infusion: null,
      },
      PPU,
      MARGIN,
    );
    expect(count(pw, (j) => pw.charge[j] > 0.5 && pw.fluid[j] > 0.006)).toBeGreaterThan(100);
  });
});

describe('the growth brush', () => {
  it('grows in over about 15 steps, fades as its target falls, and never spreads', () => {
    const pw = make();
    const spot = find(pw, (_i, x, y) => neighborhood(pw, x, y, 4, (j) => pw.mat[j] !== MAT.WALL));
    const i = spot.y * pw.width + spot.x;
    const far = i + 8; // outside the brush's radius of 3
    pw.sprout(spot.x, spot.y, 3);
    expect(pw.growthTarget[i]).toBe(1);
    expect(pw.growth[i]).toBe(0);
    for (let s = 0; s < 7; s++) pw.step();
    expect(pw.growth[i]).toBeCloseTo(7 / 15, 5);
    for (let s = 7; s < 15; s++) pw.step();
    expect(pw.growth[i]).toBeGreaterThan(0.85);
    for (let s = 15; s < 60; s++) pw.step();
    expect(pw.growth[i]).toBeGreaterThan(0.4); // still there while the target is high
    for (let s = 60; s < 135; s++) pw.step();
    expect(pw.growth[i]).toBe(0);
    expect(pw.growthTarget[i]).toBe(0);
    expect(pw.growth[far]).toBe(0);
    expect(pw.growthTarget[far]).toBe(0);
  });

  it('draws grown cells greener', () => {
    const pw = make();
    const spot = find(pw, (_i, x, y) =>
      neighborhood(pw, x, y, 4, (j) => pw.fluid[j] === 0 && pw.mat[j] !== MAT.WALL),
    );
    const cells: number[] = [];
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) cells.push((spot.y + dy) * pw.width + spot.x + dx);
    const greenness = () => {
      const out = new Uint8ClampedArray(pw.size * 4);
      renderPixelWorld(pw, out, 1);
      return cells.reduce((sum, c) => sum + out[c * 4 + 1] - (out[c * 4] + out[c * 4 + 2]) / 2, 0);
    };
    const before = greenness();
    for (const c of cells) pw.growth[c] = 1;
    expect(greenness()).toBeGreaterThan(before);
  });
});

/** A floor that records the brushes applied to it (in cells), for the stamp tests. */
function spyFloor() {
  const stamps: { brush: string; x: number; y: number; r: number }[] = [];
  const arcs: { x: number; y: number }[][] = [];
  const brush = (name: string) => (x: number, y: number, r: number) => {
    stamps.push({ brush: name, x, y, r });
  };
  const pw = {
    fireBlast: brush('fire'),
    frostBlast: brush('frost'),
    stormBlast: brush('storm'),
    earthImpact: brush('earth'),
    shadowBlast: brush('shadow'),
    sprout: brush('nature'),
    hitSpark: () => {},
    soulBurst: () => {},
    stormArc: (points: { x: number; y: number }[]) => {
      arcs.push(points.map((p) => ({ x: p.x, y: p.y })));
    },
  } as unknown as PixelWorld;
  return { pw, stamps, arcs };
}

describe('infusions on the pixel floor', () => {
  const at = (x: number, y: number) => arenaToCell(x, y, PPU, MARGIN);
  const gaps = (s: { x: number; y: number }[]) =>
    s.slice(1).map((p, k) => Math.hypot(p.x - s[k].x, p.y - s[k].y));
  const slash = (arc: number, infusion: ManaType | null): ArpgEvent => ({
    kind: 'slash',
    x: 10,
    y: 10,
    dir: { x: 0, y: -1 },
    range: 2.4,
    arc,
    element: 'storm',
    heft: 0.5,
    infusion,
  });
  const lance = (infusion: ManaType | null): ArpgEvent => ({
    kind: 'beam',
    x: 5,
    y: 30,
    tx: 5,
    ty: 5,
    width: 0.55,
    element: 'fire',
    infusion,
  });

  it("marks a blast's rim with 6 stamps of the infusion, after the body's own brush", () => {
    const c = at(10, 10);
    for (const infusion of ['nature', 'frost', 'fire', 'earth', 'shadow'] as const) {
      const f = spyFloor();
      applyArenaEvent(
        f.pw,
        { kind: 'explode', x: 10, y: 10, radius: 1.5, element: 'frost', infusion },
        PPU,
        MARGIN,
      );
      expect(f.stamps[0]).toMatchObject({ brush: 'frost', x: c.x, y: c.y });
      const rim = f.stamps.slice(1);
      expect(rim).toHaveLength(RIM_STAMPS);
      for (const s of rim) {
        expect(s).toMatchObject({ brush: infusion, r: infusion === 'nature' ? 3 : 2 });
        expect(Math.hypot(s.x - c.x, s.y - c.y)).toBeCloseTo(1.5 * PPU, 5);
      }
    }
    // Storm: one arc round the rim, closed.
    const f = spyFloor();
    applyArenaEvent(
      f.pw,
      { kind: 'explode', x: 10, y: 10, radius: 1.5, element: 'frost', infusion: 'storm' },
      PPU,
      MARGIN,
    );
    expect(f.stamps).toHaveLength(1);
    expect(f.arcs).toHaveLength(1);
    expect(f.arcs[0]).toHaveLength(RIM_STAMPS + 1);
    expect(f.arcs[0][RIM_STAMPS]).toEqual(f.arcs[0][0]);
  });

  it('marks a lance evenly from end to end, one stamp per 5 cells and at most 8', () => {
    const long = spyFloor();
    applyArenaEvent(long.pw, lance('earth'), PPU, MARGIN);
    expect(long.stamps).toHaveLength(MAX_STAMPS); // 125 cells would be 26
    expect(long.stamps[0]).toMatchObject(at(5, 30));
    expect(long.stamps[MAX_STAMPS - 1]).toMatchObject(at(5, 5));
    const g = gaps(long.stamps);
    for (const d of g) expect(d).toBeCloseTo(g[0], 5);
    const short = spyFloor();
    applyArenaEvent(
      short.pw,
      { kind: 'beam', x: 5, y: 10, tx: 5, ty: 8, width: 0.55, element: 'fire', infusion: 'fire' },
      PPU,
      MARGIN,
    );
    expect(short.stamps).toHaveLength(3); // 10 cells
  });

  it("stamps shadow's brush along a path, and draws storm there as one open arc", () => {
    const shadow = spyFloor();
    applyArenaEvent(shadow.pw, lance('shadow'), PPU, MARGIN);
    expect(shadow.stamps).toHaveLength(MAX_STAMPS);
    expect(shadow.stamps.every((s) => s.brush === 'shadow' && s.r === 2)).toBe(true);
    const storm = spyFloor();
    applyArenaEvent(storm.pw, lance('storm'), PPU, MARGIN);
    expect(storm.stamps).toHaveLength(0);
    expect(storm.arcs).toHaveLength(1);
    expect(storm.arcs[0]).toHaveLength(MAX_STAMPS); // not closed back to its start
    expect(storm.arcs[0][0]).toMatchObject(at(5, 30));
    expect(storm.arcs[0][MAX_STAMPS - 1]).toMatchObject(at(5, 5));
  });

  it('marks a slash evenly along its arc', () => {
    const f = spyFloor();
    applyArenaEvent(f.pw, slash(150, 'nature'), PPU, MARGIN);
    const c = at(10, 10);
    expect(f.stamps).toHaveLength(7); // 12 cells out over 150°: about 31 cells of arc
    for (const s of f.stamps) expect(Math.hypot(s.x - c.x, s.y - c.y)).toBeCloseTo(12, 5);
    const g = gaps(f.stamps);
    for (const d of g) expect(d).toBeCloseTo(g[0], 5);
    expect(f.stamps.every((s) => s.y < c.y)).toBe(true); // the arc faces up, where it swung
  });

  it("spaces a 360° slam's marks all the way round, never twice in one place", () => {
    const f = spyFloor();
    applyArenaEvent(f.pw, slash(360, 'fire'), PPU, MARGIN);
    expect(f.stamps).toHaveLength(MAX_STAMPS);
    const g = gaps([...f.stamps, f.stamps[0]]);
    for (const d of g) expect(d).toBeCloseTo(g[0], 5);
    expect(g[0]).toBeGreaterThan(1);
    // Storm closes its arc round the slam.
    const storm = spyFloor();
    applyArenaEvent(storm.pw, slash(360, 'storm'), PPU, MARGIN);
    expect(storm.arcs).toHaveLength(1);
    expect(storm.arcs[0]).toHaveLength(MAX_STAMPS + 1);
    expect(storm.arcs[0][MAX_STAMPS]).toEqual(storm.arcs[0][0]);
  });

  it('marks a blink trail, beside the landing it always had', () => {
    const f = spyFloor();
    applyArenaEvent(
      f.pw,
      { kind: 'dash', fromX: 5, fromY: 20, toX: 5, toY: 16, infusion: 'frost' },
      PPU,
      MARGIN,
    );
    const frost = f.stamps.filter((s) => s.brush === 'frost');
    expect(frost).toHaveLength(5); // 20 cells
    expect(frost[0]).toMatchObject(at(5, 20));
    expect(frost[4]).toMatchObject(at(5, 16));
    expect(f.stamps.filter((s) => s.brush === 'shadow')).toHaveLength(1);
  });

  it('stamps nothing without an infusion', () => {
    const f = spyFloor();
    applyArenaEvent(f.pw, lance(null), PPU, MARGIN);
    applyArenaEvent(f.pw, slash(150, null), PPU, MARGIN);
    expect(f.stamps).toHaveLength(0);
    applyArenaEvent(
      f.pw,
      { kind: 'explode', x: 10, y: 10, radius: 1.5, element: 'fire', infusion: null },
      PPU,
      MARGIN,
    );
    applyArenaEvent(
      f.pw,
      { kind: 'dash', fromX: 5, fromY: 20, toX: 5, toY: 16, infusion: null },
      PPU,
      MARGIN,
    );
    expect(f.stamps.map((s) => s.brush)).toEqual(['fire', 'shadow']);
    expect(f.arcs).toHaveLength(0);
  });
});
