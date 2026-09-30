import type { AbilityCast, ResolvedAbility } from '../../types/ability.js';
import type { ArpgWorld, HeroEntity, Vec } from '../../types/arpg.js';
import type { DelveBalance } from '../../types/delve.js';
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
  if (!chain || h.windup || h.hold) return false;
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

/** The slot's move winding up, holding or, for the Defensive, the one whose effect is up; else null. */
export function activeMove(h: HeroEntity, slot: number): ResolvedAbility | null {
  const chain = h.chains[slot];
  if (!chain) return null;
  if (h.windup?.slot === slot) return chainMove(chain, h.windup.step, h.windup.stage);
  if (h.hold?.slot === slot) return chain.moves[h.hold.step];
  if (slot === DEFENSIVE && h.defend) return chainMove(chain, h.defend.move, h.defend.stage);
  return null;
}

/**
 * A hold's charge at `t` (0..1 over `full`, the seconds to its full charge:
 * `HeroEntity.hold.full`, or `holdTime` × the tempo for a hold blow) and its
 * stage (by `holdStages`: stage 2 at full charge).
 */
export function holdCharge(
  bal: DelveBalance,
  start: number,
  t: number,
  full: number,
): { charge: number; stage: number } {
  const stages = bal.chains.holdStages;
  const charge = Math.min(1, (t - start) / full + 1e-9);
  return { charge, stage: charge >= stages[1] ? 2 : charge >= stages[0] ? 1 : 0 };
}

/** Fire move `step` of the slot's chain (a hold at `stage`) now, then its recoil and recovery. */
function fire(ctx: SimCtx, slot: number, aim: Vec | null, step: number, stage = 0): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const ab = chainMove(h.chains[slot], step, stage);
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
  if (!chain || h.windup || h.hold) return false;
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
  // (A tap on a hold move, with no hold running, is its stage 0 with its full wind-up.)
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
    stage: 0,
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
 * Holding `slot`: its next move, a hold, starts charging when the hero is free
 * as a press needs (a swing winding up gives way) and its first stage is
 * affordable. Nothing is paid yet; the hero faces what it aims at.
 */
function startHold(ctx: SimCtx, slot: number): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const t = world.t;
  const chain = h.chains[slot];
  if (!chain || h.windup) return;
  const step = pressStep(h, slot, t, bal.abilities.comboWindow);
  const ab = chain.moves[step];
  if (ab.kind !== 'hold' || t < h.cooldowns[slot][step]) return;
  if (chain.payment === 'charge' && h.charge[slot] < ab.chargeNeed - 1e-9) return;
  if (!canAfford(world, ab)) return;
  cancelSwing(ctx);
  h.push = null;
  h.recoverUntil = t;
  const aim = aimPoint(ctx, ab, null);
  const dir = aim ? dirTo(h.x, h.y, aim.x, aim.y) : null;
  if (dir && (dir.x !== 0 || dir.y !== 0)) h.facing = dir;
  const tempo = h.stats.tempo;
  h.hold = {
    slot,
    step,
    start: t,
    aim,
    full: bal.chains.holdTime * tempo,
    max: bal.chains.holdMax * tempo,
  };
}

/**
 * Release the running hold at `stage`, or at the highest stage below that it
 * can afford, paying that stage's cost now (with no stage affordable, or
 * nothing to aim at, it ends unpaid). The time spent charging counts toward
 * the stage's wind-up: what is left of it (its conjure, then any channel)
 * runs as an ordinary wind-up without a step-in, so a long hold fires at once.
 * Its cooldown counts from the landing.
 */
function releaseHold(ctx: SimCtx, aim: Vec | null, stage: number): void {
  const { world } = ctx;
  const h = world.hero;
  const t = world.t;
  const hold = h.hold!;
  h.hold = null;
  const chain = h.chains[hold.slot];
  let s = stage;
  while (s > 0 && !canAfford(world, chainMove(chain, hold.step, s))) s--;
  const ab = chainMove(chain, hold.step, s);
  if (!canAfford(world, ab)) return;
  const at = aimPoint(ctx, ab, aim) ?? hold.aim;
  if (!at) return;
  const held = t - hold.start;
  const left = Math.max(0, ab.castTime - held);
  pay(ctx, hold.slot, hold.step, ab, t + left);
  if (left < 1e-9) {
    if (!fire(ctx, hold.slot, aim, hold.step, s)) fire(ctx, hold.slot, at, hold.step, s);
    return;
  }
  h.windup = {
    slot: hold.slot,
    aim,
    at,
    start: t,
    until: t + left,
    step: hold.step,
    stage: s,
    conjureUntil: t + Math.max(0, ab.conjure - held),
    chargePaid: chain.payment === 'charge' ? ab.chargeNeed : 0,
  };
  ctx.events.push({ kind: 'windup', slot: hold.slot, until: h.windup.until, heft: stepHeft(ab) });
}

/**
 * The hold, each step: holding a slot whose next move is a hold starts one
 * (not while the slot's dropped hold's button stays held: `holdDropped`).
 * While it runs, its release (a press of its slot: the button let go) fires it
 * at its stage; past its `max` it fires by itself at stage 2 (and marks the
 * slot, as a drop does); the button let go with no release (a lost release)
 * fires it at its stage. Meanwhile the hero stays rooted, each new stage says
 * so, and the slot's combo window is paused.
 */
export function holdTick(
  ctx: SimCtx,
  holding: number | null | undefined,
  dt: number,
  dashing: boolean,
): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const release = world.queuedRelease;
  world.queuedRelease = null;
  if (world.holdDropped !== null && holding !== world.holdDropped) world.holdDropped = null;
  if (!h.hold) {
    if (holding !== null && holding !== undefined && !dashing && holding !== world.holdDropped)
      startHold(ctx, holding);
    return;
  }
  const t = world.t;
  const { start, full, max } = h.hold;
  const { stage } = holdCharge(bal, start, t, full);
  if (release) releaseHold(ctx, release.aim ?? null, stage);
  else if (t - start >= max - 1e-9) {
    world.holdDropped = h.hold.slot;
    releaseHold(ctx, null, 2);
  } else if (holding !== h.hold.slot) releaseHold(ctx, null, stage);
  else {
    if (stage > holdCharge(bal, start, t - dt, full).stage)
      ctx.events.push({ kind: 'holdStage', slot: h.hold.slot, stage });
    h.comboAt[h.hold.slot] += dt;
  }
}

/**
 * Land a finished wind-up: its press-time move (a released hold's stage).
 * Auto-aim is chosen again now; if nothing is left to aim at, it lands where
 * the press aimed.
 */
export function castTick(ctx: SimCtx): void {
  const h = ctx.world.hero;
  if (!h.windup || ctx.world.t < h.windup.until - 1e-9) return;
  const { slot, aim, at, step, stage } = h.windup;
  h.windup = null;
  // A step-in finishes before the blow lands, so it hits from where the step took the hero.
  pushTick(ctx, true);
  if (!fire(ctx, slot, aim, step, stage)) fire(ctx, slot, at, step, stage);
}
