import type { ArpgWorld, HazardEntity, PropEntity, Vec } from '../types/arpg.js';
import { BASIC_STATUS, hitMonster, hurtHero, killScrap, spawnDrop, type SimCtx } from './combat.js';
import { isDashing } from './dodge.js';
import { roomAt } from './fog.js';
import { angleBetween, dirTo, dist, distToSegment } from './geometry.js';
import { sees, shift, snapToWalkable } from './grid.js';
import { rollMetal } from './material-drops.js';
import { standing } from './objects-base.js';
import { hitStructures } from './terrain.js';
import { depthGrowth } from './world.js';

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
 * one of its `life` hits and breaks at none; a ready hazard is set off (a
 * primed or dormant one shrugs it off). Whatever it is, the object stops what
 * hit it (a shot ends at it as at a wall); `source` is whose hit it was.
 */
export function hitObject(ctx: SimCtx, obj: RoomObject, _source: ObjectHitSource): boolean {
  if (obj.type === 'hazard') {
    if (obj.state === 'ready') prime(ctx, obj);
  } else if (!obj.dead) {
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

/** A ready hazard set off: it bursts `terrain.fuse` from now (`hazardPrime`, its telegraph). */
function prime(ctx: SimCtx, hz: HazardEntity): void {
  const fuse = ctx.bal.terrain.fuse;
  hz.state = 'primed';
  hz.until = ctx.world.t + fuse;
  const { id, kind: hazard, element, x, y, burst: radius } = hz;
  ctx.events.push({ kind: 'hazardPrime', id, hazard, element, x, y, radius, fuse });
}

/**
 * A primed hazard bursts (`hazardBurst`) on everyone within its `burst` that it
 * sees, for `terrain.hazardDamage` × the depth's foe damage (`depthGrowth`):
 * the hero takes the damage only (`noPerfect`: a dodge's i-frames avoid it, but
 * it is never a perfect dodge); each foe takes it as nobody's hit (source
 * `hazard`: no crit, none of the hero's element power) with its element's
 * stacks as a heavy blow brings them, reactions as usual. It wears crumbling
 * cover, sets off the hazards and breaks the props it reaches (a chain), and
 * is dormant for `terrain.recharge`.
 */
function burst(ctx: SimCtx, hz: HazardEntity): void {
  const { world, bal, registry } = ctx;
  const g = depthGrowth(registry, world.depth);
  const damage = bal.terrain.hazardDamage * bal.monster.baseDmg * g.dmg * g.ramp;
  const { id, kind: hazard, element, x, y, burst: radius } = hz;
  hz.state = 'dormant';
  hz.until = world.t + bal.terrain.recharge;
  ctx.events.push({ kind: 'hazardBurst', id, hazard, element, x, y, radius });
  const reaches = (b: { x: number; y: number; radius: number }) =>
    dist(x, y, b.x, b.y) <= radius + b.radius && sees(world.map, hz, b);
  if (reaches(world.hero)) hurtHero(ctx, damage, element, null, { noPerfect: true });
  for (const m of world.monsters)
    if (!m.dead && reaches(m))
      hitMonster(ctx, m, damage, element, {
        source: 'hazard',
        applies: [BASIC_STATUS[element]],
        stacks: bal.stacks.basicByKind.heavy,
        rattles: element === 'earth',
      });
  hitStructures(ctx, hz, radius, damage);
  for (const o of objectsIn(world, hz, radius)) if (o !== hz) hitObject(ctx, o, 'hazard');
}

/**
 * Each tick, after the zones: a primed hazard's fuse ends in its burst, and a
 * dormant one is ready again at `until`.
 */
export function objectsTick(ctx: SimCtx): void {
  const { world } = ctx;
  for (const hz of world.hazards)
    if (world.t >= hz.until) {
      if (hz.state === 'primed') burst(ctx, hz);
      else if (hz.state === 'dormant') hz.state = 'ready';
    }
}

/**
 * At the end of `separate`, before the walls' push-out: props and hazards are
 * fixed circles, so a body overlapping one is pushed straight out of it, as
 * from a fixed dummy (the object never budges); a dashing hero and a charging
 * foe pass through.
 */
export function objectsSeparate(ctx: SimCtx): void {
  const { world } = ctx;
  const objects = standing(world);
  if (objects.length === 0) return;
  const bodies: { x: number; y: number; radius: number }[] = world.monsters.filter(
    (m) => !m.dead && m.chargeUntil <= world.t,
  );
  if (!isDashing(ctx)) bodies.push(world.hero);
  for (const b of bodies)
    for (const o of objects) {
      const d = dist(o.x, o.y, b.x, b.y);
      const overlap = o.radius + b.radius - d;
      if (overlap <= 0) continue;
      const n = d > 1e-6 ? { x: (b.x - o.x) / d, y: (b.y - o.y) / d } : { x: 0, y: 1 };
      shift(world.map, b, b.radius, n.x * overlap, n.y * overlap);
    }
}
