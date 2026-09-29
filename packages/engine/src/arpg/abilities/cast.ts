import type { AbilityCast, ResolvedAbility } from '../../types/ability.js';
import type { ArpgWorld, HeroEntity, Vec } from '../../types/arpg.js';
import type { SimCtx } from '../combat.js';
import { cancelSwing, pushTick, startPush } from '../action.js';
import { dirTo, dist } from '../geometry.js';
import { executeForm } from './forms.js';
import { chainMove, stepBonus, stepHeft } from './resolve.js';
import { aimPoint, nearestMonster } from './targeting.js';

const DEFENSIVE = 1;

/** Can the hero pay for it? Infinite mana (Training Grounds) ignores cost, even one dearer than the whole pool. */
export function canAfford(world: ArpgWorld, ab: ResolvedAbility): boolean {
  return !!world.sandbox?.infiniteMana || world.hero.mana >= ab.cost;
}

/** Can the slot's next move be used right now (ignoring targets)? For the HUD and bots. */
export function abilityReady(ctx: SimCtx, slot: number): boolean {
  const h = ctx.world.hero;
  const chain = h.chains[slot];
  if (!chain || h.windup) return false;
  const step = pressStep(h, slot, ctx.world.t, ctx.bal.abilities.comboWindow);
  const ab = chain.moves[step];
  if (ctx.world.t < h.cooldowns[slot][step]) return false;
  if (chain.payment === 'charge' && h.charge[slot] < ab.chargeNeed - 1e-9) return false;
  return canAfford(ctx.world, ab);
}

/**
 * The chain's move a press at `t` casts: the one after the last landed within
 * `window` of it (wrapping after the last move), else the first.
 */
export function pressStep(h: HeroEntity, slot: number, t: number, window: number): number {
  return t - h.comboAt[slot] <= window ? (h.comboStep[slot] + 1) % h.chains[slot].moves.length : 0;
}

/** The move the slot's next press would cast. */
export function nextMove(h: HeroEntity, slot: number, t: number, window: number): ResolvedAbility {
  return h.chains[slot].moves[pressStep(h, slot, t, window)];
}

/** The slot's move winding up or, for the Defensive, the one whose effect is up; else null. */
export function activeMove(h: HeroEntity, slot: number): ResolvedAbility | null {
  const chain = h.chains[slot];
  if (!chain) return null;
  if (h.windup?.slot === slot) return chain.moves[h.windup.step];
  if (slot === DEFENSIVE && h.defend) return chainMove(chain, h.defend.move, h.defend.stage);
  return null;
}

/** Fire move `step` of the slot's chain now, then its recoil and recovery. */
function fire(ctx: SimCtx, slot: number, aim: Vec | null, step: number): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const ab = chainMove(h.chains[slot], step);
  const res = executeForm(ctx, ab, aim);
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
    heft: stepHeft(ab),
  });
  if (ab.motion < 0) {
    const d = dirTo(h.x, h.y, res.tx, res.ty);
    const size = stepBonus(bal, ab.index).size;
    if (d.x !== 0 || d.y !== 0)
      startPush(ctx, { x: -d.x, y: -d.y }, -ab.motion * size, bal.feel.recoilSeconds);
  }
  if (ab.recovery > 0) h.recoverUntil = world.t + ab.recovery;
  return true;
}

/** Pay for move `step`: its mana, its own cooldown (from `from`), its charge from the slot's meter. */
function pay(ctx: SimCtx, slot: number, step: number, ab: ResolvedAbility, from: number): void {
  const h = ctx.world.hero;
  h.mana -= ab.cost;
  // No cooldowns (Training Grounds): no cooldown, and so no charge lockout.
  if (!ctx.world.sandbox?.noCooldowns) h.cooldowns[slot][step] = from + ab.cooldown;
  if (ab.payment === 'charge') h.charge[slot] = Math.max(0, h.charge[slot] - ab.chargeNeed);
}

/**
 * Press an ability: its chain's next move. Fails, costing nothing, while
 * another is winding up, on that move's cooldown, uncharged, unaffordable
 * (with a `noMana` event, and the chain doesn't advance) or with nothing to aim
 * at. Otherwise it pays now, drops a basic swing still winding up, and winds
 * up for its conjure (stepping in, for forward forms) plus any channel; its
 * cooldown counts from the press plus the channel.
 */
export function castAbility(ctx: SimCtx, cast: AbilityCast): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const t = world.t;
  const slot = cast.slot;
  const chain = h.chains[slot];
  if (!chain || h.windup) return false;
  const step = pressStep(h, slot, t, bal.abilities.comboWindow);
  const ab = chain.moves[step];
  if (t < h.cooldowns[slot][step]) return false;
  if (chain.payment === 'charge' && h.charge[slot] < ab.chargeNeed - 1e-9) return false;
  if (!canAfford(world, ab)) {
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
  const chargePaid = chain.payment === 'charge' ? ab.chargeNeed : 0;
  pay(ctx, slot, step, ab, t + ab.channel);
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
    // Never past the aim point, where the form would re-aim from and turn round.
    const reach = Math.min(ab.motion * stepBonus(bal, ab.index).size, dist(h.x, h.y, at.x, at.y));
    startPush(ctx, dir, reach, ab.conjure, stop?.id ?? null);
  }
  ctx.events.push({ kind: 'windup', slot, until: h.windup.until, heft: stepHeft(ab) });
  return true;
}

/**
 * Land a finished wind-up: its press-time move. Auto-aim is chosen again now;
 * if nothing is left to aim at, it lands where the press aimed.
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
