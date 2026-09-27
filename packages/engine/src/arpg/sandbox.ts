import type { DataRegistry } from '../data/registry.js';
import type { AbilityBuilds } from '../types/ability.js';
import type { ArpgWorld, SandboxToggles } from '../types/arpg.js';
import type { HeroStats } from '../types/delve.js';
import { createFloorWorld } from './world.js';

/**
 * The Training Grounds: an open arena at any depth for trying builds. Its
 * world never clears and drops nothing, training dummies soak hits without
 * acting or dying, any monster can be spawned, and toggles bend the rules
 * (`ArpgWorld.sandbox`, checked where each rule lives). The client only asks
 * for things through these functions. See the Training Grounds spec.
 * Kills and reactions still accrue in `pending`, harmlessly: a sandbox world is never banked.
 */

export interface SandboxWorldOptions {
  depth: number;
  stats: HeroStats;
  abilities: AbilityBuilds;
  toggles: SandboxToggles;
}

/** An empty arena at `depth` (its biome and monster scaling), the hero at `heroStart` facing up. */
export function createSandboxWorld(registry: DataRegistry, o: SandboxWorldOptions): ArpgWorld {
  const bal = registry.getDelveBalance();
  const world = createFloorWorld(registry, {
    depth: o.depth,
    door: null,
    stats: o.stats,
    abilities: o.abilities,
    heroHpFrac: 1,
    potions: bal.dive.potions,
    phoenixAvailable: true,
    seed: 1,
    loot: {
      pity: 0,
      nextUid: 1,
      magicFind: 0,
      legendaryBoost: 1,
      dropMult: 1,
      forceLegendary: false,
    },
    empty: true,
  });
  [world.hero.x, world.hero.y] = bal.sandbox.heroStart;
  world.hero.facing = { x: 0, y: -1 };
  world.sandbox = { ...o.toggles };
  return world;
}
