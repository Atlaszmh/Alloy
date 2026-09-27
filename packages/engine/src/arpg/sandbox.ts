import type { DataRegistry } from '../data/registry.js';
import type { AbilityBuilds } from '../types/ability.js';
import type { ArpgWorld, DummyLayout, MonsterEntity, SandboxToggles, Vec } from '../types/arpg.js';
import type { HeroStats, MonsterDef, SandboxBalance } from '../types/delve.js';
import type { ManaType } from '../types/mana.js';
import { clamp } from './geometry.js';
import { createFloorWorld, createMonsterEntity, emptyStatus } from './world.js';

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

/** A dummy is a monster of this definition: its `hp` becomes `dummyLifeMult` (see `spawnDummies`). */
const DUMMY: MonsterDef = {
  id: 'dummy',
  name: 'Training Dummy',
  icon: '🎯',
  hp: 1,
  dmg: 1,
  interval: 1,
};
/** Dummies share a pack no monster uses, so hitting one never wakes anything else. */
const DUMMY_PACK = -1;

function inside(world: ArpgWorld, margin: number, x: number, y: number): Vec {
  return { x: clamp(x, margin, world.width - margin), y: clamp(y, margin, world.height - margin) };
}

/** Where a layout's dummies stand, relative to the hero (up is −y). */
function layoutOffsets(sb: SandboxBalance, layout: DummyLayout): Vec[] {
  const up = sb.dummyDistance;
  if (layout === 'single') return [{ x: 0, y: -up }];
  if (layout === 'row') return [0, 1, 2, 3, 4].map((k) => ({ x: 0, y: -(up + k * sb.rowSpacing) }));
  const c = -(up + 1);
  const r = sb.clumpRadius;
  return [
    { x: 0, y: c },
    { x: r, y: c },
    { x: -r, y: c },
    { x: 0, y: c - r },
    { x: 0, y: c + r },
  ];
}

/**
 * Stand a group of training dummies above the hero, inside the walls. A dummy
 * is a normal size-1 foe with the reference monster's life × `dummyLifeMult`
 * that never acts or dies; `element` is what it resists (null = Neutral).
 */
export function spawnDummies(
  registry: DataRegistry,
  world: ArpgWorld,
  o: { layout: DummyLayout; element: ManaType | null },
): MonsterEntity[] {
  const sb = registry.getDelveBalance().sandbox;
  const h = world.hero;
  return layoutOffsets(sb, o.layout).map((off) => {
    const p = inside(world, sb.edgeMargin, h.x + off.x, h.y + off.y);
    const m = createMonsterEntity(
      registry,
      {
        id: world.nextId++,
        def: { ...DUMMY, hp: sb.dummyLifeMult },
        kind: 'normal',
        depth: world.depth,
        door: null,
        element: world.element,
        x: p.x,
        y: p.y,
        packId: DUMMY_PACK,
      },
      world.rng,
    );
    m.speed = 0;
    m.damage = 0;
    m.dummy = { homeX: p.x, homeY: p.y, element: o.element };
    world.monsters.push(m);
    return m;
  });
}

/** Every dummy back home, with full life, no statuses, no knockback and no hit flash. */
export function resetDummies(world: ArpgWorld): void {
  for (const m of world.monsters) {
    if (!m.dummy) continue;
    m.x = m.dummy.homeX;
    m.y = m.dummy.homeY;
    m.hp = m.maxHp;
    m.status = emptyStatus();
    m.kbx = 0;
    m.kby = 0;
    m.lastHitAt = -1;
  }
}
