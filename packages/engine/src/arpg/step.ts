import type { DataRegistry } from '../data/registry.js';
import type {
  ArpgEvent,
  ArpgInput,
  ArpgWorld,
  MonsterEntity,
  Projectile,
  Vec,
} from '../types/arpg.js';
import {
  healHero,
  hitMonster,
  hurtHero,
  isChilled,
  isRooted,
  isStunned,
  makeCtx,
  type SimCtx,
} from './combat.js';
import { clamp, clampLen, dirTo, dist } from './geometry.js';
import { castAbility, castTick } from './abilities/cast.js';
import { defendTick, gainCharge, surging } from './abilities/defend.js';
import { impact } from './abilities/impact.js';
import { nearestMonster, spawnProjectile } from './abilities/targeting.js';
import { createMonsterEntity } from './world.js';
import { burstShot, startSwing, strike } from './basic.js';
import { pushTick } from './action.js';
import { dodgeTick, isDashing, notePerfect, perfectOrigin, tryDodge } from './dodge.js';

const ITEM_PICKUP_DELAY = 0.35;

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
  if (input.cast) {
    world.queuedCast = input.cast;
    world.queuedCastUntil = world.t + buffer;
  }
  // Taps only matter in manual mode (automatic attacks need no press).
  if (input.attackTap && input.attack !== undefined)
    world.queuedAttack = { until: world.t + buffer, aim: input.attackAim ?? null };
  if (input.potion) world.queuedPotion = true;
  if (input.dodge) world.queuedDodge = true;
  if (world.heroDead) return events;

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

function tick(ctx: SimCtx, input: ArpgInput, dt: number): void {
  const { world } = ctx;
  world.t += dt;
  heroTick(ctx, input, dt);
  projectilesTick(ctx, dt);
  zonesTick(ctx);
  monstersTick(ctx, dt);
  separate(ctx);
  dropsTick(ctx, dt);

  world.projectiles = world.projectiles.filter((p) => !p.dead);
  world.zones = world.zones.filter((z) => !z.dead);
  world.drops = world.drops.filter((d) => !d.dead);
  world.monsters = world.monsters.filter((m) => !m.dead);

  if (!world.cleared && world.monsters.length === 0) {
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

  if (world.queuedPotion) {
    world.queuedPotion = false;
    if (h.potions > 0 && h.hp < h.stats.maxHp) {
      h.potions--;
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
  // A queued press waits out a wind-up or a dash; anything else lets it through.
  // A press held by a wind-up or a dash doesn't age: it gets `buffer` from when the hero is free.
  if (world.queuedCast !== null && (dashing || h.windup))
    world.queuedCastUntil = Math.max(world.queuedCastUntil, t + bal.feel.buffer);
  if (world.queuedCast !== null && t > world.queuedCastUntil) world.queuedCast = null;
  if (world.queuedCast !== null && !dashing && !h.windup) {
    const cast = world.queuedCast;
    world.queuedCast = null;
    castAbility(ctx, cast);
  }
  castTick(ctx);

  // Movement: a push carries the hero; a wind-up or a committed swing roots it; a recovery slows it.
  const surge = surging(ctx);
  const pushed = !dashing && pushTick(ctx);
  const rooted = !!h.windup || !!h.swing?.committed;
  const v = clampLen(move);
  const speed = Math.hypot(v.x, v.y);
  h.moving = speed > 0.05 && !dashing && !pushed && !rooted;
  if (h.moving) {
    const slow = t < h.recoverUntil ? bal.feel.recoveryMove : 1;
    const pace = h.stats.moveSpeed * (surge ? 1 + bal.abilities.defend.surgeMove : 1) * slow;
    h.x = clamp(h.x + v.x * pace * dt, h.radius, world.width - h.radius);
    h.y = clamp(h.y + v.y * pace * dt, h.radius, world.height - h.radius);
    h.facing = { x: v.x / speed, y: v.y / speed };
  }

  if (h.swing && t >= h.swing.strikeAt - 1e-9) strike(ctx);
  // Taps only matter in manual mode: one left when the input turns automatic is dropped.
  if (input.attack === undefined) world.queuedAttack = null;
  // A tap held by a dash, a wind-up, a swing, a push or the weapon's cycle doesn't age either.
  if (world.queuedAttack && (dashing || h.windup || h.swing || h.push || t < h.nextAttackAt))
    world.queuedAttack.until = Math.max(world.queuedAttack.until, t + bal.feel.buffer);
  // A swing waits for a push (a lunge, a step-in or a recoil) to finish, so it never swallows one.
  if (!h.swing && !h.windup && !h.push && !dashing) {
    // Automatic unless the input says whether the attack is held (manual mode).
    if (input.attack === undefined) startSwing(ctx, false, speed <= 0.05);
    else {
      const tap = world.queuedAttack && t <= world.queuedAttack.until ? world.queuedAttack : null;
      if ((input.attack || tap) && startSwing(ctx, true, true, input.attackAim ?? tap?.aim ?? null))
        world.queuedAttack = null;
    }
  }
  if (world.queuedAttack && t > world.queuedAttack.until) world.queuedAttack = null;

  h.mana = Math.min(h.manaMax, h.mana + h.manaRegen * dt);
  if (!nearestMonster(ctx, h.x, h.y, bal.abilities.lullRadius))
    gainCharge(ctx, bal.abilities.lullCharge * dt);
  defendTick(ctx, dt);
}

// ── Projectiles ────────────────────────────────────────────────────────────

/** Volley darts turn toward their foe (or the next nearest once it dies). */
function steer(ctx: SimCtx, p: Projectile, dt: number): void {
  let target = ctx.world.monsters.find((m) => m.id === p.homingId && !m.dead) ?? null;
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
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.traveled += Math.hypot(p.vx, p.vy) * dt;
    const outside = p.x < 0 || p.y < 0 || p.x > world.width || p.y > world.height;
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
      if (p.ability)
        impact(ctx, p.ability, p.x, p.y, p.explodeRadius, p.damage, {
          from,
          tick: p.form === 'ember',
          heft: p.heft,
        });
      else if (p.explodeRadius > 0) {
        burstShot(ctx, p, m);
        break;
      } else
        hitMonster(ctx, m, p.damage, p.element, {
          source: 'basic',
          canCrit: true,
          applies: p.applies,
          heft: p.heft ?? 0,
        });
      if (!p.pierce) p.dead = true;
    }
    if (!p.dead && expired) {
      p.dead = true;
      // A bolt that reaches the end of its flight bursts on the ground.
      if (p.ability && !p.pierce && p.form !== 'volley') {
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
        ctx.events.push({ kind: 'explode', x: z.x, y: z.y, radius: z.radius, element: z.element });
        const o = perfectOrigin(ctx);
        if (dist(h.x, h.y, z.x, z.y) <= z.radius + h.radius)
          hurtHero(ctx, z.damage, z.element, null);
        else if (o && dist(o.x, o.y, z.x, z.y) <= z.radius + h.radius) notePerfect(ctx);
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

/** Rooted foes stay put (they can still attack in reach). */
function moveMonster(ctx: SimCtx, m: MonsterEntity, dir: Vec, speed: number, dt: number): void {
  if (isRooted(ctx, m)) return;
  m.x += dir.x * speed * dt;
  m.y += dir.y * speed * dt;
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
      applies: [],
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
  } else if (world.monsters.filter((o) => !o.dead).length < 14) {
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
          x: clamp(m.x + (i === 0 ? -1.8 : 1.8), 1, world.width - 1),
          y: clamp(m.y + 1.2, 1, world.height - 1),
          packId: m.packId,
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

    if (world.t < s.burnUntil && world.t >= s.burnTickAt) {
      s.burnTickAt += 0.5;
      hitMonster(ctx, m, s.burnDps * 0.5, 'fire', { source: 'dot', noReact: true });
      if (m.dead) continue;
    }
    if (world.t < s.poisonUntil && world.t >= s.poisonTickAt) {
      s.poisonTickAt += 0.5;
      hitMonster(ctx, m, s.poisonDps * s.poisonStacks * 0.5, 'nature', {
        source: 'dot',
        noReact: true,
      });
      if (m.dead) continue;
    }
    if (m.traits.includes('regenerating'))
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * bal.monster.traits.regenPerSecond * dt);

    if (m.kbx !== 0 || m.kby !== 0) {
      m.x += m.kbx * dt;
      m.y += m.kby * dt;
      const decay = Math.exp(-10 * dt);
      m.kbx = Math.abs(m.kbx * decay) < 0.05 ? 0 : m.kbx * decay;
      m.kby = Math.abs(m.kby * decay) < 0.05 ? 0 : m.kby * decay;
    }

    if (!m.aggro) {
      if (dist(m.x, m.y, h.x, h.y) < bal.monster.aggroRadius) {
        for (const o of world.monsters) {
          if (!o.dead && !o.aggro && o.packId === m.packId) {
            o.aggro = true;
            o.aggroAt = world.t;
          }
        }
        if (m.kind === 'boss') m.nextSpecialAt = world.t + 4;
      } else continue;
    }
    if (isStunned(ctx, m)) continue;

    const gap = dist(m.x, m.y, h.x, h.y) - m.radius - h.radius;
    const toTarget = dirTo(m.x, m.y, h.x, h.y);
    const slow = isChilled(ctx, m) ? 1 - bal.status.chillSlow : 1;
    const speed = m.speed * slow;

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
        if (gap > 7.5) moveMonster(ctx, m, toTarget, speed, dt);
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
        if (gap > 7) moveMonster(ctx, m, toTarget, speed, dt);
        else if (gap < 3.5) moveMonster(ctx, m, toTarget, -speed * 0.7, dt);
        if (gap <= 8 && world.t >= m.nextAttackAt) {
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
            if (gap <= m.attackRange + 0.5) damageHero(ctx, m, m.damage, true);
            else if (gapFromDodge(ctx, m) <= m.attackRange + 0.5) notePerfect(ctx);
          }
          break;
        }
        if (gap > m.attackRange) moveMonster(ctx, m, toTarget, speed, dt);
        else if (world.t >= m.nextAttackAt) {
          m.windupStart = world.t;
          m.windupUntil = world.t + bal.monster.windup * (m.kind === 'boss' ? 1.5 : 1);
        }
      }
    }
  }
}

// ── Collisions & pickups ───────────────────────────────────────────────────

function separate(ctx: SimCtx): void {
  const { world } = ctx;
  const h = world.hero;
  const dashing = isDashing(ctx);
  const ms = world.monsters.filter((m) => !m.dead);
  for (let i = 0; i < ms.length; i++) {
    const a = ms[i];
    for (let j = i + 1; j < ms.length; j++) {
      const b = ms[j];
      const d = dist(a.x, a.y, b.x, b.y);
      const overlap = a.radius + b.radius - d;
      if (overlap <= 0) continue;
      const n = d > 1e-6 ? { x: (b.x - a.x) / d, y: (b.y - a.y) / d } : { x: 1, y: 0 };
      const wa = b.kind === 'boss' ? 1 : a.kind === 'boss' ? 0 : 0.5;
      a.x -= n.x * overlap * wa;
      a.y -= n.y * overlap * wa;
      b.x += n.x * overlap * (1 - wa);
      b.y += n.y * overlap * (1 - wa);
    }
    // A dashing hero slips through foes.
    if (dashing) continue;
    const d = dist(h.x, h.y, a.x, a.y);
    const overlap = a.radius + h.radius - d;
    if (overlap > 0) {
      const n = d > 1e-6 ? { x: (a.x - h.x) / d, y: (a.y - h.y) / d } : { x: 0, y: -1 };
      const heroShare = a.kind === 'boss' ? 0.8 : 0.2;
      a.x += n.x * overlap * (1 - heroShare);
      a.y += n.y * overlap * (1 - heroShare);
      h.x -= n.x * overlap * heroShare;
      h.y -= n.y * overlap * heroShare;
    }
  }
  for (const m of ms) {
    m.x = clamp(m.x, m.radius, world.width - m.radius);
    m.y = clamp(m.y, m.radius, world.height - m.radius);
  }
  h.x = clamp(h.x, h.radius, world.width - h.radius);
  h.y = clamp(h.y, h.radius, world.height - h.radius);
}

function dropsTick(ctx: SimCtx, dt: number): void {
  const { world, bal } = ctx;
  const h = world.hero;
  for (const d of world.drops) {
    if (d.dead) continue;
    const gap = dist(h.x, h.y, d.x, d.y);
    const magnet = d.kind !== 'item' && gap < bal.hero.magnetRadius;
    if (d.vacuum || magnet) {
      const dir = dirTo(d.x, d.y, h.x, h.y);
      const speed = d.vacuum ? 18 : 10;
      const stepLen = Math.min(gap, speed * dt);
      d.x += dir.x * stepLen;
      d.y += dir.y * stepLen;
    }
    if (world.t - d.born < ITEM_PICKUP_DELAY) continue;
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
    }
    ctx.events.push({
      kind: 'pickup',
      dropId: d.id,
      dropKind: d.kind,
      item: d.item,
      amount: d.amount,
      mana: d.mana,
    });
  }
}
