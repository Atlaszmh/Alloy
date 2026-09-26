import type { AbilityCast } from '../../types/ability.js';
import type { Vec } from '../../types/arpg.js';
import type { SimCtx } from '../combat.js';
import { cancelSwing, pushTick, startPush } from '../action.js';
import { dirTo } from '../geometry.js';
import { executeForm } from './forms.js';
import { stepHeft } from './resolve.js';
import { aimPoint, nearestMonster } from './targeting.js';

/** Can this slot be used right now (ignoring targets)? For the HUD and bots. */
export function abilityReady(ctx: SimCtx, slot: number): boolean {
  const h = ctx.world.hero;
  const ab = h.abilities[slot];
  if (!ab || h.windup || ctx.world.t < h.cooldowns[slot]) return false;
  if (ab.build.payment === 'charge' && h.charge[slot] < ab.chargeNeed - 1e-9) return false;
  return h.mana >= ab.cost;
}

/** Fire the slot's form now at press-combo `step`, then its recoil and recovery. */
function fire(ctx: SimCtx, slot: number, aim: Vec | null, step: number): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const ab = h.abilities[slot];
  const res = executeForm(ctx, ab, aim, step);
  if (!res.ok) return false;
  h.comboStep[slot] = step;
  h.comboAt[slot] = world.t;
  ctx.events.push({
    kind: 'cast',
    slot,
    name: ab.name,
    form: ab.form.id,
    element: ab.element,
    x: h.x,
    y: h.y,
    tx: res.tx,
    ty: res.ty,
    heft: stepHeft(ab, step),
  });
  if (ab.motion < 0) {
    const d = dirTo(h.x, h.y, res.tx, res.ty);
    const mult = ab.combo[step % ab.combo.length];
    if (d.x !== 0 || d.y !== 0)
      startPush(ctx, { x: -d.x, y: -d.y }, -ab.motion * mult, bal.feel.recoilSeconds);
  }
  if (ab.recovery > 0) h.recoverUntil = world.t + ab.recovery;
  return true;
}

function pay(ctx: SimCtx, slot: number, from: number): void {
  const h = ctx.world.hero;
  const ab = h.abilities[slot];
  h.mana -= ab.cost;
  h.cooldowns[slot] = from + ab.cooldown;
  if (ab.build.payment === 'charge') h.charge[slot] = 0;
}

/**
 * Use an ability. Fails, costing nothing, while another is winding up, on
 * cooldown, uncharged, unaffordable (with a `noMana` event) or with nothing
 * to aim at. Otherwise it pays now, drops a basic swing still winding up,
 * and winds up for its conjure (stepping in, for forward forms) plus any
 * channel; the cooldown counts from the press plus the channel.
 */
export function castAbility(ctx: SimCtx, cast: AbilityCast): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const t = world.t;
  const slot = cast.slot;
  const ab = h.abilities[slot];
  if (!ab || h.windup || t < h.cooldowns[slot]) return false;
  if (ab.build.payment === 'charge' && h.charge[slot] < ab.chargeNeed - 1e-9) return false;
  if (h.mana < ab.cost) {
    ctx.events.push({ kind: 'noMana', slot });
    return false;
  }
  const aim = cast.aim ?? null;
  const at = aimPoint(ctx, ab, aim);
  if (!at) return false;

  // It goes ahead: a swing still winding up gives way first, so the step-in below survives.
  cancelSwing(ctx);
  h.push = null;
  h.recoverUntil = t;
  const step =
    t - h.comboAt[slot] <= bal.abilities.comboWindow
      ? (h.comboStep[slot] + 1) % ab.combo.length
      : 0;
  const chargePaid = ab.build.payment === 'charge' ? h.charge[slot] : 0;
  pay(ctx, slot, t + ab.channel);
  const dir = dirTo(h.x, h.y, at.x, at.y);
  if (dir.x !== 0 || dir.y !== 0) h.facing = dir;
  h.windup = {
    slot,
    aim,
    at,
    start: t,
    until: t + ab.castTime,
    step,
    conjureUntil: t + ab.conjure,
    chargePaid,
  };
  if (ab.motion > 0 && (dir.x !== 0 || dir.y !== 0)) {
    const stop = nearestMonster(ctx, at.x, at.y, 1.5);
    startPush(ctx, dir, ab.motion * ab.combo[step % ab.combo.length], ab.conjure, stop?.id ?? null);
  }
  ctx.events.push({ kind: 'windup', slot, until: h.windup.until, heft: stepHeft(ab, step) });
  return true;
}

/**
 * Land a finished wind-up at its press-time combo step. Auto-aim is chosen
 * again now; if nothing is left to aim at, it lands where the press aimed.
 */
export function castTick(ctx: SimCtx): void {
  const h = ctx.world.hero;
  if (!h.windup || ctx.world.t < h.windup.until - 1e-9) return;
  const { slot, aim, at, step } = h.windup;
  h.windup = null;
  // A step-in finishes before the blow lands, so it hits from where the step took the hero.
  pushTick(ctx, true);
  if (!fire(ctx, slot, aim, step)) fire(ctx, slot, at, step);
}
