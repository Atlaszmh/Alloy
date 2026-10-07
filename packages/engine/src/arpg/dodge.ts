import type { Vec } from '../types/arpg.js';
import type { BoonSum } from '../types/boon.js';
import type { DelveBalance } from '../types/delve.js';
import type { SimCtx } from './combat.js';
import { clampLen, dirTo } from './geometry.js';
import { moveCircle } from './grid.js';
import { nearestMonster } from './abilities/targeting.js';
import { cancelSwing, cancelWindup, dropHold } from './action.js';

/**
 * The dodge: a dash with i-frames, paid with charges that refill one at a
 * time. It bursts out fast and eases into a glide (`dodge.ease`), and the
 * steering turns it as it goes, at most `dodge.steer` radians a second, so a
 * dodge is an arc the player skates through the fight. A monster attack that
 * would have hit the hero early in the dodge is a perfect dodge: the charge
 * comes back and the next real hit is a riposte. Past `dodge.cancelAfter` a
 * ready press (an ability or another dodge) cuts the glide short.
 */

/** The hero's dodge charges: `dodge.charges` plus the boons' (the boons spec §2), at least 1. */
export function dodgeMax(bal: DelveBalance, boon: BoonSum): number {
  return Math.max(1, bal.dodge.charges + (boon.dodgeCharges ?? 0));
}

/** Seconds a dodge charge takes to come back: `dodge.recharge` × (1 − the boons'), at least half. */
export function dodgeRecharge(bal: DelveBalance, boon: BoonSum): number {
  return bal.dodge.recharge * Math.max(0.5, 1 - (boon.dodgeRecharge ?? 0));
}

/**
 * How far into a dodge an attack still makes it perfect: `perfectWindow` × (1 +
 * the boons'), never past the i-frames; with `perfectAlways`, the whole i-frames.
 */
function perfectWindow(bal: DelveBalance, boon: BoonSum): number {
  const { perfectWindow: w, iframes } = bal.dodge;
  return boon.perfectAlways ? iframes : Math.min(iframes, w * (1 + (boon.dodgeWindow ?? 0)));
}

export function isDashing(ctx: SimCtx): boolean {
  const d = ctx.world.hero.dodge;
  return !!d && ctx.world.t < d.until;
}

/** Start a dodge along `move` (or away from the nearest foe, or along the facing). */
export function tryDodge(ctx: SimCtx, move: Vec): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const t = world.t;
  if (world.heroDead || h.dodgeCharges < 1 || isDashing(ctx)) return false;

  const v = clampLen(move);
  const len = Math.hypot(v.x, v.y);
  let dir: Vec;
  if (len > 0.05) dir = { x: v.x / len, y: v.y / len };
  else {
    const foe = nearestMonster(ctx, h.x, h.y, 8);
    dir = foe ? dirTo(foe.x, foe.y, h.x, h.y) : { ...h.facing };
    if (dir.x === 0 && dir.y === 0) dir = { x: 0, y: -1 };
  }

  // A dodge drops a swing still winding up, and any push or recovery.
  cancelSwing(ctx);
  h.pushes = [];
  h.recoverUntil = t;
  // Bailing out of a wind-up keeps the mana spent but frees the ability again (and refunds charge);
  // a hold is dropped unpaid.
  cancelWindup(h, t);
  dropHold(world);
  h.dodgeCharges--;
  if (h.dodgeRechargeAt === 0) h.dodgeRechargeAt = t + dodgeRecharge(bal, h.boon);
  h.dodge = {
    dir,
    fromX: h.x,
    fromY: h.y,
    start: t,
    until: t + bal.dodge.duration,
    perfect: false,
  };
  h.invulnUntil = Math.max(h.invulnUntil, t + bal.dodge.iframes);
  // Free Cast (a boon): the next ability paid within its seconds is free.
  if (h.boon.freeCast) h.freeCastUntil = t + h.boon.freeCast.seconds;
  h.facing = dir;
  ctx.events.push({ kind: 'dodge', fromX: h.x, fromY: h.y, dirX: dir.x, dirY: dir.y });
  return true;
}

/**
 * How far along its distance a dodge is at `u`, its share of the duration:
 * eased out (`ease` 0 is a steady dash), so it bursts out and glides to a stop.
 */
export function dashProgress(ease: number, u: number): number {
  const v = Math.min(1, Math.max(0, u));
  return v + ease * v * (1 - v);
}

/** `dir` turned toward `want` by at most `max` radians (exactly opposite: turning left). */
function steerToward(dir: Vec, want: Vec, max: number): Vec {
  const cross = dir.x * want.y - dir.y * want.x;
  const dot = dir.x * want.x + dir.y * want.y;
  const a = Math.max(-max, Math.min(max, Math.atan2(cross, dot)));
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: dir.x * c - dir.y * s, y: dir.x * s + dir.y * c };
}

/**
 * Refill charges and carry the dash: each tick its slice of the distance
 * (eased, see `dashProgress`) along its heading, which the steering turns by
 * up to `steer` radians a second (scaled by the stick's tilt), so the dash
 * curves. Swept from where the hero stands (see the floor maps spec): a wall
 * takes the part of a slice against it, and the dash slides along it.
 */
export function dodgeTick(ctx: SimCtx, dt: number, move: Vec = { x: 0, y: 0 }): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const t = world.t;
  if (h.dodgeRechargeAt > 0 && t >= h.dodgeRechargeAt) {
    const max = dodgeMax(bal, h.boon);
    h.dodgeCharges = Math.min(max, h.dodgeCharges + 1);
    h.dodgeRechargeAt = h.dodgeCharges < max ? h.dodgeRechargeAt + dodgeRecharge(bal, h.boon) : 0;
  }
  const d = h.dodge;
  if (!d || t - dt >= d.until) return;
  const { distance, duration, ease, steer } = bal.dodge;
  const at = (s: number) => dashProgress(ease, (s - d.start) / duration) * distance;
  const v = clampLen(move);
  const tilt = Math.hypot(v.x, v.y);
  if (tilt > 0.05) {
    d.dir = steerToward(d.dir, { x: v.x / tilt, y: v.y / tilt }, steer * tilt * dt);
    h.facing = d.dir;
  }
  // A cut-short glide stops at its cut.
  const slice = at(Math.min(t, d.until)) - at(t - dt);
  Object.assign(h, moveCircle(world.map, h, h.radius, d.dir.x * slice, d.dir.y * slice));
}

/**
 * A ready press waits past the dodge's commit (`dodge.cancelAfter`): the
 * glide ends now, so the press fires this tick. True when it cut.
 */
export function cutGlide(ctx: SimCtx): boolean {
  const { world, bal } = ctx;
  const d = world.hero.dodge;
  if (!d || !isDashing(ctx) || world.t < d.start + bal.dodge.cancelAfter) return false;
  d.until = world.t;
  return true;
}

/** Where the dodge began, while its perfect window is open and unused; else null. */
export function perfectOrigin(ctx: SimCtx): Vec | null {
  const d = ctx.world.hero.dodge;
  if (!d || d.perfect || ctx.world.t - d.start > perfectWindow(ctx.bal, ctx.world.hero.boon))
    return null;
  return { x: d.fromX, y: d.fromY };
}

/** One dodge charge back (a perfect dodge, Lightning Rod); full charges stop the recharge. */
export function refundDodgeCharge(ctx: SimCtx): void {
  const h = ctx.world.hero;
  const max = dodgeMax(ctx.bal, h.boon);
  h.dodgeCharges = Math.min(max, h.dodgeCharges + 1);
  if (h.dodgeCharges >= max) h.dodgeRechargeAt = 0;
}

/** An attack would have landed early in the dodge: a perfect dodge (once per dodge). */
export function notePerfect(ctx: SimCtx): void {
  if (!perfectOrigin(ctx)) return;
  const { world, bal } = ctx;
  const h = world.hero;
  h.dodge!.perfect = true;
  // Chained perfects while the riposte is armed don't refund, so dodges aren't free in a crowd.
  if (world.t >= h.riposteUntil) refundDodgeCharge(ctx);
  h.riposteUntil = world.t + bal.dodge.riposteWindow;
  ctx.events.push({ kind: 'perfectDodge', x: h.x, y: h.y });
  if (!world.sandbox) world.pending.questEvents.push({ type: 'perfectDodge' });
}
