import type { DataRegistry } from '../data/registry.js';
import type { ArpgEvent, ArpgInput, ArpgWorld, MonsterEntity, Projectile, StatusId, Vec } from '../types/arpg.js';
import type { ManaType } from '../types/mana.js';
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
import { angleBetween, clamp, clampLen, dirTo, dist } from './geometry.js';
import { castAbility, castTick } from './abilities/cast.js';
import { defendingAbility, defendTick, gainCharge } from './abilities/defend.js';
import { impact } from './abilities/impact.js';
import { alive, nearestMonster, spawnProjectile } from './abilities/targeting.js';
import { createMonsterEntity } from './world.js';

const BASIC_STATUS: Record<ManaType, StatusId> = {
  fire: 'burn',
  frost: 'chill',
  storm: 'shock',
  earth: 'stagger',
  shadow: 'hex',
  nature: 'poison',
};
const BASIC_STATUS_CHANCE = 0.3;
const ITEM_PICKUP_DELAY = 0.35;

/**
 * Advance the world by `dt` real seconds using fixed simulation steps.
 * Movement input applies to every step; cast/potion inputs queue for the next
 * step, so a tap is never lost between frames. Returns what happened.
 */
export function stepWorld(registry: DataRegistry, world: ArpgWorld, input: ArpgInput, dt: number): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  if (input.cast) world.queuedCast = input.cast;
  if (input.potion) world.queuedPotion = true;
  if (world.heroDead) return events;

  const ctx = makeCtx(registry, world, events);
  const step = ctx.bal.arena.step;
  world.accumulator += Math.min(Math.max(0, dt), 0.25);
  let n = 0;
  while (world.accumulator >= step - 1e-9 && n < 12) {
    world.accumulator -= step;
    n++;
    tick(ctx, input.move, step);
    if (world.heroDead) break;
  }
  return events;
}

function tick(ctx: SimCtx, move: Vec, dt: number): void {
  const { world } = ctx;
  world.t += dt;
  heroTick(ctx, move, dt);
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

function heroTick(ctx: SimCtx, move: Vec, dt: number): void {
  const { world, bal } = ctx;
  const h = world.hero;

  if (world.queuedPotion) {
    world.queuedPotion = false;
    if (h.potions > 0 && h.hp < h.stats.maxHp) {
      h.potions--;
      healHero(ctx, h.stats.maxHp * bal.dive.potionHeal, 'potion');
    }
  }
  if (world.queuedCast !== null) {
    const cast = world.queuedCast;
    world.queuedCast = null;
    castAbility(ctx, cast);
  }
  castTick(ctx);

  const surge = h.defend?.form === 'surge' ? defendingAbility(ctx) : null;
  const v = clampLen(move);
  const speed = Math.hypot(v.x, v.y);
  h.moving = speed > 0.05 && !h.windup;
  if (h.moving) {
    const pace = h.stats.moveSpeed * (surge ? 1 + bal.abilities.defend.surgeMove : 1);
    h.x = clamp(h.x + v.x * pace * dt, h.radius, world.width - h.radius);
    h.y = clamp(h.y + v.y * pace * dt, h.radius, world.height - h.radius);
    h.facing = { x: v.x / speed, y: v.y / speed };
  }

  if (!h.windup) basicAttack(ctx);

  h.mana = Math.min(h.manaMax, h.mana + h.manaRegen * dt);
  if (!nearestMonster(ctx, h.x, h.y, bal.abilities.lullRadius)) gainCharge(ctx, bal.abilities.lullCharge * dt);
  defendTick(ctx, dt);
}

function basicAttack(ctx: SimCtx): void {
  const { world, bal } = ctx;
  const h = world.hero;
  if (world.t < h.nextAttackAt) return;
  const w = h.stats.weapon;
  const target = nearestMonster(ctx, h.x, h.y, w.range);
  if (!target) return;

  const dir = dirTo(h.x, h.y, target.x, target.y);
  if (!h.moving) h.facing = dir;
  h.attackCount++;
  const surge = h.defend?.form === 'surge' ? defendingAbility(ctx) : null;
  // Melee weapons swing a three-hit combo: the third is wider and harder, with a shove.
  const finisher = w.kind === 'melee' && h.attackCount % 3 === 0;
  const base = h.stats.weaponDamage * h.stats.damageMult * (finisher ? 1.5 : 1);
  const twin = (h.stats.legendaries.twin_fang ?? 0) > 0 && h.attackCount % 3 === 0;
  const element = w.element;
  const applies: StatusId[] = surge ? [...surge.knobs.applies] : [];
  if (element) {
    const chance = element === 'earth' ? BASIC_STATUS_CHANCE * 0.6 : BASIC_STATUS_CHANCE;
    const status = BASIC_STATUS[element];
    if (!applies.includes(status) && world.rng.next() < chance) applies.push(status);
  }

  if (w.kind === 'melee') {
    const crit = world.rng.next() < h.stats.critChance;
    const arc = finisher ? Math.min(360, w.arc + 60) : w.arc;
    const halfArc = (arc * Math.PI) / 360;
    const kb = finisher ? { knockback: 0.5, kbFrom: { x: h.x, y: h.y } } : {};
    for (const m of alive(ctx)) {
      if (dist(h.x, h.y, m.x, m.y) - m.radius > w.range) continue;
      if (arc < 360 && m.id !== target.id && angleBetween(dir, dirTo(h.x, h.y, m.x, m.y)) > halfArc) continue;
      hitMonster(ctx, m, base, element, { source: 'basic', crit, applies, ...kb });
      if (twin) hitMonster(ctx, m, base * (h.stats.legendaries.twin_fang / 100), element, { source: 'basic', crit });
    }
  } else {
    const shots = twin ? 2 : 1;
    for (let i = 0; i < shots; i++) {
      const spread = i === 0 ? 0 : 0.12;
      const d = { x: dir.x * Math.cos(spread) - dir.y * Math.sin(spread), y: dir.x * Math.sin(spread) + dir.y * Math.cos(spread) };
      spawnProjectile(ctx, {
        owner: 'hero',
        form: null,
        ability: null,
        homingId: null,
        x: h.x + d.x * 0.5,
        y: h.y + d.y * 0.5,
        vx: d.x * w.speed,
        vy: d.y * w.speed,
        radius: 0.3,
        damage: i === 0 ? base : base * (h.stats.legendaries.twin_fang / 100),
        element,
        pierce: w.pierce,
        maxDist: w.range + 1.5,
        explodeRadius: 0,
        applies,
        knockback: 0,
      });
    }
  }
  ctx.events.push({ kind: 'basic', x: h.x, y: h.y, tx: target.x, ty: target.y, element, melee: w.kind === 'melee' });

  h.mana = Math.min(h.manaMax, h.mana + bal.mana.basicAttackGain);
  h.nextAttackAt = world.t + h.stats.attackInterval / (surge ? 1 + surge.effect : 1);
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
      } else if (expired) p.dead = true;
      continue;
    }

    const from = { x: p.x - p.vx, y: p.y - p.vy };
    for (const m of world.monsters) {
      if (p.dead) break;
      if (m.dead || p.hitIds.includes(m.id)) continue;
      if (dist(p.x, p.y, m.x, m.y) > p.radius + m.radius) continue;
      p.hitIds.push(m.id);
      if (p.ability) impact(ctx, p.ability, p.x, p.y, p.explodeRadius, p.damage, { from, tick: p.form === 'ember' });
      else hitMonster(ctx, m, p.damage, p.element, { source: 'basic', canCrit: true, applies: p.applies });
      if (!p.pierce) p.dead = true;
    }
    if (!p.dead && expired) {
      p.dead = true;
      // A bolt that reaches the end of its flight bursts on the ground.
      if (p.ability && !p.pierce && p.form !== 'volley') {
        impact(ctx, p.ability, p.x, p.y, p.explodeRadius, p.damage, { from, tick: p.form === 'ember' });
      }
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
        if (dist(h.x, h.y, z.x, z.y) <= z.radius + h.radius) hurtHero(ctx, z.damage, z.element, null);
      }
      continue;
    }
    // Barrage impacts land once.
    if (z.detonateAt > 0) {
      if (world.t >= z.detonateAt) {
        z.dead = true;
        if (z.ability) impact(ctx, z.ability, z.x, z.y, z.radius, z.damage);
      }
      continue;
    }
    if (world.t >= z.until) {
      z.dead = true;
      continue;
    }
    if (world.t < z.nextTick) continue;
    z.nextTick += z.tick;
    if (z.ability) impact(ctx, z.ability, z.x, z.y, z.radius, z.damage, { tick: true, silent: true });
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
      hitMonster(ctx, m, s.poisonDps * s.poisonStacks * 0.5, 'nature', { source: 'dot', noReact: true });
      if (m.dead) continue;
    }
    if (m.traits.includes('regenerating')) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * bal.monster.traits.regenPerSecond * dt);

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
          }
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
    ctx.events.push({ kind: 'pickup', dropId: d.id, dropKind: d.kind, item: d.item, amount: d.amount, mana: d.mana });
  }
}
