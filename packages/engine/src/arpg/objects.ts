import type { ArpgWorld, HazardEntity, PropEntity, Vec } from '../types/arpg.js';
import type { SimCtx } from './combat.js';
import { angleBetween, clamp, dirTo, dist, distToSegment } from './geometry.js';
import { sees } from './grid.js';

/**
 * The room's living things (see the room objects spec): props and hazards, on
 * `ArpgWorld.props` / `hazards`. The shape helpers are what each hit site tests
 * (an area's circle, a melee arc's cone, a beam's segment, a body's contact),
 * seen from the hit's origin as foes are; `footprint` is what the furnisher,
 * the flow fields, spawns and drops treat as blocked. `hitObject` and the ticks
 * are B3's.
 */

/** A prop or a hazard. */
export type RoomObject = PropEntity | HazardEntity;

/** Whose hit reached an object: the hero's, a foe's, or a hazard's burst (a chain). */
export type ObjectHitSource = 'hero' | 'foe' | 'hazard';

/** A circle's footprint: every cell (its index, `y × width + x`) it overlaps, on the map. */
export function footprint(
  map: { width: number; height: number },
  c: { x: number; y: number; radius: number },
): number[] {
  const cells: number[] = [];
  const y1 = Math.min(map.height - 1, Math.floor(c.y + c.radius));
  const x1 = Math.min(map.width - 1, Math.floor(c.x + c.radius));
  for (let y = Math.max(0, Math.floor(c.y - c.radius)); y <= y1; y++)
    for (let x = Math.max(0, Math.floor(c.x - c.radius)); x <= x1; x++) {
      const dx = c.x - clamp(c.x, x, x + 1);
      const dy = c.y - clamp(c.y, y, y + 1);
      if (dx * dx + dy * dy < c.radius * c.radius) cells.push(y * map.width + x);
    }
  return cells;
}

/** The unbroken props and every hazard (a dormant one is still a body). */
export function standing(world: ArpgWorld): RoomObject[] {
  return [...world.props.filter((p) => !p.dead), ...world.hazards];
}

/** Every standing object's footprint, as one set of cells. */
export function footprints(world: ArpgWorld): Set<number> {
  const cells = new Set<number>();
  for (const o of standing(world)) for (const c of footprint(world.map, o)) cells.add(c);
  return cells;
}

/**
 * What an area round `at` reaches (to an object's edge): the circle of
 * `radius`, or its cone along `dir` within `arc` degrees; only what `at` sees.
 */
export function objectsIn(
  world: ArpgWorld,
  at: Vec,
  radius: number,
  dir?: Vec,
  arc = 360,
): RoomObject[] {
  const half = (arc * Math.PI) / 360;
  return standing(world).filter(
    (o) =>
      dist(at.x, at.y, o.x, o.y) - o.radius <= radius &&
      (arc >= 360 || !dir || angleBetween(dir, dirTo(at.x, at.y, o.x, o.y)) <= half) &&
      sees(world.map, at, o),
  );
}

/** What a beam from `a` to `b`, `width` either side, reaches: what `a` sees. */
export function objectsOnBeam(world: ArpgWorld, a: Vec, b: Vec, width: number): RoomObject[] {
  return standing(world).filter(
    (o) => distToSegment(o.x, o.y, a.x, a.y, b.x, b.y) <= width + o.radius && sees(world.map, a, o),
  );
}

/** What a body touches: a shot's contact, a charger's dash. */
export function objectsTouching(
  world: ArpgWorld,
  c: { x: number; y: number; radius: number },
): RoomObject[] {
  return standing(world).filter((o) => dist(c.x, c.y, o.x, o.y) <= c.radius + o.radius);
}

/**
 * A hit reaching a prop or a hazard (B3; see the room objects spec): a prop
 * breaks, a ready hazard primes. Returns whether the object stops what hit it
 * (a shot ends at it as at a wall). Stub: nothing happens; false.
 */
export function hitObject(_ctx: SimCtx, _obj: RoomObject, _source: ObjectHitSource): boolean {
  return false;
}

/**
 * Each tick, after the zones (B3): fuses burn down and burst, dormant hazards
 * recharge, broken props go. Stub: a no-op.
 */
export function objectsTick(_ctx: SimCtx): void {}

/**
 * At the end of `separate`, before the walls' push-out (B3): bodies are pushed
 * out of props and hazards as from a fixed dummy. Stub: a no-op.
 */
export function objectsSeparate(_ctx: SimCtx): void {}
