import type { MonsterEntity, Projectile, SkillDef, StatusId, Vec } from '../types/arpg.js';
import type { ManaType } from '../types/mana.js';
import { attunementPower, hasMastery, skillCost } from '../delve/hero-stats.js';
import { hitMonster, killMonster, isFrozen, type SimCtx } from './combat.js';
import { clamp, dirTo, dist, distToSegment } from './geometry.js';

// ── Targeting ──────────────────────────────────────────────────────────────

export function alive(ctx: SimCtx): MonsterEntity[] {
  return ctx.world.monsters.filter((m) => !m.dead);
}

/** Nearest living monster whose edge is within `range` of (x, y). */
export function nearestMonster(
  ctx: SimCtx,
  x: number,
  y: number,
  range: number,
  exclude?: Set<number>,
): MonsterEntity | null {
  let best: MonsterEntity | null = null;
  let bestD = Infinity;
  for (const m of ctx.world.monsters) {
    if (m.dead || exclude?.has(m.id)) continue;
    const d = dist(x, y, m.x, m.y) - m.radius;
    if (d <= range && d < bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

/** The in-range monster whose surroundings hold the most foes (for area spells). */
export function bestCluster(ctx: SimCtx, range: number, radius: number): MonsterEntity | null {
  const h = ctx.world.hero;
  const candidates = alive(ctx).filter((m) => dist(h.x, h.y, m.x, m.y) - m.radius <= range);
  let best: MonsterEntity | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    let score = 0;
    for (const o of candidates) if (dist(c.x, c.y, o.x, o.y) <= radius + o.radius) score += o.kind === 'normal' ? 1 : 2;
    score -= dist(h.x, h.y, c.x, c.y) * 0.01;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

// ── Spell damage ───────────────────────────────────────────────────────────

/** Damage of one spell hit before per-target modifiers. */
export function spellBase(ctx: SimCtx, skill: SkillDef, power = skill.power): number {
  const s = ctx.world.hero.stats;
  return s.weaponDamage * s.damageMult * power * attunementPower(skill, s.attunement, ctx.registry);
}

function hitArea(
  ctx: SimCtx,
  x: number,
  y: number,
  radius: number,
  amount: number,
  element: ManaType,
  applies: StatusId[] = [],
  knockback = 0,
): number {
  let n = 0;
  for (const m of alive(ctx)) {
    if (dist(x, y, m.x, m.y) > radius + m.radius) continue;
    hitMonster(ctx, m, amount, element, {
      source: 'skill',
      canCrit: true,
      applies,
      knockback,
      kbFrom: { x, y },
    });
    n++;
  }
  return n;
}

export function spawnProjectile(ctx: SimCtx, p: Omit<Projectile, 'id' | 'hitIds' | 'traveled' | 'dead'>): Projectile {
  const proj: Projectile = { ...p, id: ctx.world.nextId++, hitIds: [], traveled: 0, dead: false };
  ctx.world.projectiles.push(proj);
  return proj;
}

/** Strike a chain of foes, starting with `first`. Returns the points for the lightning VFX. */
export function chainHits(
  ctx: SimCtx,
  first: MonsterEntity,
  jumps: number,
  range: number,
  amount: number,
  element: ManaType,
  applies: StatusId[],
  from: Vec,
): Vec[] {
  const points: Vec[] = [{ x: from.x, y: from.y }];
  const hit = new Set<number>();
  let current: MonsterEntity | null = first;
  for (let i = 0; i <= jumps && current; i++) {
    hit.add(current.id);
    points.push({ x: current.x, y: current.y });
    const { x, y } = current;
    hitMonster(ctx, current, amount, element, { source: 'skill', canCrit: true, applies });
    current = nearestMonster(ctx, x, y, range, hit);
  }
  return points;
}

function extraChains(ctx: SimCtx): number {
  return hasMastery(ctx.registry, ctx.world.hero.stats.attunement, 'storm') ? 2 : 0;
}

// ── Casting ────────────────────────────────────────────────────────────────

/** Aim point for a directional spell: the nearest foe in range, else straight ahead. */
function aimDir(ctx: SimCtx, range: number): { dir: Vec; target: MonsterEntity | null } {
  const h = ctx.world.hero;
  const target = nearestMonster(ctx, h.x, h.y, range + 1);
  if (target) return { dir: dirTo(h.x, h.y, target.x, target.y), target };
  return { dir: { ...h.facing }, target: null };
}

function executeSkill(ctx: SimCtx, skill: SkillDef): { ok: boolean; tx: number; ty: number } {
  const { world } = ctx;
  const h = world.hero;
  const L = h.stats.legendaries;
  const range = skill.range ?? 8;
  const radius = skill.radius ?? 2;
  const applies = skill.applies ?? [];
  const fail = { ok: false, tx: h.x, ty: h.y };

  switch (skill.id) {
    case 'fireball':
    case 'boulder':
    case 'plasma_orb':
    case 'void_bolt': {
      const { dir } = aimDir(ctx, range);
      if (dir.x === 0 && dir.y === 0) return fail;
      const big = skill.id === 'boulder' && L.bedrock ? 1.4 : 1;
      spawnProjectile(ctx, {
        owner: 'hero',
        skillId: skill.id,
        x: h.x + dir.x * 0.6,
        y: h.y + dir.y * 0.6,
        vx: dir.x * (skill.speed ?? 10),
        vy: dir.y * (skill.speed ?? 10),
        radius: skill.id === 'boulder' ? radius * big : skill.id === 'plasma_orb' ? 0.6 : 0.4,
        damage: spellBase(ctx, skill),
        element: skill.id === 'boulder' ? 'earth' : skill.id === 'void_bolt' ? 'storm' : 'fire',
        pierce: !!skill.pierce,
        maxDist: range,
        explodeRadius: skill.id === 'fireball' || skill.id === 'plasma_orb' ? radius : 0,
        applies: skill.id === 'boulder' && L.bedrock ? ['stagger'] : applies,
        knockback: skill.knockback ?? 0,
        nextPulse: world.t + (skill.tick ?? 0.3),
      });
      h.facing = dir;
      return { ok: true, tx: h.x + dir.x * range, ty: h.y + dir.y * range };
    }

    case 'frost_nova':
    case 'steam_burst': {
      const element: ManaType = skill.id === 'frost_nova' ? 'frost' : 'fire';
      hitArea(ctx, h.x, h.y, radius, spellBase(ctx, skill), element, applies);
      ctx.events.push({ kind: 'explode', x: h.x, y: h.y, radius, element: skill.id === 'frost_nova' ? 'frost' : 'fire' });
      if (skill.id === 'frost_nova' && L.rimeheart) {
        world.zones.push({
          id: world.nextId++,
          owner: 'hero',
          skillId: 'rimeheart',
          x: h.x,
          y: h.y,
          radius,
          born: world.t,
          until: world.t + 3,
          tick: 0.5,
          nextTick: world.t + 0.5,
          damage: spellBase(ctx, skill, 0.15),
          element: 'frost',
          applies: ['chill'],
          detonateAt: 0,
          dead: false,
        });
      }
      return { ok: true, tx: h.x, ty: h.y };
    }

    case 'chain_lightning': {
      const first = nearestMonster(ctx, h.x, h.y, range);
      if (!first) return fail;
      const jumps = (skill.chains ?? 4) + Math.round(L.stormcaller ?? 0) + extraChains(ctx);
      const points = chainHits(ctx, first, jumps, skill.chainRange ?? 4, spellBase(ctx, skill), 'storm', applies, h);
      ctx.events.push({ kind: 'chain', points, element: 'storm' });
      h.facing = dirTo(h.x, h.y, first.x, first.y);
      return { ok: true, tx: first.x, ty: first.y };
    }

    case 'shadow_step': {
      const target = nearestMonster(ctx, h.x, h.y, range);
      const fromX = h.x;
      const fromY = h.y;
      let dir: Vec;
      if (target) {
        dir = dirTo(h.x, h.y, target.x, target.y);
        const stop = target.radius + h.radius + 0.15;
        h.x = target.x - dir.x * stop;
        h.y = target.y - dir.y * stop;
        hitMonster(ctx, target, spellBase(ctx, skill), 'shadow', { source: 'skill', canCrit: true, applies });
      } else {
        dir = { ...h.facing };
        h.x += dir.x * 4;
        h.y += dir.y * 4;
      }
      h.x = clamp(h.x, h.radius, world.width - h.radius);
      h.y = clamp(h.y, h.radius, world.height - h.radius);
      h.facing = dir;
      h.invulnUntil = Math.max(h.invulnUntil, world.t + 0.5);
      ctx.events.push({ kind: 'dash', fromX, fromY, toX: h.x, toY: h.y });
      return { ok: true, tx: h.x, ty: h.y };
    }

    case 'magma_eruption':
    case 'blizzard':
    case 'magnet_quake': {
      const target = bestCluster(ctx, range, radius);
      if (!target) return fail;
      const cx = target.x;
      const cy = target.y;
      if (skill.pull) {
        for (const m of alive(ctx)) {
          const d = dist(cx, cy, m.x, m.y);
          if (d > 5.5 || m.kind === 'boss') continue;
          m.x = cx + (m.x - cx) * 0.25;
          m.y = cy + (m.y - cy) * 0.25;
        }
      }
      const element: ManaType = skill.id === 'blizzard' ? 'frost' : 'earth';
      hitArea(ctx, cx, cy, radius, spellBase(ctx, skill), element, skill.id === 'magma_eruption' ? [] : applies, skill.knockback ?? 0);
      ctx.events.push({ kind: 'explode', x: cx, y: cy, radius, element });
      if (skill.duration && skill.tick) {
        world.zones.push({
          id: world.nextId++,
          owner: 'hero',
          skillId: skill.id,
          x: cx,
          y: cy,
          radius,
          born: world.t,
          until: world.t + skill.duration,
          tick: skill.tick,
          nextTick: world.t + skill.tick,
          damage: spellBase(ctx, skill, skill.tickPower ?? 0.2),
          element: skill.id === 'magma_eruption' ? 'fire' : 'frost',
          applies: skill.id === 'magma_eruption' ? ['burn'] : ['chill'],
          detonateAt: 0,
          dead: false,
        });
      }
      return { ok: true, tx: cx, ty: cy };
    }

    case 'glacial_spikes': {
      const { dir } = aimDir(ctx, range);
      if (dir.x === 0 && dir.y === 0) return fail;
      const ex = h.x + dir.x * range;
      const ey = h.y + dir.y * range;
      for (const m of alive(ctx)) {
        if (distToSegment(m.x, m.y, h.x, h.y, ex, ey) > radius + m.radius) continue;
        hitMonster(ctx, m, spellBase(ctx, skill), 'earth', {
          source: 'skill',
          canCrit: true,
          applies,
          knockback: skill.knockback ?? 0,
          kbFrom: { x: h.x, y: h.y },
        });
      }
      h.facing = dir;
      return { ok: true, tx: ex, ty: ey };
    }

    case 'hellfire_brand':
    case 'soul_freeze': {
      const target = bestCluster(ctx, range, radius);
      if (!target) return fail;
      const cx = target.x;
      const cy = target.y;
      hitArea(ctx, cx, cy, radius, spellBase(ctx, skill), 'shadow', applies);
      ctx.events.push({ kind: 'explode', x: cx, y: cy, radius, element: skill.id === 'soul_freeze' ? 'frost' : 'shadow' });
      if (skill.execute) {
        for (const m of alive(ctx)) {
          if (m.kind === 'boss' || dist(cx, cy, m.x, m.y) > radius + m.radius) continue;
          if (isFrozen(ctx, m) && m.hp / m.maxHp <= skill.execute) {
            ctx.events.push({ kind: 'hit', id: m.id, x: m.x, y: m.y, amount: m.hp, crit: true, element: 'frost', reaction: 'shatter' });
            killMonster(ctx, m);
          }
        }
      }
      return { ok: true, tx: cx, ty: cy };
    }

    case 'grave_golem': {
      for (const s of world.summons) s.dead = true;
      const id = world.nextId++;
      world.summons.push({
        id,
        x: clamp(h.x + h.facing.x * 1.4, 1, world.width - 1),
        y: clamp(h.y + h.facing.y * 1.4, 1, world.height - 1),
        radius: skill.radius ?? 0.9,
        hp: h.stats.maxHp * 0.6,
        maxHp: h.stats.maxHp * 0.6,
        until: world.t + (skill.duration ?? 12),
        damage: spellBase(ctx, skill),
        nextAttackAt: world.t + 0.5,
        dead: false,
      });
      ctx.events.push({ kind: 'summon', id });
      return { ok: true, tx: h.x, ty: h.y };
    }
  }
  return fail;
}

/**
 * Cast the spell in an action-bar slot. Fails (no mana spent) when it's on
 * cooldown, unaffordable, or has nothing to hit.
 */
export function castSkill(ctx: SimCtx, slot: number): boolean {
  const { world } = ctx;
  const h = world.hero;
  const id = h.skillSlots[slot];
  if (!id) return false;
  const skill = ctx.registry.getSkill(id);
  if (world.t < (h.cooldowns[id] ?? 0)) return false;
  const cost = skillCost(skill, h.stats);
  for (const [mana, amount] of Object.entries(cost) as [ManaType, number][]) {
    if (h.mana[mana] < amount) {
      ctx.events.push({ kind: 'noMana', skillId: id });
      return false;
    }
  }
  const res = executeSkill(ctx, skill);
  if (!res.ok) return false;
  for (const [mana, amount] of Object.entries(cost) as [ManaType, number][]) h.mana[mana] -= amount;
  h.cooldowns[id] = world.t + skill.cooldown * h.stats.cooldownMult;
  ctx.events.push({ kind: 'cast', skillId: id, x: h.x, y: h.y, tx: res.tx, ty: res.ty });
  return true;
}

/** Can the slot be cast right now (ignoring targets)? For UI and bots. */
export function slotReady(ctx: SimCtx, slot: number): boolean {
  const h = ctx.world.hero;
  const id = h.skillSlots[slot];
  if (!id) return false;
  if (ctx.world.t < (h.cooldowns[id] ?? 0)) return false;
  const cost = skillCost(ctx.registry.getSkill(id), h.stats);
  return (Object.entries(cost) as [ManaType, number][]).every(([m, c]) => h.mana[m] >= c);
}
