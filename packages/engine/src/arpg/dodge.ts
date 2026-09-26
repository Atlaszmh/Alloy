import type { Vec } from '../types/arpg.js';
import type { SimCtx } from './combat.js';
import { clamp, clampLen, dirTo } from './geometry.js';
import { nearestMonster } from './abilities/targeting.js';
import { cancelSwing } from './action.js';

/**
 * The dodge: a short dash with i-frames, paid with charges that refill one at
 * a time. A monster attack that would have hit the hero early in the dodge is
 * a perfect dodge: the charge comes back and the next real hit is a riposte.
 */

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
  h.push = null;
  h.recoverUntil = t;
  // Bailing out of a wind-up keeps the mana spent but frees the ability again (and refunds charge).
  if (h.windup) {
    h.cooldowns[h.windup.slot] = t;
    const s = h.windup.slot;
    h.charge[s] = Math.min(h.abilities[s].chargeNeed, h.charge[s] + h.windup.chargePaid);
    h.windup = null;
  }
  h.dodgeCharges--;
  if (h.dodgeRechargeAt === 0) h.dodgeRechargeAt = t + bal.dodge.recharge;
  h.dodge = {
    dir,
    fromX: h.x,
    fromY: h.y,
    start: t,
    until: t + bal.dodge.duration,
    perfect: false,
  };
  h.invulnUntil = Math.max(h.invulnUntil, t + bal.dodge.iframes);
  h.facing = dir;
  ctx.events.push({ kind: 'dodge', fromX: h.x, fromY: h.y, dirX: dir.x, dirY: dir.y });
  return true;
}

/** Refill charges and carry the dash (placed by progress, so it always covers the full distance). */
export function dodgeTick(ctx: SimCtx, dt: number): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const t = world.t;
  if (h.dodgeRechargeAt > 0 && t >= h.dodgeRechargeAt) {
    h.dodgeCharges = Math.min(bal.dodge.charges, h.dodgeCharges + 1);
    h.dodgeRechargeAt =
      h.dodgeCharges < bal.dodge.charges ? h.dodgeRechargeAt + bal.dodge.recharge : 0;
  }
  const d = h.dodge;
  if (!d || t - dt >= d.until) return;
  const k = Math.min(1, (t - d.start) / bal.dodge.duration) * bal.dodge.distance;
  h.x = clamp(d.fromX + d.dir.x * k, h.radius, world.width - h.radius);
  h.y = clamp(d.fromY + d.dir.y * k, h.radius, world.height - h.radius);
}

/** Where the dodge began, while its perfect window is open and unused; else null. */
export function perfectOrigin(ctx: SimCtx): Vec | null {
  const d = ctx.world.hero.dodge;
  if (!d || d.perfect || ctx.world.t - d.start > ctx.bal.dodge.perfectWindow) return null;
  return { x: d.fromX, y: d.fromY };
}

/** An attack would have landed early in the dodge: a perfect dodge (once per dodge). */
export function notePerfect(ctx: SimCtx): void {
  if (!perfectOrigin(ctx)) return;
  const { world, bal } = ctx;
  const h = world.hero;
  h.dodge!.perfect = true;
  // Chained perfects while the riposte is armed don't refund, so dodges aren't free in a crowd.
  if (world.t >= h.riposteUntil) h.dodgeCharges = Math.min(bal.dodge.charges, h.dodgeCharges + 1);
  if (h.dodgeCharges >= bal.dodge.charges) h.dodgeRechargeAt = 0;
  h.riposteUntil = world.t + bal.dodge.riposteWindow;
  ctx.events.push({ kind: 'perfectDodge', x: h.x, y: h.y });
}
