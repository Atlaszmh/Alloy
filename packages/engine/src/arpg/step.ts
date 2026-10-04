import type { DataRegistry } from '../data/registry.js';
import type {
  ArpgEvent,
  ArpgInput,
  ArpgWorld,
  Drop,
  HeroEntity,
  MonsterEntity,
  Projectile,
  Vec,
} from '../types/arpg.js';
import { MANA_TYPES } from '../types/mana.js';
import {
  BASIC_STATUS,
  healHero,
  hitMonster,
  hurtHero,
  isRooted,
  isStunned,
  makeCtx,
  stackIntensity,
  type SimCtx,
} from './combat.js';
import { clamp, clampLen, dirTo, dist } from './geometry.js';
import {
  clipSight,
  isWalkable,
  moveCircle,
  perceives,
  sees,
  shift,
  snapToWalkable,
} from './grid.js';
import {
  canAfford,
  castAbility,
  castTick,
  holdTick,
  inBeat,
  nextMove,
  pressStep,
  windupDir,
} from './abilities/cast.js';
import { defendTick, gainCharge, surging } from './abilities/defend.js';
import { echoTick } from './abilities/echo.js';
import { hitOpts, impact, knobHitOpts } from './abilities/impact.js';
import { chargeCap } from './abilities/resolve.js';
import { nearestMonster, spawnProjectile } from './abilities/targeting.js';
import { createMonsterEntity } from './world.js';
import { basicHoldTick, burstShot, shotLands, startSwing, strike } from './basic.js';
import { cancelSwing, dropHold, pushesTick, swingStrikes } from './action.js';
import { dodgeTick, isDashing, notePerfect, perfectOrigin, tryDodge } from './dodge.js';
import { addMaterial } from '../loot/materials.js';
import { clearanceOf, downhill, flowTick, homeWay, leashTick } from './flow.js';
import { interactTick } from './interact.js';
import { sealTick } from './seal.js';
import { fogTick } from './fog.js';
import { tutorialTick } from './tutorial.js';
import { scriptTick, spawnMults } from './tutorial-floor.js';
import { nearIndices, spatialHash } from './spatial.js';

/** Seconds from aggro to a boss's first special (the Training Grounds' spawner uses it too). */
export const AGGRO_SPECIAL_DELAY = 4;

/**
 * Advance the world by `dt` real seconds using fixed simulation steps.
 * Movement input applies to every step; cast/potion inputs queue for the next
 * step, so a tap is never lost between frames. Returns what happened.
 */
export function stepWorld(
  registry: DataRegistry,
  world: ArpgWorld,
  input: ArpgInput,
  dt: number,
): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  // Presses are kept `buffer` seconds; `heroTick` stops them aging while something holds them.
  const buffer = registry.getDelveBalance().feel.buffer;
  const cast = input.cast;
  if (cast) {
    // A press of the slot whose hold runs is its release; a dropped hold's release is
    // swallowed; any other press waits in the buffer, replacing its slot's older press.
    if (world.hero.hold?.slot === cast.slot) world.queuedRelease = cast;
    else if (world.holdDropped === cast.slot) world.holdDropped = null;
    else {
      world.queuedCasts = world.queuedCasts.filter((q) => q.cast.slot !== cast.slot);
      world.queuedCasts.push({ cast, until: world.t + buffer });
    }
  }
  // Taps only matter in manual mode (automatic attacks need no press).
  if (input.attackTap && input.attack !== undefined)
    world.queuedAttack = { until: world.t + buffer, aim: input.attackAim ?? null };
  if (input.potion) world.queuedPotion = true;
  if (input.dodge) world.queuedDodge = true;
  if (input.interact) world.queuedInteract = true;
  // Nothing is paid until a hold fires: dropping one costs nothing.
  if (input.cancelHold) dropHold(world);
  // A dead hero, or one who took the exit: the floor is over and stands still.
  if (world.heroDead || world.exited) return events;

  const ctx = makeCtx(registry, world, events);
  const step = ctx.bal.arena.step;
  world.accumulator += Math.min(Math.max(0, dt), 0.25);
  let n = 0;
  while (world.accumulator >= step - 1e-9 && n < 12) {
    world.accumulator -= step;
    n++;
    tick(ctx, input, step);
    if (world.heroDead) break;
  }
  return events;
}

/**
 * An element's stacks lapse together at its timer, on every foe (dummies too), before
 * anything in the step can read them (see the elemental stacks spec).
 */
function lapseStacks(world: ArpgWorld): void {
  for (const m of world.monsters) {
    if (m.dead) continue;
    const s = m.status;
    for (const e of MANA_TYPES) if (world.t >= s.stackUntil[e]) s.stacks[e] = 0;
  }
}

function tick(ctx: SimCtx, input: ArpgInput, dt: number): void {
  const { world } = ctx;
  world.t += dt;
  lapseStacks(world);
  heroTick(ctx, input, dt);
  // The floor map's hooks (see the floor maps spec): each a no-op on the open room.
  interactTick(ctx);
  projectilesTick(ctx, dt);
  zonesTick(ctx);
  flowTick(ctx);
  monstersTick(ctx, dt);
  leashTick(ctx);
  separate(ctx);
  sealTick(ctx);
  dropsTick(ctx, dt);
  fogTick(ctx);
  // The guided start's tallies, step and gates (see the tutorial spec): a no-op off it.
  tutorialTick(ctx);

  world.projectiles = world.projectiles.filter((p) => !p.dead);
  world.zones = world.zones.filter((z) => !z.dead);
  world.drops = world.drops.filter((d) => !d.dead);
  world.monsters = world.monsters.filter((m) => !m.dead);

  // A Training Grounds world never clears (so it never ends); a generated floor ends at its exit
  // (`exited`), so only the open room clears when its last foe dies.
  if (!world.sandbox && world.map.open && !world.cleared && world.monsters.length === 0) {
    world.cleared = true;
    world.clearedAt = world.t;
    for (const d of world.drops) d.vacuum = true;
    ctx.events.push({ kind: 'cleared' });
  }
}

// ── Hero ───────────────────────────────────────────────────────────────────

function heroTick(ctx: SimCtx, input: ArpgInput, dt: number): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const move = input.move;

  // Obsidian's barrier lapses without breaking.
  if (h.barrier && world.t >= h.barrier.until) h.barrier = null;

  if (world.queuedPotion) {
    world.queuedPotion = false;
    if (h.potions > 0 && h.hp < h.stats.maxHp) {
      h.potions--;
      world.potionDrunk = true;
      healHero(ctx, h.stats.maxHp * bal.dive.potionHeal, 'potion');
    }
  }
  // The dash moves first; presses made during it wait for it to end.
  dodgeTick(ctx, dt);
  if (world.queuedDodge && !isDashing(ctx)) {
    world.queuedDodge = false;
    tryDodge(ctx, move);
  }
  const dashing = isDashing(ctx);
  const t = world.t;
  const busy = dashing || !!h.windup || !!h.hold;
  // The waiting presses (one per slot) wait out a wind-up, a hold, a dash, their slot's beat and
  // the tick a swing strikes without ageing: each gets `buffer` from then.
  const striking = swingStrikes(h, t);
  for (const q of world.queuedCasts)
    if (busy || striking || inBeat(h, q.cast.slot, t))
      q.until = Math.max(q.until, t + bal.feel.buffer);
  world.queuedCasts = world.queuedCasts.filter((q) => t <= q.until);
  // Of those whose slot is ready (its beat over, its move off cooldown), the one pressed first
  // fires. One on cooldown stays (ageing) and fires if the cooldown ends in time. A swing
  // striking this tick lands first: the press waits a tick.
  const window = bal.abilities.comboWindow;
  const ready = (slot: number) =>
    !!h.chains[slot] &&
    !inBeat(h, slot, t) &&
    t >= h.cooldowns[slot][pressStep(h, slot, t, window)];
  if (!busy && !striking) {
    // A repeat press never fires a hold move: once ready it's dropped (the held button charges
    // it), leaving the tick's one press to the next ready one.
    world.queuedCasts = world.queuedCasts.filter(
      (p) =>
        !p.cast.repeat ||
        !ready(p.cast.slot) ||
        nextMove(h, p.cast.slot, t, window)?.kind !== 'hold',
    );
    const q = world.queuedCasts.find((p) => ready(p.cast.slot));
    if (q) {
      world.queuedCasts = world.queuedCasts.filter((p) => p !== q);
      castAbility(ctx, q.cast);
    }
  }
  // A hold starts, charges, or fires.
  holdTick(ctx, input.holding, dt, dashing);
  castTick(ctx);
  echoTick(ctx);

  const v = clampLen(move);
  const speed = Math.hypot(v.x, v.y);
  // Automatic swings commit only while the hero stands still: moving during the startup clears
  // that, so the blow leaves no recovery (it still lunges and lands). One whose foe is gone is
  // dropped. A released hold blow's leap goes on whatever the input does now.
  if (input.attack === undefined && h.swing && h.swing.released === null) {
    const target = h.swing.targetId;
    if (target !== null && !world.monsters.some((m) => m.id === target && !m.dead))
      cancelSwing(ctx);
    else if (speed > 0.05) h.swing.committed = false;
  }

  // Movement, once a tick (see the weapon flow spec): the steering at the hero's pace, slowed
  // while it acts or recovers (the slower wins); then each push's slice, less any part against
  // the steering. Acting, the hero faces its action (steering strafes); else its steering.
  const surge = surging(ctx);
  h.moving = speed > 0.05 && !dashing;
  const heading = h.moving ? { x: v.x / speed, y: v.y / speed } : null;
  const acting = !!h.swing || !!h.windup || !!h.hold;
  if (heading) {
    const slow = Math.min(
      acting ? bal.feel.actionMove : 1,
      t < h.recoverUntil ? bal.feel.recoveryMove : 1,
    );
    // Lightning Rod quickens the step, on top of Surge and any slowing.
    const quick = t < h.quickUntil ? 1 + bal.reactions.lightningRodMove : 1;
    const pace =
      h.stats.moveSpeed * (surge ? 1 + bal.abilities.defend.surgeMove : 1) * quick * slow;
    Object.assign(h, moveCircle(world.map, h, h.radius, v.x * pace * dt, v.y * pace * dt));
  }
  if (!dashing) pushesTick(ctx, heading);
  if (acting) h.facing = actionFacing(h) ?? h.facing;
  else if (heading) h.facing = heading;

  if (h.swing && t >= h.swing.strikeAt - 1e-9) {
    // A released hold blow strikes as its leap lands; a manual hold blow holds at its strike
    // point while the attack stays held.
    if (h.swing.released !== null) strike(ctx, v, h.swing.released);
    else if (input.attack !== undefined && h.stats.weapon.blows[h.swing.step].kind === 'hold')
      basicHoldTick(ctx, input.attack, dt, input.attackAim ?? null, v);
    else strike(ctx, v);
  }
  // Taps only matter in manual mode: one left when the input turns automatic is dropped.
  if (input.attack === undefined) world.queuedAttack = null;
  // While a press waits, a swing starts only if its blow strikes by the tick the press fires.
  const due = pressDue(ctx, input.holding);
  const deadline = due === Infinity ? Infinity : t + Math.ceil((due - t) / dt - 1e-6) * dt;
  // A tap held by a dash, a wind-up, a hold, a swing, the weapon's cycle or a waiting press
  // doesn't age either.
  if (
    world.queuedAttack &&
    (dashing || h.windup || h.hold || h.swing || t < h.nextAttackAt || due !== Infinity)
  )
    world.queuedAttack.until = Math.max(world.queuedAttack.until, t + bal.feel.buffer);
  if (!h.swing && !h.windup && !h.hold && !dashing) {
    // Automatic unless the input says whether the attack is held (manual mode).
    if (input.attack === undefined) startSwing(ctx, false, speed <= 0.05, null, deadline);
    else {
      const tap = world.queuedAttack && t <= world.queuedAttack.until ? world.queuedAttack : null;
      const aim = input.attackAim ?? tap?.aim ?? null;
      if ((input.attack || tap) && startSwing(ctx, true, true, aim, deadline))
        world.queuedAttack = null;
    }
  }
  if (world.queuedAttack && t > world.queuedAttack.until) world.queuedAttack = null;

  // Infinite mana (Training Grounds) tops the pool up every tick.
  h.mana = world.sandbox?.infiniteMana ? h.manaMax : Math.min(h.manaMax, h.mana + h.manaRegen * dt);
  // A blessing's life regen (see the floor maps spec).
  if (h.stats.lifeRegen)
    h.hp = Math.min(h.stats.maxHp, h.hp + h.stats.maxHp * h.stats.lifeRegen * dt);
  // No cooldowns (Training Grounds) keeps every charge-paid chain charged.
  if (world.sandbox?.noCooldowns)
    h.chains.forEach((chain, i) => {
      if (chain?.payment === 'charge') h.charge[i] = chargeCap(chain);
    });
  if (!nearestMonster(ctx, h.x, h.y, bal.abilities.lullRadius))
    gainCharge(ctx, bal.abilities.lullCharge * dt);
  defendTick(ctx, dt);
}

/**
 * The way the hero faces while it acts: its swing's, its wind-up's
 * (`windupDir`), or toward its hold's aim; null for an action with no way (a
 * self-centred wind-up or hold, a hold with nothing to aim at), which keeps the facing.
 */
function actionFacing(h: HeroEntity): Vec | null {
  if (h.swing) return h.swing.dir;
  if (h.windup) return windupDir(h, h.windup);
  const hold = h.hold;
  // A self-centred hold (aimed where it began) keeps the facing, as its wind-up does.
  if (!hold?.aim || (hold.aim.x === hold.from.x && hold.aim.y === hold.from.y)) return null;
  const d = dirTo(h.x, h.y, hold.aim.x, hold.aim.y);
  return d.x === 0 && d.y === 0 ? null : d;
}

/**
 * When the first press waiting now will fire: the later of its slot's beat end
 * and its next move's cooldown (the earliest over every waiting press that
 * lives that long). A held ability button whose slot waits on either counts as
 * a waiting press (the player means to use that slot next), unless its hold was
 * dropped or the move it would cast can't be paid for (its repeat press would be
 * refused, and basic hits fill the pool). Infinity with none (see the chain feel spec).
 */
function pressDue(ctx: SimCtx, holding: number | null | undefined): number {
  const { world, bal } = ctx;
  const h = world.hero;
  const t = world.t;
  const readyAt = (slot: number) =>
    h.chains[slot]
      ? Math.max(
          h.beatUntil[slot],
          h.cooldowns[slot][pressStep(h, slot, t, bal.abilities.comboWindow)],
        )
      : Infinity;
  const payable = (slot: number) => {
    const chain = h.chains[slot];
    if (!chain) return false;
    const ab = nextMove(h, slot, t, bal.abilities.comboWindow)!;
    if (chain.payment === 'charge' && h.charge[slot] < ab.chargeNeed - 1e-9) return false;
    return canAfford(world, ab);
  };
  const busy = isDashing(ctx) || !!h.windup || !!h.hold;
  let due = Infinity;
  for (const q of world.queuedCasts) {
    const at = readyAt(q.cast.slot);
    // An ageing press that runs out before its slot is ready never fires.
    if (!busy && !inBeat(h, q.cast.slot, t) && q.until < at) continue;
    due = Math.min(due, at);
  }
  if (
    holding !== null &&
    holding !== undefined &&
    holding !== world.holdDropped &&
    payable(holding)
  ) {
    const held = readyAt(holding);
    if (held > t) due = Math.min(due, held);
  }
  return due;
}

// ── Projectiles ────────────────────────────────────────────────────────────

/** Volley darts turn toward their foe while they perceive it (else the next nearest they do). */
function steer(ctx: SimCtx, p: Projectile, dt: number): void {
  const map = ctx.world.map;
  let target =
    ctx.world.monsters.find((m) => m.id === p.homingId && !m.dead && perceives(map, p, m)) ?? null;
  if (!target) {
    target = nearestMonster(ctx, p.x, p.y, 4, new Set(p.hitIds));
    p.homingId = target?.id ?? null;
    if (!target) return;
  }
  const speed = Math.hypot(p.vx, p.vy);
  const want = dirTo(p.x, p.y, target.x, target.y);
  const k = Math.min(1, 7 * dt);
  const nx = p.vx / speed + (want.x - p.vx / speed) * k;
  const ny = p.vy / speed + (want.y - p.vy / speed) * k;
  const len = Math.hypot(nx, ny) || 1;
  p.vx = (nx / len) * speed;
  p.vy = (ny / len) * speed;
}

function projectilesTick(ctx: SimCtx, dt: number): void {
  const { world } = ctx;
  const h = world.hero;
  for (const p of world.projectiles) {
    if (p.dead) continue;
    if (p.homingId !== null) steer(ctx, p, dt);
    const before = { x: p.x, y: p.y };
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.traveled += Math.hypot(p.vx, p.vy) * dt;
    // A wall stops it at its face (where a bolt bursts); off the map ends it too.
    const wall = !sees(world.map, before, p);
    if (wall) Object.assign(p, clipSight(world.map, before, p));
    const outside = wall || !isWalkable(world.map, p.x, p.y);
    const expired = p.traveled >= p.maxDist || outside;

    if (p.owner === 'monster') {
      if (dist(h.x, h.y, p.x, p.y) <= h.radius + p.radius) {
        hurtHero(ctx, p.damage, p.element, null);
        p.dead = true;
        continue;
      }
      const o = perfectOrigin(ctx);
      if (o && dist(o.x, o.y, p.x, p.y) <= h.radius + p.radius) notePerfect(ctx);
      if (expired) p.dead = true;
      continue;
    }

    const from = { x: p.x - p.vx, y: p.y - p.vy };
    for (const m of world.monsters) {
      if (p.dead) break;
      if (m.dead || p.hitIds.includes(m.id)) continue;
      if (dist(p.x, p.y, m.x, m.y) > p.radius + m.radius) continue;
      p.hitIds.push(m.id);
      // A Split shard strikes only the foe it touches: no area, pull, zone or event of its own.
      if (p.ability && p.form === 'shard')
        hitMonster(
          ctx,
          m,
          p.damage,
          p.ability.element,
          hitOpts(p.ability, from, false, true, p.heft),
        );
      else if (p.ability)
        impact(ctx, p.ability, p.x, p.y, p.explodeRadius, p.damage, {
          from,
          tick: p.form === 'ember',
          heft: p.heft,
          // Past its first foe, a rune's Pierce only hits: an Earth shot's endless pierce, as before.
          through: p.hitIds.length > 1 && Number.isFinite(p.pierceLeft ?? 0),
        });
      else if (p.explodeRadius > 0) {
        burstShot(ctx, p, m);
        break;
      } else {
        hitMonster(ctx, m, p.damage, p.element, {
          source: 'basic',
          canCrit: true,
          applies: p.applies,
          heft: p.heft ?? 0,
          rattles: p.rattles,
          stacks: p.stacks,
          noReact: p.noReact,
          ...(p.knobs ? knobHitOpts(p.knobs) : {}),
        });
        // A basic shot's knobs act where it first hits.
        if (p.knobs && p.hitIds.length === 1) shotLands(ctx, p, [m]);
      }
      // A piercing shot passes `pierceLeft` foes; the hit after them ends it.
      const left = p.pierceLeft ?? (p.pierce ? Infinity : 0);
      if (left <= 0) p.dead = true;
      else p.pierceLeft = left - 1;
    }
    if (!p.dead && expired) {
      p.dead = true;
      // A bolt that reaches the end of its flight bursts on the ground (a Split shard just ends).
      if (p.ability && !p.pierce && p.form !== 'volley' && p.form !== 'shard') {
        impact(ctx, p.ability, p.x, p.y, p.explodeRadius, p.damage, {
          from,
          tick: p.form === 'ember',
          heft: p.heft,
        });
      } else if (!p.ability && p.explodeRadius > 0) burstShot(ctx, p);
    }
  }
}

// ── Zones ──────────────────────────────────────────────────────────────────

function zonesTick(ctx: SimCtx): void {
  const { world } = ctx;
  const h = world.hero;
  for (const z of world.zones) {
    if (z.dead) continue;
    if (z.owner === 'monster') {
      if (world.t >= z.detonateAt) {
        z.dead = true;
        ctx.events.push({
          kind: 'explode',
          x: z.x,
          y: z.y,
          radius: z.radius,
          element: z.element,
          infusion: null,
        });
        // The slam reaches only what it sees.
        const o = perfectOrigin(ctx);
        if (dist(h.x, h.y, z.x, z.y) <= z.radius + h.radius && sees(world.map, z, h))
          hurtHero(ctx, z.damage, z.element, null);
        else if (o && dist(o.x, o.y, z.x, z.y) <= z.radius + h.radius && sees(world.map, z, o))
          notePerfect(ctx);
      }
      continue;
    }
    // Barrage impacts and thrown Bursts land once.
    if (z.detonateAt > 0) {
      if (world.t >= z.detonateAt) {
        z.dead = true;
        if (z.ability) impact(ctx, z.ability, z.x, z.y, z.radius, z.damage, { heft: z.heft });
      }
      continue;
    }
    if (world.t >= z.until) {
      z.dead = true;
      continue;
    }
    if (world.t < z.nextTick) continue;
    z.nextTick += z.tick;
    if (z.ability)
      impact(ctx, z.ability, z.x, z.y, z.radius, z.damage, { tick: true, silent: true });
    else {
      // A blow's Linger: each foe inside that it sees takes a basic hit (no crit) of its element.
      const applies = z.element ? [BASIC_STATUS[z.element]] : [];
      for (const m of world.monsters)
        if (!m.dead && dist(z.x, z.y, m.x, m.y) <= z.radius + m.radius && sees(world.map, z, m))
          hitMonster(ctx, m, z.damage, z.element, { source: 'basic', canCrit: false, applies });
    }
  }
}

// ── Monsters ───────────────────────────────────────────────────────────────

function enrageMult(ctx: SimCtx, m: MonsterEntity): number {
  if (m.kind !== 'boss' || !m.aggro) return 1;
  const over = ctx.world.t - m.aggroAt - ctx.bal.monster.enrageSeconds;
  return over < 0 ? 1 : Math.pow(2, 1 + Math.floor(over / ctx.bal.monster.enrageInterval));
}

function damageHero(ctx: SimCtx, m: MonsterEntity, amount: number, melee: boolean): void {
  hurtHero(ctx, amount * enrageMult(ctx, m), m.element, m, { melee });
}

/** A monster's gap to where the hero's dodge began, while a perfect dodge is still possible. */
function gapFromDodge(ctx: SimCtx, m: MonsterEntity): number {
  const o = perfectOrigin(ctx);
  return o ? dist(m.x, m.y, o.x, o.y) - m.radius - ctx.world.hero.radius : Infinity;
}

/** Rooted foes stay put (they can still attack in reach); a wall stops the rest. */
function moveMonster(ctx: SimCtx, m: MonsterEntity, dir: Vec, speed: number, dt: number): void {
  if (isRooted(ctx, m)) return;
  shift(ctx.world.map, m, m.radius, dir.x * speed * dt, dir.y * speed * dt);
  keepInRoom(ctx, m);
}

/** A boss never leaves its room (see the floor maps spec); the open room's has none. */
function keepInRoom(ctx: SimCtx, m: MonsterEntity): void {
  if (m.kind !== 'boss' || m.roomId === null) return;
  const rect = ctx.world.map.rooms.find((r) => r.id === m.roomId)?.rect;
  if (!rect) return;
  m.x = clamp(m.x, rect.x + m.radius, rect.x + rect.w - m.radius);
  m.y = clamp(m.y, rect.y + m.radius, rect.y + rect.h - m.radius);
}

/**
 * Go after the hero (see the floor maps spec): straight at it (`toTarget`) in
 * the open room or when `direct`, else down the foe's clearance class's flow
 * field; beyond the field it holds its place.
 */
function pursue(
  ctx: SimCtx,
  m: MonsterEntity,
  toTarget: Vec,
  direct: boolean,
  speed: number,
  dt: number,
): void {
  const { world } = ctx;
  if (world.map.open || direct) return moveMonster(ctx, m, toTarget, speed, dt);
  const field = clearanceOf(m) === 'large' ? world.flow.large : world.flow.small;
  const way = field && downhill(world.map, field, m, world.hero);
  if (way) moveMonster(ctx, m, way, speed, dt);
}

function bossSpecial(ctx: SimCtx, m: MonsterEntity): void {
  const { world, registry } = ctx;
  const h = world.hero;
  const roll = world.rng.nextInt(0, 2);
  if (roll === 0) {
    world.zones.push({
      id: world.nextId++,
      owner: 'monster',
      source: null,
      ability: null,
      x: h.x,
      y: h.y,
      radius: 2.6,
      born: world.t,
      until: world.t + 1.3,
      tick: 0,
      nextTick: 0,
      damage: m.damage * 1.7 * enrageMult(ctx, m),
      element: m.element,
      detonateAt: world.t + 1.2,
      dead: false,
    });
  } else if (roll === 1) {
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      spawnProjectile(ctx, {
        owner: 'monster',
        form: null,
        ability: null,
        homingId: null,
        x: m.x,
        y: m.y,
        vx: Math.cos(a) * 6,
        vy: Math.sin(a) * 6,
        radius: 0.35,
        damage: m.damage * 0.6 * enrageMult(ctx, m),
        element: m.element,
        pierce: false,
        maxDist: 16,
        explodeRadius: 0,
        applies: [],
        knockback: 0,
      });
    }
  } else if (world.monsters.filter((o) => !o.dead && !o.dummy).length < 14) {
    const biome = registry.getBiomeForDepth(world.depth);
    for (let i = 0; i < 2; i++) {
      const def = biome.monsters[world.rng.nextInt(0, biome.monsters.length - 1)];
      const add = createMonsterEntity(
        registry,
        {
          id: world.nextId++,
          def,
          kind: 'normal',
          depth: world.depth,
          door: world.door,
          element: world.element,
          ...clipSight(
            world.map,
            m,
            snapToWalkable(world.map, m.x + (i === 0 ? -1.8 : 1.8), m.y + 1.2, 1),
          ),
          packId: m.packId,
          roomId: m.roomId,
          // A hand-built floor's boss (Grask) passes its spawn's tuning on to what it summons.
          ...spawnMults(ctx, m),
        },
        world.rng,
      );
      add.aggro = true;
      add.aggroAt = world.t;
      world.monsters.push(add);
      world.totalMonsters++;
    }
  }
  m.nextSpecialAt = world.t + 6 + world.rng.next() * 2 - (enrageMult(ctx, m) > 1 ? 2 : 0);
}

function monstersTick(ctx: SimCtx, dt: number): void {
  const { world, bal } = ctx;
  const h = world.hero;

  for (const m of world.monsters) {
    if (m.dead) continue;
    const s = m.status;

    if (s.stacks.fire > 0 && world.t >= s.burnTickAt) {
      s.burnTickAt += 0.5;
      const perSecond = s.burnRef * bal.stacks.firePerStack * stackIntensity(ctx, s.stacks.fire);
      hitMonster(ctx, m, perSecond * 0.5, 'fire', {
        source: 'dot',
        noReact: true,
        slot: s.burnSlot,
      });
      if (m.dead) continue;
    }
    if (s.stacks.nature > 0 && world.t >= s.poisonTickAt) {
      s.poisonTickAt += 0.5;
      const perSecond =
        s.poisonRef * bal.stacks.poisonPerStack * stackIntensity(ctx, s.stacks.nature);
      hitMonster(ctx, m, perSecond * 0.5, 'nature', {
        source: 'dot',
        noReact: true,
        slot: s.poisonSlot,
      });
      if (m.dead) continue;
    }
    if (m.traits.includes('regenerating'))
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * bal.monster.traits.regenPerSecond * dt);

    if (m.kbx !== 0 || m.kby !== 0) {
      shift(world.map, m, m.radius, m.kbx * dt, m.kby * dt);
      keepInRoom(ctx, m);
      const decay = Math.exp(-10 * dt);
      m.kbx = Math.abs(m.kbx * decay) < 0.05 ? 0 : m.kbx * decay;
      m.kby = Math.abs(m.kby * decay) < 0.05 ? 0 : m.kby * decay;
    }

    // A training dummy keeps its statuses and its knockback, but never acts.
    if (m.dummy) continue;
    // A leashed foe walks home and does nothing else (`leashTick`).
    if (m.goingHome) {
      const way = isStunned(ctx, m) ? null : homeWay(world.map, m);
      if (way) moveMonster(ctx, m, way, m.speed, dt);
      continue;
    }

    // A foe wakes when it perceives the hero near (or is hit), and its pack with it.
    if (!m.aggro) {
      if (dist(m.x, m.y, h.x, h.y) < bal.monster.aggroRadius && perceives(world.map, m, h)) {
        for (const o of world.monsters) {
          if (!o.dead && !o.aggro && o.packId === m.packId) {
            o.aggro = true;
            o.aggroAt = world.t;
          }
        }
        if (m.kind === 'boss') m.nextSpecialAt = world.t + AGGRO_SPECIAL_DELAY;
      } else continue;
    }
    if (isStunned(ctx, m)) continue;
    // A hand-built floor's scripted foe (see the tutorial spec) plays its script, not its AI.
    if (m.script) {
      scriptTick(ctx, m);
      continue;
    }

    const gap = dist(m.x, m.y, h.x, h.y) - m.radius - h.radius;
    const toTarget = dirTo(m.x, m.y, h.x, h.y);
    // It attacks only what it perceives; with sight in `ai.directRange` it steers straight at it.
    const seen = perceives(world.map, m, h);
    const near = seen && dist(m.x, m.y, h.x, h.y) <= bal.ai.directRange;
    const chill = Math.min(bal.stacks.frostSlowCap, s.stacks.frost * bal.stacks.frostSlowPerStack);
    const speed = m.speed * (1 - chill);

    if (m.kind === 'boss' && world.t >= m.nextSpecialAt && m.windupUntil === 0) bossSpecial(ctx, m);

    switch (m.ai) {
      case 'charger': {
        if (m.chargeUntil > world.t) {
          moveMonster(ctx, m, m.chargeDir, m.speed * 3.4, dt);
          if (!m.chargeHit && gap <= 0.25) {
            m.chargeHit = true;
            m.chargeUntil = world.t;
            damageHero(ctx, m, m.damage * 1.4, true);
          } else if (!m.chargeHit && gapFromDodge(ctx, m) <= 0.25) notePerfect(ctx);
          break;
        }
        if (m.windupUntil > 0) {
          if (world.t >= m.windupUntil) {
            m.windupUntil = 0;
            m.chargeUntil = world.t + 0.55;
            m.chargeHit = false;
            m.nextAttackAt = world.t + m.attackInterval * 1.6;
          }
          break;
        }
        if (gap > 7.5 || !seen) pursue(ctx, m, toTarget, near, speed, dt);
        else if (world.t >= m.nextAttackAt) {
          m.windupStart = world.t;
          m.windupUntil = world.t + 0.75;
          m.chargeDir = toTarget;
        } else if (gap > m.attackRange) moveMonster(ctx, m, toTarget, speed * 0.6, dt);
        break;
      }
      case 'ranged': {
        if (m.windupUntil > 0) {
          if (world.t >= m.windupUntil) {
            m.windupUntil = 0;
            m.nextAttackAt = world.t + m.attackInterval;
            // It fires only with sight.
            if (!seen) break;
            spawnProjectile(ctx, {
              owner: 'monster',
              form: null,
              ability: null,
              homingId: null,
              x: m.x + toTarget.x * m.radius,
              y: m.y + toTarget.y * m.radius,
              vx: toTarget.x * 8,
              vy: toTarget.y * 8,
              radius: 0.3,
              damage: m.damage * enrageMult(ctx, m),
              element: m.element,
              pierce: false,
              maxDist: 11,
              explodeRadius: 0,
              applies: [],
              knockback: 0,
            });
          }
          break;
        }
        if (gap > 7 || !seen) pursue(ctx, m, toTarget, seen, speed, dt);
        else if (gap < 3.5) moveMonster(ctx, m, toTarget, -speed * 0.7, dt);
        if (seen && gap <= 8 && world.t >= m.nextAttackAt) {
          m.windupStart = world.t;
          m.windupUntil = world.t + 0.5;
        }
        break;
      }
      default: {
        if (m.windupUntil > 0) {
          if (world.t >= m.windupUntil) {
            m.windupUntil = 0;
            m.nextAttackAt = world.t + m.attackInterval;
            if (gap <= m.attackRange + 0.5 && seen) damageHero(ctx, m, m.damage, true);
            else if (gapFromDodge(ctx, m) <= m.attackRange + 0.5) notePerfect(ctx);
          }
          break;
        }
        if (gap > m.attackRange || !seen) pursue(ctx, m, toTarget, near, speed, dt);
        else if (world.t >= m.nextAttackAt) {
          m.windupStart = world.t;
          m.windupUntil = world.t + bal.monster.windup * (m.kind === 'boss' ? 1.5 : 1);
        }
      }
    }
  }
}

// ── Collisions & pickups ───────────────────────────────────────────────────

/**
 * Foes push apart, and the hero from them, never into a wall. Each pair is
 * looked at in the list's order, as always, but only neighbours in a spatial
 * hash whose cells span the widest pair and a unit more for this pass's shoves.
 */
function separate(ctx: SimCtx): void {
  const { world } = ctx;
  const map = world.map;
  const h = world.hero;
  const dashing = isDashing(ctx);
  const ms = world.monsters.filter((m) => !m.dead);
  // ponytail: a crowd shoved over a unit in one pass could miss a pair; the next tick has it.
  const hash = spatialHash(ms, 2 * Math.max(0, ...ms.map((m) => m.radius)) + 1);
  for (let i = 0; i < ms.length; i++) {
    const a = ms[i];
    for (const j of nearIndices(hash, a.x, a.y)) {
      if (j <= i) continue;
      const b = ms[j];
      const d = dist(a.x, a.y, b.x, b.y);
      const overlap = a.radius + b.radius - d;
      if (overlap <= 0) continue;
      const n = d > 1e-6 ? { x: (b.x - a.x) / d, y: (b.y - a.y) / d } : { x: 1, y: 0 };
      const wa = b.kind === 'boss' ? 1 : a.kind === 'boss' ? 0 : 0.5;
      shift(map, a, a.radius, -n.x * overlap * wa, -n.y * overlap * wa);
      shift(map, b, b.radius, n.x * overlap * (1 - wa), n.y * overlap * (1 - wa));
    }
    // A dashing hero slips through foes.
    if (dashing) continue;
    const d = dist(h.x, h.y, a.x, a.y);
    const overlap = a.radius + h.radius - d;
    if (overlap > 0) {
      const n = d > 1e-6 ? { x: (a.x - h.x) / d, y: (a.y - h.y) / d } : { x: 0, y: -1 };
      // A dummy doesn't budge for the hero; a boss mostly doesn't.
      const heroShare = a.dummy ? 1 : a.kind === 'boss' ? 0.8 : 0.2;
      shift(map, a, a.radius, n.x * overlap * (1 - heroShare), n.y * overlap * (1 - heroShare));
      shift(map, h, h.radius, -n.x * overlap * heroShare, -n.y * overlap * heroShare);
    }
  }
  // Whatever the moves and pushes left pressed into a wall goes back out.
  for (const m of ms) Object.assign(m, moveCircle(world.map, m, m.radius, 0, 0));
  Object.assign(h, moveCircle(world.map, h, h.radius, 0, 0));
}

/** A drop's size on the grid, as the magnet and the vacuum slide it along walls. */
const DROP_RADIUS = 0.25;

/** Gear, runes, patterns and essences are walked over; everything else flies to the hero in the magnet's reach. */
function walkedOver(d: Drop): boolean {
  return (
    d.kind === 'item' || d.kind === 'rune' || d.kind === 'pattern' || d.material?.kind === 'essence'
  );
}

function dropsTick(ctx: SimCtx, dt: number): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const { magnetSpeed, vacuumSpeed, pickupDelay } = bal.drops;
  for (const d of world.drops) {
    if (d.dead) continue;
    const gap = dist(h.x, h.y, d.x, d.y);
    // The magnet draws what it sees; the vacuum, anything. Both slide along walls.
    const magnet = !walkedOver(d) && gap < bal.hero.magnetRadius && sees(world.map, d, h);
    if (d.vacuum || magnet) {
      const dir = dirTo(d.x, d.y, h.x, h.y);
      const speed = d.vacuum ? vacuumSpeed : magnetSpeed;
      const stepLen = Math.min(gap, speed * dt);
      shift(world.map, d, DROP_RADIUS, dir.x * stepLen, dir.y * stepLen);
    }
    if (world.t - d.born < pickupDelay) continue;
    if (dist(h.x, h.y, d.x, d.y) > bal.hero.pickupRadius) continue;
    d.dead = true;
    switch (d.kind) {
      case 'item':
        if (d.item) world.pending.items.push(d.item);
        break;
      case 'mote':
        h.mana = Math.min(h.manaMax, h.mana + d.amount);
        break;
      case 'orb':
        healHero(ctx, h.stats.maxHp * d.amount, 'orb');
        break;
      case 'scrap':
        world.pending.scrap += d.amount;
        break;
      case 'rune':
        if (d.rune) world.pending.runes.push(d.rune);
        break;
      case 'material':
        if (d.material) world.pending.haul = addMaterial(world.pending.haul, d.material, d.amount);
        break;
      case 'pattern':
        if (d.pattern) world.pending.patterns.push(d.pattern);
        break;
    }
    ctx.events.push({
      kind: 'pickup',
      dropId: d.id,
      dropKind: d.kind,
      item: d.item,
      rune: d.rune,
      amount: d.amount,
      mana: d.mana,
      material: d.material,
      pattern: d.pattern,
    });
  }
}
