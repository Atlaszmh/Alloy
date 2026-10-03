import type { Vec } from '../types/arpg.js';
import type { SimCtx } from './combat.js';
import { clampLen, dirTo } from './geometry.js';
import { moveCircle } from './grid.js';
import { nearestMonster } from './abilities/targeting.js';
import { cancelSwing, cancelWindup, dropHold } from './action.js';

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
  h.pushes = [];
  h.recoverUntil = t;
  // Bailing out of a wind-up keeps the mana spent but frees the ability again (and refunds charge);
  // a hold is dropped unpaid.
  cancelWindup(h, t);
  dropHold(world);
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

/**
 * Refill charges and carry the dash: each tick on toward where its progress puts
 * it (so it always covers the full distance), swept from where the hero stands
 * (see the floor maps spec). Once a wall has held it back, each tick moves only
 * its own slice, so it never lurches on past a corner.
 */
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
  const at = (s: number) =>
    Math.min(1, Math.max(0, (s - d.start) / bal.dodge.duration)) * bal.dodge.distance;
  const k = at(t);
  const slice = k - at(t - dt);
  const tx = d.fromX + d.dir.x * k;
  const ty = d.fromY + d.dir.y * k;
  const late = Math.hypot(tx - h.x, ty - h.y) > slice + 1e-9;
  const dx = late ? d.dir.x * slice : tx - h.x;
  const dy = late ? d.dir.y * slice : ty - h.y;
  Object.assign(h, moveCircle(world.map, h, h.radius, dx, dy));
}

/** Where the dodge began, while its perfect window is open and unused; else null. */
export function perfectOrigin(ctx: SimCtx): Vec | null {
  const d = ctx.world.hero.dodge;
  if (!d || d.perfect || ctx.world.t - d.start > ctx.bal.dodge.perfectWindow) return null;
  return { x: d.fromX, y: d.fromY };
}

/** One dodge charge back (a perfect dodge, Lightning Rod); full charges stop the recharge. */
export function refundDodgeCharge(ctx: SimCtx): void {
  const h = ctx.world.hero;
  const max = ctx.bal.dodge.charges;
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
