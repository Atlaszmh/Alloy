import type { AbilityCast } from '../../types/ability.js';
import type { Vec } from '../../types/arpg.js';
import type { SimCtx } from '../combat.js';
import { executeForm } from './forms.js';
import { aimPoint } from './targeting.js';

/** Can this slot be used right now (ignoring targets)? For the HUD and bots. */
export function abilityReady(ctx: SimCtx, slot: number): boolean {
  const h = ctx.world.hero;
  const ab = h.abilities[slot];
  if (!ab || h.windup || ctx.world.t < h.cooldowns[slot]) return false;
  if (ab.build.payment === 'charge' && h.charge[slot] < ab.chargeNeed - 1e-9) return false;
  return h.mana >= ab.cost;
}

/** Fire the slot's form now, stepping its combo. */
function fire(ctx: SimCtx, slot: number, aim: Vec | null): boolean {
  const { world } = ctx;
  const h = world.hero;
  const ab = h.abilities[slot];
  const t = world.t;
  const chained = t - h.comboAt[slot] <= ctx.bal.abilities.comboWindow;
  const step = chained ? (h.comboStep[slot] + 1) % ab.combo.length : 0;
  const res = executeForm(ctx, ab, aim, step);
  if (!res.ok) return false;
  h.comboStep[slot] = step;
  h.comboAt[slot] = t;
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
  });
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
 * to aim at. Cast-paid abilities pay now and land after their wind-up.
 */
export function castAbility(ctx: SimCtx, cast: AbilityCast): boolean {
  const { world } = ctx;
  const h = world.hero;
  const slot = cast.slot;
  const ab = h.abilities[slot];
  if (!ab || h.windup || world.t < h.cooldowns[slot]) return false;
  if (ab.build.payment === 'charge' && h.charge[slot] < ab.chargeNeed - 1e-9) return false;
  if (h.mana < ab.cost) {
    ctx.events.push({ kind: 'noMana', slot });
    return false;
  }
  const aim = cast.aim ?? null;
  if (!aimPoint(ctx, ab, aim)) return false;
  if (ab.castTime > 0) {
    const until = world.t + ab.castTime;
    pay(ctx, slot, until);
    h.windup = { slot, aim, start: world.t, until };
    ctx.events.push({ kind: 'windup', slot, until });
    return true;
  }
  if (!fire(ctx, slot, aim)) return false;
  pay(ctx, slot, world.t);
  return true;
}

/** Land a finished wind-up. Auto-aim is chosen now, so a target that died meanwhile doesn't waste it. */
export function castTick(ctx: SimCtx): void {
  const h = ctx.world.hero;
  if (!h.windup || ctx.world.t < h.windup.until) return;
  const { slot, aim } = h.windup;
  h.windup = null;
  fire(ctx, slot, aim);
}
