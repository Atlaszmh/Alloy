import { describe, it, expect } from 'vitest';
import { createFloorWorld } from '../src/arpg/world.js';
import { stepWorld } from '../src/arpg/step.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import { arena, dummy, registry, run, STEP } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';

// See the tutorial spec: the world's tutorial state, and the events its tallies read (a cast's
// slot, chain step and aim; an interactable used).

const still = { x: 0, y: 0 };
const of = <K extends ArpgEvent['kind']>(events: ArpgEvent[], kind: K) =>
  events.filter((e): e is Extract<ArpgEvent, { kind: K }> => e.kind === kind);

describe("the world's tutorial", () => {
  const opts = (w: ArpgWorld) => ({
    depth: 1,
    door: null,
    stats: w.hero.stats,
    chains: {},
    heroHpFrac: 1,
    potions: 3,
    phoenixAvailable: true,
    seed: 5,
    loot: { ...w.loot, dropsGiven: [] },
  });

  it('is off on an ordinary floor', () => {
    const w = createFloorWorld(registry, opts(arena()));
    expect([w.tutorialFloor, w.tutorial]).toEqual([null, null]);
  });

  it("takes a guided depth's floor and state, its tallies empty", () => {
    const state = { step: 'walk', count: 0, misses: 1 };
    const w = createFloorWorld(registry, { ...opts(arena()), tutorial: { floor: 'd1-1', state } });
    expect(w.tutorialFloor).toBe('d1-1');
    expect(w.tutorial).toEqual({ step: 'walk', count: 0, misses: 1, tally: {} });
  });
});

describe('the events the tallies read', () => {
  it('a cast says its chain step and whether the press aimed it', () => {
    const bolt = { kind: 'light' as const, form: 'bolt' as const, elements: ['fire' as const] };
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { moves: [bolt, bolt] } });
    const cast = (aim?: { x: number; y: number }) => {
      const events = stepWorld(registry, w, { move: still, cast: { slot: 0, aim } }, STEP);
      return [...events, ...run(w, 0.5)].filter((e) => e.kind === 'cast');
    };
    expect(cast()).toMatchObject([{ kind: 'cast', slot: 0, step: 0, aimed: false }]);
    expect(cast({ x: 13, y: 30 })).toMatchObject([{ kind: 'cast', slot: 0, step: 1, aimed: true }]);
  });

  it('a chest opened says so (used), once', () => {
    const w = floorWorld(twoRooms('vault', { kind: 'chest' }));
    Object.assign(w.hero, { x: 19, y: 7 });
    const press = () => stepWorld(registry, w, { move: still, interact: true }, STEP);
    expect(of(press(), 'used')).toEqual([{ kind: 'used', id: '2:1', interactable: 'chest' }]);
    expect(of(press(), 'used')).toEqual([]);
  });
});
