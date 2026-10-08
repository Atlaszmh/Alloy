import type { ResolvedAbility } from '../../types/ability.js';
import type { MonsterEntity, Projectile, Vec } from '../../types/arpg.js';
import type { SimCtx } from '../combat.js';
import { dirTo, dist } from '../geometry.js';
import { clipSight, perceives, sees, snapToWalkable } from '../grid.js';
import { objectsOnBeam } from '../objects-base.js';

export function alive(ctx: SimCtx): MonsterEntity[] {
  return ctx.world.monsters.filter((m) => !m.dead);
}

/**
 * Nearest living monster whose edge is within `range` of (x, y), and that (x, y) perceives;
 * with `shot` (a shot's half width), one no standing prop or hazard hides from (x, y) along
 * the shot's way, so a hazard is no sink for auto-aimed shots.
 */
export function nearestMonster(
  ctx: SimCtx,
  x: number,
  y: number,
  range: number,
  exclude?: Set<number>,
  shot?: number,
): MonsterEntity | null {
  let best: MonsterEntity | null = null;
  let bestD = Infinity;
  for (const m of ctx.world.monsters) {
    if (m.dead || exclude?.has(m.id)) continue;
    const d = dist(x, y, m.x, m.y) - m.radius;
    if (
      d <= range &&
      d < bestD &&
      perceives(ctx.world.map, { x, y }, m) &&
      (shot === undefined || objectsOnBeam(ctx.world, { x, y }, m, shot).length === 0)
    ) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

/** The in-range monster the hero perceives whose surroundings hold the most foes (for placed abilities). */
export function bestCluster(ctx: SimCtx, range: number, radius: number): MonsterEntity | null {
  const h = ctx.world.hero;
  const candidates = alive(ctx).filter(
    (m) => dist(h.x, h.y, m.x, m.y) - m.radius <= range && perceives(ctx.world.map, h, m),
  );
  let best: MonsterEntity | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    let score = 0;
    for (const o of candidates)
      if (dist(c.x, c.y, o.x, o.y) <= radius + o.radius) score += o.kind === 'normal' ? 1 : 2;
    score -= dist(h.x, h.y, c.x, c.y) * 0.01;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

export function spawnProjectile(
  ctx: SimCtx,
  p: Omit<Projectile, 'id' | 'hitIds' | 'traveled' | 'dead' | 'pierceLeft'> & {
    /** Foes it may pass (default: all when `pierce`, else none). */
    pierceLeft?: number;
    /** Foes it never hits (a Split shard skips those its impact hit). */
    hitIds?: number[];
  },
): Projectile {
  const proj: Projectile = {
    ...p,
    pierceLeft: p.pierceLeft ?? (p.pierce ? Infinity : 0),
    id: ctx.world.nextId++,
    hitIds: p.hitIds ? [...p.hitIds] : [],
    traveled: 0,
    dead: false,
  };
  ctx.world.projectiles.push(proj);
  return proj;
}

/**
 * Where a shot leaves the hero: `out` along `d`, or the hero's own place when
 * that point is in a wall or out of its sight (see the floor maps spec).
 */
export function muzzle(ctx: SimCtx, d: Vec, out: number): Vec {
  const h = ctx.world.hero;
  const p = { x: h.x + d.x * out, y: h.y + d.y * out };
  return sees(ctx.world.map, h, p) ? p : { x: h.x, y: h.y };
}
/** The half width auto-aim keeps clear of props and hazards for a shot (a basic shot's radius). */
export const SHOT = 0.3;
/** Forms fired along a way from the hero (the rest are placed, self-centred or Blink). */
export const DIRECTIONAL = new Set(['bolt', 'volley', 'lance', 'strike']);
const PLACED = new Set(['burst', 'barrage', 'maelstrom', 'onslaught']);

/**
 * Where an ability goes. An explicit aim is clamped to range and to the
 * hero's sight (a placed form can't land in an unseen room); otherwise
 * directional forms take the nearest foe, placed forms the densest cluster,
 * Blink runs from the nearest foe, and self-centred forms need nothing. With
 * none in reach, a directional or placed form goes toward the nearest foe in
 * sight (`ai.sightRadius`), else along the hero's facing, so it never fizzles
 * (without `fallback`, null instead: a hold's release keeps its own aim first).
 */
export function aimPoint(
  ctx: SimCtx,
  ab: ResolvedAbility,
  aim: Vec | null,
  fallback = true,
): Vec | null {
  const { world } = ctx;
  const h = world.hero;
  const form = ab.form.id;
  if (aim) {
    const d = dist(h.x, h.y, aim.x, aim.y);
    const reach = ab.range || d;
    const k = d > reach ? reach / d : 1;
    const p = snapToWalkable(world.map, h.x + (aim.x - h.x) * k, h.y + (aim.y - h.y) * k);
    return clipSight(world.map, h, p);
  }
  if (DIRECTIONAL.has(form) || PLACED.has(form)) {
    const shot = form === 'bolt' || form === 'volley' ? SHOT : undefined;
    const m = DIRECTIONAL.has(form)
      ? nearestMonster(ctx, h.x, h.y, ab.range + 1, undefined, shot)
      : bestCluster(ctx, ab.range, Math.max(ab.radius, 1));
    if (m) return { x: m.x, y: m.y };
    if (!fallback) return null;
    // Nothing in reach: toward the nearest foe in sight, else along the facing (clamped as an aim).
    const far = nearestMonster(ctx, h.x, h.y, ctx.bal.ai.sightRadius);
    const reach = Math.max(ab.range, 1);
    return aimPoint(
      ctx,
      ab,
      far ? { x: far.x, y: far.y } : { x: h.x + h.facing.x * reach, y: h.y + h.facing.y * reach },
    );
  }
  if (form === 'blink') {
    const m = nearestMonster(ctx, h.x, h.y, 8);
    const dir = m ? dirTo(m.x, m.y, h.x, h.y) : h.facing;
    return { x: h.x + dir.x * ab.range, y: h.y + dir.y * ab.range };
  }
  return { x: h.x, y: h.y };
}
