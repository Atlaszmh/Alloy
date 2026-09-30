import type { ArpgWorld, HeroEntity, Push, PushKind, Vec } from '../types/arpg.js';
import type { SimCtx } from './combat.js';
import { clamp } from './geometry.js';
import { chargeCap } from './abilities/resolve.js';

/**
 * Motion and cancels for the hero's actions. Each push (a lunge, a form's
 * step-in, a blow's step or a form's recoil) adds a slice of its displacement
 * each tick, by its progress like the dodge's dash, so even a push shorter
 * than one tick covers its distance; one with a stop foe ends at that foe's
 * contact gap (see the weapon flow spec).
 */

/**
 * Start a push of `kind`: `distance` units along `dir` over `seconds`, after
 * `delay` seconds with no slice (a lunge's planted part); with `stopId`, it
 * stops at that foe's contact gap. Other pushes keep running.
 */
export function startPush(
  ctx: SimCtx,
  kind: PushKind,
  dir: Vec,
  distance: number,
  seconds: number,
  stopId: number | null = null,
  delay = 0,
): void {
  const start = ctx.world.t + delay;
  ctx.world.hero.pushes.push({
    kind,
    dx: dir.x * distance,
    dy: dir.y * distance,
    start,
    until: start + Math.max(1e-6, seconds),
    stopId,
    done: 0,
    movedX: 0,
    movedY: 0,
  });
}

/** End the hero's pushes of `kind`; the others keep running. */
export function endPushes(h: HeroEntity, kind: PushKind): void {
  h.pushes = h.pushes.filter((p) => p.kind !== kind);
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
 * Move the hero by push `p`'s slice up to progress `k`: less the part that
 * points against the steering `steer` (a unit vector; null when not steering),
 * clamped to the arena, and cut at its stop foe's contact gap. Returns whether
 * it runs on: it ends when its progress runs out, its foe is gone, or it
 * reaches the gap (at once if the hero is already inside it).
 */
function slice(ctx: SimCtx, p: Push, k: number, steer: Vec | null): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const foe = p.stopId === null ? null : world.monsters.find((m) => m.id === p.stopId && !m.dead);
  if (p.stopId !== null && !foe) return false;
  let dx = p.dx * (k - p.done);
  let dy = p.dy * (k - p.done);
  p.done = k;
  const against = steer ? dx * steer.x + dy * steer.y : 0;
  if (steer && against < 0) {
    dx -= against * steer.x;
    dy -= against * steer.y;
  }
  const x = clamp(h.x + dx, h.radius, world.width - h.radius);
  const y = clamp(h.y + dy, h.radius, world.height - h.radius);
  const c = foe
    ? contactAt(h.x, h.y, x, y, foe.x, foe.y, foe.radius + h.radius + bal.feel.contactGap)
    : 1;
  // Stop exactly at the contact gap, never inside it.
  p.movedX += (x - h.x) * c;
  p.movedY += (y - h.y) * c;
  h.x += (x - h.x) * c;
  h.y += (y - h.y) * c;
  return c >= 1 && k < 1;
}

/**
 * Carry every push one tick, in the order they began: each adds its slice
 * (none before its start: a lunge's planted part), less the part against the
 * steering `steer` (a unit vector, or null).
 */
export function pushesTick(ctx: SimCtx, steer: Vec | null): void {
  const { world } = ctx;
  const h = world.hero;
  h.pushes = h.pushes.filter((p) =>
    slice(ctx, p, Math.min(1, Math.max(0, (world.t - p.start) / (p.until - p.start))), steer),
  );
}

/**
 * Finish the hero's pushes of `kind` at once (a wind-up landing: its
 * step-in), unprojected, still cut at a stop foe's contact gap.
 */
export function finishPushes(ctx: SimCtx, kind: PushKind): void {
  const h = ctx.world.hero;
  for (const p of h.pushes) if (p.kind === kind) slice(ctx, p, 1, null);
  endPushes(h, kind);
}

/**
 * A basic swing in its startup strikes this tick. A press or a hold that would
 * start now waits a tick, so the blow lands first (see the chain feel spec).
 */
export function swingStrikes(h: HeroEntity, t: number): boolean {
  return !!h.swing && h.swing.held === null && t >= h.swing.strikeAt - 1e-9;
}

/** Drop a basic swing still in its startup (and its lunge): no blow, no string step, and the weapon is ready again. */
export function cancelSwing(ctx: SimCtx): void {
  const h = ctx.world.hero;
  if (!h.swing) return;
  h.swing = null;
  endPushes(h, 'lunge');
  h.nextAttackAt = ctx.world.t;
}

/** Drop an ability's wind-up: the mana stays spent, the move is ready again and its charge comes back. */
export function cancelWindup(h: HeroEntity, t: number): void {
  const w = h.windup;
  if (!w) return;
  h.cooldowns[w.slot][w.step] = t;
  h.charge[w.slot] = Math.min(chargeCap(h.chains[w.slot]), h.charge[w.slot] + w.chargePaid);
  h.windup = null;
}

/**
 * End the slot's beat now and drop its waiting press (a changed chain, a
 * respawn); its restart window counts from now at the latest.
 */
export function clearBeat(world: ArpgWorld, slot: number): void {
  const h = world.hero;
  h.beatUntil[slot] = Math.min(h.beatUntil[slot], world.t);
  h.comboAt[slot] = Math.min(h.comboAt[slot], world.t);
  world.queuedCasts = world.queuedCasts.filter((q) => q.cast.slot !== slot);
}

/** Drop a charging hold, unpaid, marking its slot so its release (the button let go) is swallowed. */
export function dropHold(world: ArpgWorld): void {
  const hold = world.hero.hold;
  if (!hold) return;
  world.holdDropped = hold.slot;
  world.hero.hold = null;
}
