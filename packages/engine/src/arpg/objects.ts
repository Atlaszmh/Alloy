import type { ArpgWorld, HazardEntity, PropEntity, Vec } from '../types/arpg.js';
import { killScrap, spawnDrop, type SimCtx } from './combat.js';
import { roomAt } from './fog.js';
import { angleBetween, dirTo, dist, distToSegment } from './geometry.js';
import { sees, snapToWalkable } from './grid.js';
import { rollMetal } from './material-drops.js';
import { standing } from './objects-base.js';

/**
 * The room's living things (see the room objects spec): props and hazards, on
 * `ArpgWorld.props` / `hazards`. The shape helpers are what each hit site tests
 * (an area's circle, a melee arc's cone, a beam's segment, a body's contact),
 * seen from the hit's origin as foes are; `hitObject` is a hit reaching one,
 * `objectsTick` the hazards' fuses and recharge, `objectsSeparate` their
 * bodies. Placing them and their footprints live in `objects-base.ts`
 * (re-exported here).
 */

/** A prop or a hazard. */
export type RoomObject = PropEntity | HazardEntity;

/** Whose hit reached an object: the hero's, a foe's, or a hazard's burst (a chain). */
export type ObjectHitSource = 'hero' | 'foe' | 'hazard';

export { footprint, footprints, placeObjects, standing } from './objects-base.js';

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
 * A hit reaching a prop or a hazard (see the room objects spec): a prop takes
 * one of its `life` hits and breaks at none. Whatever it is, the object stops
 * what hit it (a shot ends at it as at a wall); `source` is whose hit it was.
 */
export function hitObject(ctx: SimCtx, obj: RoomObject, _source: ObjectHitSource): boolean {
  if (obj.type === 'prop' && !obj.dead) {
    obj.life -= 1;
    if (obj.life <= 0) breakProp(ctx, obj);
  }
  return true;
}

/**
 * A prop breaks (`propBreak`): it stays on `world.props`, `dead` (drawn broken;
 * no longer a body or a footprint). At `terrain.propDrops.chance` it drops
 * scrap (a normal foe's kill scrap) or, at `material` of those, a bar of the
 * floor's metal, rolled and thrown on the world's own `propRng`, in the prop's
 * room.
 */
function breakProp(ctx: SimCtx, p: PropEntity): void {
  const { world, bal, registry } = ctx;
  p.dead = true;
  ctx.events.push({ kind: 'propBreak', id: p.id, prop: p.kind, x: p.x, y: p.y });
  const rng = world.propRng;
  const drops = bal.terrain.propDrops;
  if (rng.next() >= drops.chance) return;
  const bar = rng.next() < drops.material;
  const angle = rng.next() * Math.PI * 2;
  const r = 0.6 + rng.next() * 0.9;
  const at = snapToWalkable(world.map, p.x + Math.cos(angle) * r, p.y + Math.sin(angle) * r, 1);
  const from = { x: p.x, y: p.y, roomId: roomAt(world.map, p.x, p.y)?.id ?? null };
  if (bar) {
    const metal = rollMetal(registry, world.depth, rng);
    spawnDrop(ctx, 'material', from, at.x, at.y, { amount: 1, material: { kind: 'metal', metal } });
  } else spawnDrop(ctx, 'scrap', from, at.x, at.y, { amount: killScrap(ctx, 'normal') });
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
