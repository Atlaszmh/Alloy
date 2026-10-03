import { describe, it, expect } from 'vitest';
import {
  beginFloor,
  createDelveProfile,
  generateFloor,
  openRoom,
  startDive,
  type ArpgEvent,
  type FloorMap,
} from '@alloy/engine';
import {
  FloorEngine,
  FLOOR_MARGIN,
  FLOOR_PPU,
  FLOOR_SCALE,
  floorInit,
  snapshotArena,
  type FloorFrame,
} from '../arena/pixel/floor-engine';
import { getDelveRegistry } from '../registry';
import { gridMap, ringMap } from './hand-map';

const registry = getDelveRegistry();

function frame(overrides: Partial<FloorFrame> = {}): FloorFrame {
  return {
    dt: 0,
    events: [],
    bodies: [['hero', 13, 30, 0.5]],
    hero: { x: 13, y: 30, element: null },
    projectiles: [],
    zones: [],
    drops: [],
    view: { left: 6, top: 18, right: 20, bottom: 42 },
    ...overrides,
  };
}

describe('FloorEngine', () => {
  it('paints the visible window at double resolution, placed in arena units', () => {
    const engine = new FloorEngine({
      arenaWidth: 26,
      arenaHeight: 40,
      biomeId: 'sunken_quarry',
      depth: 17,
    });
    const pic = engine.frame(frame())!;
    expect(pic).not.toBeNull();
    expect(pic.width % FLOOR_SCALE).toBe(0);
    expect(pic.width / FLOOR_SCALE).toBeGreaterThanOrEqual(14 * FLOOR_PPU);
    expect(pic.pixels.length).toBe(pic.width * pic.height * 4);
    // The picture covers the requested view.
    expect(pic.x).toBeLessThanOrEqual(6);
    expect(pic.y).toBeLessThanOrEqual(18);
    expect(pic.x + pic.width / (FLOOR_PPU * FLOOR_SCALE)).toBeGreaterThanOrEqual(20);
  });

  it('repaints only when time passes', () => {
    const engine = new FloorEngine({
      arenaWidth: 26,
      arenaHeight: 40,
      biomeId: 'frostvault',
      depth: 7,
    });
    expect(engine.frame(frame())).not.toBeNull();
    expect(engine.frame(frame())).toBeNull();
    expect(engine.frame(frame({ dt: 0.1 }))).not.toBeNull();
  });

  it('replays explosions onto the floor', () => {
    const engine = new FloorEngine({
      arenaWidth: 26,
      arenaHeight: 40,
      biomeId: 'sunken_quarry',
      depth: 17,
    });
    const pw = engine.world;
    const before = pw.scorch.reduce((a, b) => a + b, 0) + pw.frost.reduce((a, b) => a + b, 0);
    const events: ArpgEvent[] = [
      { kind: 'explode', x: 8, y: 12, radius: 1.5, element: 'fire', infusion: null },
      { kind: 'explode', x: 18, y: 28, radius: 1.5, element: 'frost', infusion: null },
    ];
    engine.frame(frame({ events }));
    const after = pw.scorch.reduce((a, b) => a + b, 0) + pw.frost.reduce((a, b) => a + b, 0);
    expect(after).toBeGreaterThan(before + 10);
  });

  it("paints a hero zone, but not a thrown Burst that hasn't landed", () => {
    const scorchAfter = (source: string) => {
      const engine = new FloorEngine({
        arenaWidth: 26,
        arenaHeight: 40,
        biomeId: 'sunken_quarry',
        depth: 17,
      });
      const zone = {
        x: 8,
        y: 12,
        radius: 1.5,
        source,
        element: 'fire' as const,
        owner: 'hero' as const,
      };
      const before = engine.world.scorch.reduce((a, b) => a + b, 0);
      engine.frame(frame({ dt: 0.1, zones: [zone] }));
      return engine.world.scorch.reduce((a, b) => a + b, 0) - before;
    };
    expect(scorchAfter('maelstrom')).toBeGreaterThan(1);
    expect(scorchAfter('burst')).toBe(0);
  });
});

describe('snapshotArena', () => {
  it('keeps only floor-relevant events (infused lances and slashes, not plain ones) and every moving body', () => {
    const profile = startDive(registry, createDelveProfile(registry, 99), 1);
    const world = beginFloor(registry, profile);
    const events: ArpgEvent[] = [
      { kind: 'explode', x: 1, y: 1, radius: 1, element: 'fire', infusion: null },
      { kind: 'cleared' },
      { kind: 'heal', amount: 5, source: 'potion' },
      {
        kind: 'hit',
        id: 1,
        x: 2,
        y: 2,
        amount: 3,
        crit: false,
        element: null,
        heft: 0,
        source: 'basic',
      },
      {
        kind: 'beam',
        x: 1,
        y: 1,
        tx: 4,
        ty: 1,
        width: 0.55,
        element: 'frost',
        infusion: 'nature',
      },
      {
        kind: 'slash',
        x: 2,
        y: 2,
        dir: { x: 0, y: -1 },
        range: 2.4,
        arc: 150,
        element: 'storm',
        heft: 0.5,
        infusion: 'earth',
      },
      // Uninfused lances and slashes do nothing on the floor, so they stay behind.
      { kind: 'beam', x: 1, y: 1, tx: 4, ty: 1, width: 0.55, element: 'frost', infusion: null },
      {
        kind: 'slash',
        x: 2,
        y: 2,
        dir: { x: 0, y: -1 },
        range: 2.4,
        arc: 150,
        element: 'storm',
        heft: 0.5,
        infusion: null,
      },
    ];
    const snap = snapshotArena(world, 0.016, events, { left: 0, top: 0, right: 10, bottom: 10 });
    expect(snap.events.map((e) => e.kind)).toEqual(['explode', 'hit', 'beam', 'slash']);
    expect(snap.bodies).toHaveLength(1 + world.monsters.length);
    expect(snap.bodies[0][0]).toBe('hero');
    // Plain data only, so it can be posted to a worker.
    expect(() => structuredClone(snap)).not.toThrow();
  });
});

describe('a generated floor', { timeout: 20000 }, () => {
  /** A dive's first floor, on `map`, or on the open arena without one. */
  function onMap(map?: FloorMap) {
    const world = beginFloor(registry, startDive(registry, createDelveProfile(registry, 99), 1));
    const { width, height } = registry.getDelveBalance().arena;
    const on = map ?? openRoom(width, height);
    Object.assign(world, { map: on, width: on.width, height: on.height });
    return world;
  }

  it('is built from its map and seeded by it; the open arena as ever', () => {
    const open = floorInit(onMap());
    expect(open.plan).toBeUndefined();
    expect(open.seed).toBeUndefined();
    const init = floorInit(onMap(ringMap()));
    expect(init.plan).toMatchObject({ width: 64, height: 64, ppu: FLOOR_PPU });
    expect(init.plan!.rooms.map((r) => r.kind)).toEqual([
      'start',
      'vault',
      'sanctum',
      'exit',
      'combat',
    ]);
    // Plain data, for the worker; the same map, the same seed; another map, another.
    expect(() => structuredClone(init)).not.toThrow();
    expect(floorInit(onMap(ringMap())).seed).toBe(init.seed);
    expect(floorInit(onMap(gridMap())).seed).not.toBe(init.seed);
    const engine = new FloorEngine(init);
    expect(engine.world.plan).not.toBeNull();
    expect(engine.world.width).toBe((64 + 2 * FLOOR_MARGIN) * FLOOR_PPU);
  });

  it("builds a generator's floor: rock where its walls are, ground where it walks", () => {
    const map = generateFloor(registry, 11, 3, registry.getBiomeForDepth(3), null);
    const pw = new FloorEngine(floorInit(onMap(map))).world;
    const M = FLOOR_MARGIN * FLOOR_PPU;
    for (let c = 0; c < map.cells.length; c++) {
      const [mx, my] = [c % map.width, Math.floor(c / map.width)];
      const i = (M + my * FLOOR_PPU + 2) * pw.width + M + mx * FLOOR_PPU + 2;
      expect(pw.edge[i] > 0).toBe(map.cells[c] === 1);
    }
  });

  it('simulates round the view only; the open arena all of it', () => {
    const big = new FloorEngine(floorInit(onMap(ringMap())));
    big.frame(frame({ dt: 0.1, view: { left: 0, top: 0, right: 20, bottom: 14 } }));
    expect(big.world.awake.some((a) => a === 0)).toBe(true);
    const open = new FloorEngine(floorInit(onMap()));
    open.frame(frame({ dt: 0.1 }));
    expect(open.world.awake.every((a) => a === 1)).toBe(true);
  });
});
