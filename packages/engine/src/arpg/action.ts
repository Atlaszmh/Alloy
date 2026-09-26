import type { Vec } from '../types/arpg.js';
import type { SimCtx } from './combat.js';
import { clamp } from './geometry.js';

/**
 * Motion and cancels for the hero's actions. A push (a lunge, an ability's
 * step-in or a recoil) is placed by progress like the dodge's dash, so even
 * a push shorter than one tick covers its distance, and a lunge stops at
 * the edge of the foe it lunges at.
 */

/** Move the hero `distance` units along `dir` over `seconds`; with `stopId`, stop at that foe. */
export function startPush(
  ctx: SimCtx,
  dir: Vec,
  distance: number,
  seconds: number,
  stopId: number | null = null,
): void {
  const h = ctx.world.hero;
  const t = ctx.world.t;
  h.push = {
    fromX: h.x,
    fromY: h.y,
    dx: dir.x * distance,
    dy: dir.y * distance,
    start: t,
    until: t + Math.max(1e-6, seconds),
    stopId,
  };
}

/**
 * How far (0..1) along the move from (ax, ay) to (bx, by) the hero comes
 * within `reach` of the point (fx, fy); 1 when it never does.
 */
function contactAt(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  fx: number,
  fy: number,
  reach: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const ox = ax - fx;
  const oy = ay - fy;
  const a = dx * dx + dy * dy;
  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - reach * reach;
  if (c <= 0) return 0;
  const disc = b * b - 4 * a * c;
  if (a < 1e-12 || disc < 0) return 1;
  const k = (-b - Math.sqrt(disc)) / (2 * a);
  return k >= 0 && k <= 1 ? k : 1;
}

/**
 * Carry the push; true while it moves (or holds) the hero this step.
 * `finish` jumps to its end (a wind-up landing finishes its step-in first).
 */
export function pushTick(ctx: SimCtx, finish = false): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const p = h.push;
  if (!p) return false;
  const foe = p.stopId === null ? null : world.monsters.find((m) => m.id === p.stopId && !m.dead);
  // A lunge whose foe is gone ends at once.
  if (p.stopId !== null && !foe) {
    h.push = null;
    return false;
  }
  const k = finish ? 1 : Math.min(1, (world.t - p.start) / (p.until - p.start));
  const x = clamp(p.fromX + p.dx * k, h.radius, world.width - h.radius);
  const y = clamp(p.fromY + p.dy * k, h.radius, world.height - h.radius);
  const c = foe
    ? contactAt(h.x, h.y, x, y, foe.x, foe.y, foe.radius + h.radius + bal.feel.contactGap)
    : 1;
  // Stop exactly at the contact gap, never inside it.
  h.x += (x - h.x) * c;
  h.y += (y - h.y) * c;
  if (c < 1 || k >= 1) h.push = null;
  return true;
}

/** Drop a basic swing still in its startup: no blow, no string step, and the weapon is ready again. */
export function cancelSwing(ctx: SimCtx): void {
  const h = ctx.world.hero;
  if (!h.swing) return;
  h.swing = null;
  h.push = null;
  h.nextAttackAt = ctx.world.t;
}
