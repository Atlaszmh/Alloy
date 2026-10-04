import type { DataRegistry } from '../data/registry.js';
import type { ArpgWorld, MonsterEntity, Vec } from '../types/arpg.js';
import { CELL, LOOK_IDS, type FloorMap, type Structure } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';
import { angleBetween, clamp } from './geometry.js';
import { bindTerrain, groundAt, sees, solid } from './grid.js';
import { depthGrowth } from './world.js';

/**
 * Terrain in a fight (B2; see the room objects spec's "Objects in a fight"):
 * slow ground, foliage's lost sight and search, crumbling structures and wall
 * slams. Each hook is called from its place in the sim; until B2 each is inert.
 * Foliage's sight rules are `perceives` (`grid.ts`).
 */

/**
 * How fast a body moves over the ground under it (`groundAt`): `terrain.slowMult`
 * on slow ground (`bossSlowMult` for a boss), else 1. The hero's walk and a
 * foe's walk ask it, and the hero's pushes (`action.ts`, through `groundAt`);
 * the dodge, knockback and a charger's dash never do.
 */
export function groundSpeed(world: ArpgWorld, body: Vec, boss = false): number {
  return groundAt(world.map, body, boss);
}

/**
 * A knocked-back foe's move this tick: it stood at `from` and its knockback
 * asked for `want`. Where a wall or cover stopped it short it is slammed, once
 * a knockback (`terrain.slamDamage` × `MonsterEntity.kbHit`, `slamStagger`).
 * Stub: a no-op.
 */
export function wallSlam(_ctx: SimCtx, _m: MonsterEntity, _from: Vec, _want: Vec): void {}

/**
 * A crumbling structure's life (see the room objects spec): `terrain.structureLife`
 * a cell × the depth's foe life growth (`depthGrowth`'s `hp × ramp`). The
 * furnisher gives each structure it places this `life` and `maxLife`.
 */
export function structureLifeAt(registry: DataRegistry, depth: number, cells: number): number {
  const g = depthGrowth(registry, depth);
  return registry.getDelveBalance().terrain.structureLife * cells * g.hp * g.ramp;
}

/**
 * A hit that wears crumbling cover: an ability's impact or a hazard's burst
 * (the circle of `radius` round `at`), or a heavy or hold blow (its cone along
 * `dir`, `arc` degrees), for `damage`. It wears each structure once where its
 * area reaches the structure's face (a cell of it beside a walkable cell `at`
 * sees); at 0 life the structure crumbles (`crumble`). A no-op on the open room.
 */
export function hitStructures(
  ctx: SimCtx,
  at: Vec,
  radius: number,
  damage: number,
  dir?: Vec,
  arc = 360,
): void {
  const { map } = ctx.world;
  if (map.open) return;
  const half = (arc * Math.PI) / 360;
  for (const s of map.structures) {
    if (s.life <= 0) continue;
    if (!s.cells.some((c) => reaches(at, radius, c, dir, half) && face(map, at, c))) continue;
    s.life -= damage;
    if (s.life <= 0) crumble(ctx, s);
  }
}

/**
 * Whether an area reaches cell `c`'s square: the circle of `radius` round
 * `at`, or (with `dir`) its cone, `half` radians either side of `dir`.
 */
function reaches(at: Vec, radius: number, c: Vec, dir: Vec | undefined, half: number): boolean {
  const to = { x: clamp(at.x, c.x, c.x + 1) - at.x, y: clamp(at.y, c.y, c.y + 1) - at.y };
  if (Math.hypot(to.x, to.y) > radius) return false;
  return !dir || half >= Math.PI || angleBetween(dir, to) <= half;
}

/** The four sides of a cell. */
const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Whether cell `c` is a face for a hit from `at`: a walkable cell beside it that `at` sees. */
function face(map: FloorMap, at: Vec, c: Vec): boolean {
  return SIDES.some(
    ([dx, dy]) =>
      !solid(map, c.x + dx, c.y + dy) && sees(map, at, { x: c.x + dx + 0.5, y: c.y + dy + 0.5 }),
  );
}

/**
 * A structure at 0 life crumbles: its cells turn to slow ground drawn as
 * rubble, a `crumble` event, the map's `version` bumped (the fog and the bot
 * follow it; sight reads the cells) and the flow fields rebuilt next tick.
 */
function crumble(ctx: SimCtx, s: Structure): void {
  const { world } = ctx;
  const { map } = world;
  const rubble = LOOK_IDS.indexOf('rubble');
  for (const c of s.cells) {
    map.cells[c.y * map.width + c.x] = CELL.slow;
    map.look[c.y * map.width + c.x] = rubble;
  }
  s.life = 0;
  map.version++;
  world.flow.nextAt = world.t;
  ctx.events.push({ kind: 'crumble', structure: s.id, cells: s.cells.map((c) => ({ ...c })) });
}

/**
 * Each tick, before the director: binds `delve.terrain` to the floor's map
 * (`bindTerrain`: foliage's sight and slow ground). Foes that lost the hero to
 * foliage search its last-seen point (`MonsterEntity.search`, `goal`), and
 * give up. A no-op on the open room.
 */
export function terrainTick(ctx: SimCtx): void {
  const { world, bal } = ctx;
  if (world.map.open) return;
  bindTerrain(world.map, bal.terrain);
}
