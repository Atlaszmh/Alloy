import { createFloorWorld, type FloorOptions } from '../../src/arpg/world.js';
import { loadAndValidateData } from '../../src/data/loader.js';
import { DataRegistry } from '../../src/data/registry.js';
import { computeHeroStats } from '../../src/delve/hero-stats.js';
import type { ArpgWorld } from '../../src/types/arpg.js';
import type { TutorialFloorDef } from '../../src/types/tutorial-floor.js';
import { DEFAULT_CHAINS, gear, registry } from './arena.js';

// Hand-built floors for the tests (see the tutorial spec's "Hand-built floors").

/**
 * Start (a shrine) | door 0 | a den (a chest; an elite rat, a slamOnly beetle) | door 1, a
 * hall, door 2 | the boss room (Foreman Grask and the gate).
 */
export const TEST_FLOOR: TutorialFloorDef = {
  id: 't-1',
  dive: 9,
  depth: 3,
  rows: [
    '########################',
    '#...#......####........#',
    '#.S.0...C..1..2......X.#',
    '#H..0......1..2........#',
    '#...0......1..2........#',
    '#...#......####........#',
    '########################',
  ],
  rooms: [
    { id: 0, kind: 'start', rect: { x: 1, y: 1, w: 3, h: 5 } },
    { id: 1, kind: 'den', rect: { x: 5, y: 1, w: 6, h: 5 } },
    { id: 2, kind: 'boss', rect: { x: 15, y: 1, w: 8, h: 5 } },
  ],
  spawns: [
    {
      id: 'champ',
      monster: 'mine_rat',
      at: { x: 7.5, y: 3.5 },
      room: 1,
      elite: { traits: ['swift'] },
      hpMult: 2,
      damageMult: 0.5,
    },
    { id: 'brute', monster: 'slag_beetle', at: { x: 9.5, y: 4.5 }, room: 1, script: 'slamOnly' },
    { id: 'grask', monster: 'foreman_grask', at: { x: 18.5, y: 3.5 }, room: 2, boss: true },
  ],
  markers: [{ id: 'walk', at: { x: 2.5, y: 4.5 } }],
  drops: [],
};

/** The default registry with `floors` beside the tutorial's own. */
export function withFloors(...floors: TutorialFloorDef[]): DataRegistry {
  const data = loadAndValidateData();
  return new DataRegistry({
    ...data,
    tutorial: { ...data.tutorial, floors: [...data.tutorial.floors, ...floors] },
  });
}

/**
 * Hand-built floor `floor` at depth 3 (`registry`'s), as `beginFloor` builds it: a Fire
 * sword, the fixture's chains, full life, three potions, a Fire and Frost pair.
 */
export function builtWorld(
  reg: DataRegistry,
  floor: string,
  opts: Partial<FloorOptions> = {},
): ArpgWorld {
  const equipped = { weapon: gear('fire'), chest: gear('earth', 'chest') };
  return createFloorWorld(reg, {
    depth: 3,
    door: null,
    stats: computeHeroStats(equipped, registry),
    chains: DEFAULT_CHAINS,
    heroHpFrac: 1,
    potions: 3,
    phoenixAvailable: true,
    seed: 5,
    loot: {
      nextUid: 100,
      find: 0,
      legendaryBoost: 1,
      patterns: [],
      dropsGiven: [],
      pair: ['fire', 'frost'],
    },
    tutorial: { floor, state: { step: 'walk', count: 0, misses: 0 } },
    ...opts,
  });
}
