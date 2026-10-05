import { describe, it, expect, vi } from 'vitest';
import {
  beginFloor,
  CELL,
  createDelveProfile,
  LOOK_IDS,
  startDive,
  type FloorMap,
  type LookId,
  type Rect,
} from '@alloy/engine';
import { FLOOR_CELL, FLOOR_LOOKS, LOOK, MAT, PixelWorld } from '../arena/pixel/world';
import { renderPixelWorld } from '../arena/pixel/render';
import { PIXEL_THEMES, type PixelTheme } from '../arena/pixel/themes';
import { Texture } from 'pixi.js';
import {
  FloorEngine,
  floorInit,
  snapshotArena,
  type FloorFrame,
} from '../arena/pixel/floor-engine';
import { PixelFloor } from '../arena/pixel/pixel-floor';
import { getDelveRegistry } from '../registry';
import { handMap, ringMap, type HandRoom } from './hand-map';

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
 * (26–29, 24), crumbling cover (34–35, 24–25: structure 0), foliage (26–28,
 * 30–32), mud (31–32, 30) and shallow water (35–37, 30–32).
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
  const cells = [34, 35].flatMap((x) => [24, 25].map((y) => ({ x, y })));
  map.structures = [{ id: 0, cells, life: 120, maxLife: 120 }];
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
      structures: map.structures.map((s) => s.cells),
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

/** Map cell (x, y)'s index on ringMap's 64 × 64. */
const at = (x: number, y: number) => y * 64 + x;

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

  it('stands a sprite-drawn cover look on bare ground, not a ruin, so the sprite stands on it', () => {
    const map = furnished();
    map.cells[at(26, 26)] = CELL.cover;
    map.look[at(26, 26)] = LOOK_IDS.indexOf('statue');
    const pw = floor(map);
    const ground = pw.mat[mid(pw, 27, 26)]; // a plain ground cell, same room
    expect(pw.mat[mid(pw, 26, 26)]).toBe(ground);
    expect(pw.mat[mid(pw, 26, 26)]).not.toBe(MAT.RUIN);
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

describe('crumbling cover on the pixel floor', { timeout: 20000 }, () => {
  it('cracks from the start, and more as its structure wears; cover never', () => {
    const pw = floor(furnished());
    expect(pw.crackAt(mid(pw, 34, 24))).toBe(0.25);
    expect(pw.crackAt(mid(pw, 27, 24))).toBe(0);
    const light = () => {
      const out = new Uint8ClampedArray(pw.size * 4);
      renderPixelWorld(pw, out, 1);
      return [34, 35]
        .flatMap((x) => cellsOf(pw, x, 24))
        .reduce((s, i) => s + out[i * 4] + out[i * 4 + 1] + out[i * 4 + 2], 0);
    };
    const whole = light();
    pw.setCracks([1]);
    expect(pw.crackAt(mid(pw, 34, 24))).toBe(1);
    expect(light()).toBeLessThan(whole * 0.95);
  });

  it('crumbles into rubble where it is told: slow ground a step down, and a burst of its stone', () => {
    const pw = floor(furnished());
    const cells = cellsOf(pw, 34, 24);
    const before = pw.terrain[cells[12]];
    const particles = pw.particleCount;
    pw.setCells([at(34, 24), CELL.slow, LOOK.rubble, at(35, 24), CELL.slow, LOOK.rubble]);
    for (const i of cells) {
      expect(pw.mat[i]).toBe(MAT.SLOW);
      expect(pw.lookAt(i)).toBe(LOOK.rubble);
      expect(pw.edge[i]).toBe(0);
    }
    expect(pw.terrain[cells[12]]).toBeLessThan(before - 0.08);
    expect(pw.particleCount).toBeGreaterThan(particles + 10);
    expect(pw.mat[mid(pw, 34, 25)]).toBe(MAT.RUIN);
  });
});

/** A dive's first floor, played on `map`. */
function onMap(map: FloorMap) {
  const registry = getDelveRegistry();
  const world = beginFloor(registry, startDive(registry, createDelveProfile(registry, 99), 1));
  return Object.assign(world, { map, width: map.width, height: map.height });
}

/** A frame of the floor: the hero at (30, 27), looking at the combat room. */
function frame(more: Partial<FloorFrame> = {}): FloorFrame {
  return {
    dt: 0,
    events: [],
    bodies: [],
    hero: { x: 30, y: 27, element: null },
    projectiles: [],
    zones: [],
    drops: [],
    view: { left: 20, top: 20, right: 40, bottom: 34 },
    ...more,
  };
}

describe('the floor follows the map', { timeout: 20000 }, () => {
  it("repaints the cells a frame names, and cracks the structures by the frame's wear", () => {
    const engine = new FloorEngine(floorInit(onMap(furnished())));
    const pw = engine.world;
    engine.frame(frame({ cracks: [0.5] }));
    expect(pw.damage[0]).toBe(0.5);
    engine.frame(frame({ cells: [at(34, 25), CELL.slow, LOOK.rubble] }));
    expect(pw.mat[mid(pw, 34, 25)]).toBe(MAT.SLOW);
  });

  it("sends a crumble's cells with the next frame, once, and its structures' wear as it moves", () => {
    const map = furnished();
    const world = onMap(map);
    const sent: FloorFrame[] = [];
    const spy = vi.spyOn(FloorEngine.prototype, 'frame').mockImplementation((f) => {
      sent.push(f);
      return null;
    });
    const floor = new PixelFloor(floorInit(world));
    const view = { left: 20, top: 20, right: 40, bottom: 34 };
    floor.update(0.1, world, view);
    expect(sent[0].cracks).toEqual([0]);
    expect(sent[0].cells).toBeUndefined();
    map.structures[0].life = 115; // a scratch: under half a step of wear
    floor.update(0.1, world, view);
    expect(sent[1].cracks).toBeUndefined();
    map.structures[0].life = 60;
    floor.update(0.1, world, view);
    expect(sent[2].cracks).toEqual([0.5]);
    for (const { x, y } of map.structures[0].cells) {
      map.cells[at(x, y)] = CELL.slow;
      map.look[at(x, y)] = LOOK.rubble;
    }
    map.structures[0].life = 0;
    map.version++;
    floor.update(0.1, world, view);
    expect(sent[3].cells).toEqual(
      [at(34, 24), at(35, 24), at(34, 25), at(35, 25)].flatMap((c) => [c, CELL.slow, LOOK.rubble]),
    );
    expect(sent[3].cracks).toEqual([1]);
    floor.update(0.1, world, view);
    expect(sent[4].cells).toBeUndefined();
    spy.mockRestore();
    floor.destroy();
  });

  it('falls back from a lost worker to a floor that still shows what crumbled', () => {
    const map = furnished();
    const world = onMap(map);
    const workers: { onmessage: (e: unknown) => void; onerror: () => void }[] = [];
    vi.stubGlobal(
      'Worker',
      class {
        onmessage = () => {};
        onerror = () => {};
        constructor() {
          workers.push(this);
        }
        postMessage() {}
        terminate() {}
      },
    );
    const sent: FloorFrame[] = [];
    const spy = vi.spyOn(FloorEngine.prototype, 'frame').mockImplementation((f) => {
      sent.push(f);
      return null;
    });
    const floor = new PixelFloor(floorInit(world));
    const view = { left: 20, top: 20, right: 40, bottom: 34 };
    floor.update(0.1, world, view);
    workers[0].onmessage({ data: { type: 'spare', buffer: null } });
    for (const { x, y } of map.structures[0].cells) {
      map.cells[at(x, y)] = CELL.slow;
      map.look[at(x, y)] = LOOK.rubble;
    }
    map.structures[0].life = 0;
    map.version++;
    // The crumble goes to the worker, which then fails: the floor falls back in this thread.
    floor.update(0.1, world, view);
    workers[0].onerror();
    floor.update(0.1, world, view);
    expect(sent[0].cells).toEqual(
      [at(34, 24), at(35, 24), at(34, 25), at(35, 25)].flatMap((c) => [c, CELL.slow, LOOK.rubble]),
    );
    expect(sent[0].cracks).toEqual([1]);
    vi.unstubAllGlobals();
    spy.mockRestore();
    floor.destroy();
  });
});

describe("the foliage's canopy", { timeout: 20000 }, () => {
  /** The canopy's alpha at each floor cell, drawn whole at a pixel a cell. */
  function canopy(pw: PixelWorld): (i: number) => number {
    const out = new Uint8ClampedArray(pw.size * 8);
    renderPixelWorld(pw, out, 1, {
      x0: 0,
      y0: 0,
      w: pw.width,
      h: pw.height,
      scale: 1,
      canopy: true,
    });
    return (i) => out[(pw.size + i) * 4 + 3];
  }

  it('lays leaves over the foliage alone, in a second picture under the floor', () => {
    const pw = floor(furnished());
    expect(pw.hasFoliage).toBe(true);
    expect(floor(ringMap()).hasFoliage).toBe(false);
    const alpha = canopy(pw);
    // The patch (26–28, 30–32), a cell higher (the leaves stand up) and one to each side (the sway).
    const [x0, y0] = [pw.margin + 26 * PPU - 1, pw.margin + 30 * PPU - 1];
    const [x1, y1] = [pw.margin + 29 * PPU, pw.margin + 33 * PPU - 1];
    let leaves = 0;
    for (let i = 0; i < pw.size; i++) {
      const [x, y] = [i % pw.width, Math.floor(i / pw.width)];
      if (x < x0 || x > x1 || y < y0 || y >= y1) expect(alpha(i)).toBe(0);
      else if (alpha(i) > 0) leaves++;
    }
    expect(leaves).toBeGreaterThan(80);
  });

  it('turns see-through round the hero standing in it', () => {
    const pw = floor(furnished());
    const c = mid(pw, 27, 31);
    const [cx, cy] = [c % pw.width, Math.floor(c / pw.width)];
    const near = (alpha: (i: number) => number) => {
      let sum = 0;
      for (let y = cy - 5; y <= cy + 5; y++)
        for (let x = cx - 5; x <= cx + 5; x++) sum += alpha(y * pw.width + x);
      return sum;
    };
    const shut = near(canopy(pw));
    pw.seeThrough = { x: cx, y: cy, r: 12.5 };
    expect(near(canopy(pw))).toBeLessThan(shut * 0.4);
  });

  it('opens round the hero in foliage, out to its sight there; the canopy rides under the picture', () => {
    const engine = new FloorEngine({ ...floorInit(onMap(furnished())), foliageSight: 2.5 });
    const pic = engine.frame(frame({ hero: { x: 27.5, y: 31.5, element: null } }))!;
    expect(pic.layers).toBe(2);
    expect(pic.pixels.length).toBe(pic.width * pic.height * 4 * 2);
    expect(engine.world.seeThrough).toMatchObject({ r: 12.5 });
    engine.frame(frame({ dt: 0.1 }));
    expect(engine.world.seeThrough).toBeNull();
    expect(new FloorEngine(floorInit(onMap(ringMap()))).frame(frame())!.layers).toBe(1);
  });

  it('shows the canopy as a sprite of its own, over the same window as the floor', () => {
    const world = onMap(furnished());
    const floor = new PixelFloor(floorInit(world));
    floor.update(0.1, world, { left: 20, top: 20, right: 40, bottom: 34 });
    expect(floor.canopy.texture).not.toBe(Texture.EMPTY);
    expect(floor.canopy.texture.frame.height).toBe(floor.sprite.texture.frame.height);
    expect([floor.canopy.x, floor.canopy.y]).toEqual([floor.sprite.x, floor.sprite.y]);
    floor.destroy();
  });

  it('lets no hidden ambusher part the leaves', () => {
    const world = onMap(furnished());
    expect(world.monsters.length).toBeGreaterThan(0);
    world.monsters[0].ambush = true;
    const snap = snapshotArena(world, 0.1, [], frame().view);
    expect(snap.bodies.map(([key]) => key)).not.toContain(`m${world.monsters[0].id}`);
    expect(snap.bodies).toHaveLength(world.monsters.length);
  });
});

/**
 * A 96 × 96 map, the largest a generated floor makes: 4 × 4 rooms of 20 × 20
 * in coarse cells of 24, joined by halls, a pool of shallow water in each.
 */
function bigMap(): FloorMap {
  const rooms: HandRoom[] = [];
  const halls: Rect[] = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      rooms.push({
        kind: r + c ? 'combat' : 'start',
        rect: { x: 2 + 24 * c, y: 2 + 24 * r, w: 20, h: 20 },
      });
      if (c < 3) halls.push({ x: 22 + 24 * c, y: 10 + 24 * r, w: 4, h: 3 });
      if (r < 3) halls.push({ x: 10 + 24 * c, y: 22 + 24 * r, w: 3, h: 4 });
    }
  const map = handMap(96, 96, rooms, halls);
  for (const { rect } of map.rooms)
    for (let y = rect.y + 12; y < rect.y + 15; y++)
      for (let x = rect.x + 12; x < rect.x + 15; x++) {
        map.cells[y * 96 + x] = CELL.slow;
        map.look[y * 96 + x] = LOOK.shallow_water;
      }
  return map;
}

describe('a 96 × 96 floor', { timeout: 20000 }, () => {
  it('simulates round the view only: a screen of it wakes at most a third of its chunks', () => {
    const engine = new FloorEngine(floorInit(onMap(bigMap())));
    expect(engine.world.awake.length).toBe(16 * 16);
    const view = { left: 24, top: 34.5, right: 72, bottom: 61.5 }; // 48 × 27 units, the camera's
    engine.frame(frame({ dt: 0.1, hero: { x: 48, y: 48, element: null }, view }));
    expect(engine.world.awake.reduce((n, a) => n + a, 0)).toBeLessThanOrEqual((16 * 16) / 3);
  });
});
