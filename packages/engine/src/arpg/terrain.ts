import type { ArpgWorld, MonsterEntity, Vec } from '../types/arpg.js';
import type { SimCtx } from './combat.js';

/**
 * Terrain in a fight (B2; see the room objects spec's "Objects in a fight"):
 * slow ground, foliage's lost sight and search, crumbling structures and wall
 * slams. Each hook is called from its place in the sim; until B2 each is inert.
 * Foliage's sight rules are `perceives` (`grid.ts`).
 */

/**
 * How fast a body moves over the ground under it: `terrain.slowMult` on slow
 * ground (`bossSlowMult` for a boss), else 1. The hero's walk and a foe's walk
 * ask it (and the hero's pushes, B2's in `action.ts`); the dodge, knockback and
 * a charger's dash never do. Stub: 1.
 */
export function groundSpeed(_world: ArpgWorld, _body: Vec, _boss = false): number {
  return 1;
}

/**
 * A knocked-back foe's move this tick: it stood at `from` and its knockback
 * asked for `want`. Where a wall or cover stopped it short it is slammed, once
 * a knockback (`terrain.slamDamage` × `MonsterEntity.kbHit`, `slamStagger`).
 * Stub: a no-op.
 */
export function wallSlam(_ctx: SimCtx, _m: MonsterEntity, _from: Vec, _want: Vec): void {}

/**
 * A hit that wears crumbling cover: an ability's impact or a hazard's burst
 * (the circle of `radius` round `at`), or a heavy or hold blow (its cone along
 * `dir`, `arc` degrees), for `damage`. It wears a structure at its face; at 0
 * life the structure crumbles to slow ground (a `crumble` event, the map's
 * `version` bumped). Stub: a no-op.
 */
export function hitStructures(
  _ctx: SimCtx,
  _at: Vec,
  _radius: number,
  _damage: number,
  _dir?: Vec,
  _arc?: number,
): void {}

/**
 * Each tick, before the director: foes that lost the hero to foliage search
 * its last-seen point (`MonsterEntity.search`, `goal`), and give up. Stub: a no-op.
 */
export function terrainTick(_ctx: SimCtx): void {}
