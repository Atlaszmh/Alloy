import { describe, it, expect } from 'vitest';
import { beginFloor, createDelveProfile, startDive, type ArpgEvent } from '@alloy/engine';
import {
  FloorEngine,
  FLOOR_PPU,
  FLOOR_SCALE,
  snapshotArena,
  type FloorFrame,
} from '../arena/pixel/floor-engine';
import { getDelveRegistry } from '../registry';

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
      { kind: 'explode', x: 8, y: 12, radius: 1.5, element: 'fire' },
      { kind: 'explode', x: 18, y: 28, radius: 1.5, element: 'frost' },
    ];
    engine.frame(frame({ events }));
    const after = pw.scorch.reduce((a, b) => a + b, 0) + pw.frost.reduce((a, b) => a + b, 0);
    expect(after).toBeGreaterThan(before + 10);
  });
});

describe('snapshotArena', () => {
  it('keeps only floor-relevant events and every moving body', () => {
    const profile = startDive(registry, createDelveProfile(registry, 99), 1);
    const world = beginFloor(registry, profile);
    const events: ArpgEvent[] = [
      { kind: 'explode', x: 1, y: 1, radius: 1, element: 'fire' },
      { kind: 'cleared' },
      { kind: 'heal', amount: 5, source: 'potion' },
      { kind: 'hit', id: 1, x: 2, y: 2, amount: 3, crit: false, element: null, heft: 0 },
    ];
    const snap = snapshotArena(world, 0.016, events, { left: 0, top: 0, right: 10, bottom: 10 });
    expect(snap.events.map((e) => e.kind)).toEqual(['explode', 'hit']);
    expect(snap.bodies).toHaveLength(1 + world.monsters.length);
    expect(snap.bodies[0][0]).toBe('hero');
    // Plain data only, so it can be posted to a worker.
    expect(() => structuredClone(snap)).not.toThrow();
  });
});
