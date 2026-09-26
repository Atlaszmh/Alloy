import type { MonsterEntity, Projectile, StatusId, Vec } from '../types/arpg.js';
import type { ManaType } from '../types/mana.js';
import { hitMonster, type SimCtx } from './combat.js';
import { angleBetween, dirTo, dist } from './geometry.js';
import { startPush } from './action.js';
import { defendingAbility } from './abilities/defend.js';
import { alive, nearestMonster, spawnProjectile } from './abilities/targeting.js';

/**
 * The basic attack: each blow of the weapon's string has a startup (a
 * committed melee blow lunges in), a strike, and a recovery that slows
 * movement. See the combat weight spec.
 */

const BASIC_STATUS: Record<ManaType, StatusId> = {
  fire: 'burn',
  frost: 'chill',
  storm: 'shock',
  earth: 'stagger',
  shadow: 'hex',
  nature: 'poison',
};
const BASIC_STATUS_CHANCE = 0.3;

function haste(ctx: SimCtx): number {
  const surge = ctx.world.hero.defend?.form === 'surge' ? defendingAbility(ctx) : null;
  return surge ? 1 + surge.effect : 1;
}

/** The nearest foe within `range` inside the arc around `dir` (where a manual lunge stops). */
function foeAhead(ctx: SimCtx, dir: Vec, range: number, arcDeg: number): MonsterEntity | null {
  const h = ctx.world.hero;
  const half = (arcDeg * Math.PI) / 360;
  let best: MonsterEntity | null = null;
  let bestD = Infinity;
  for (const m of alive(ctx)) {
    const d = dist(h.x, h.y, m.x, m.y) - m.radius;
    if (d > range || d >= bestD) continue;
    if (arcDeg < 360 && angleBetween(dir, dirTo(h.x, h.y, m.x, m.y)) > half) continue;
    best = m;
    bestD = d;
  }
  return best;
}

/**
 * Start the next blow of the string when the weapon is ready. Automatic
 * (`aim` undefined): only at a foe in reach, committing only while the hero
 * stands still. Manual: toward `aim` if given, else the nearest foe in reach,
 * else straight ahead; always committed. Returns whether a swing started.
 */
export function startSwing(ctx: SimCtx, aim: Vec | null | undefined, standing: boolean): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const t = world.t;
  if (t < h.nextAttackAt) return false;
  const w = h.stats.weapon;
  const manual = aim !== undefined;
  const committed = manual || standing;
  if (t - h.lastBasicAt > h.stats.attackInterval + bal.hero.basicComboGrace) h.attackCount = 0;
  const step = h.attackCount % w.combo.length;
  const s = w.combo[step];
  const melee = w.kind === 'melee';
  const lunge = melee && committed ? Math.max(0, s.step) : 0;
  const reach = w.range + (melee ? (s.reach ?? 0) : 0);
  const acquire = (committed ? reach + lunge : w.range) + (manual ? 1 : 0);
  const target = aim ? null : nearestMonster(ctx, h.x, h.y, acquire);
  if (!target && !manual) return false;

  let dir = aim
    ? dirTo(h.x, h.y, aim.x, aim.y)
    : target
      ? dirTo(h.x, h.y, target.x, target.y)
      : { ...h.facing };
  if (dir.x === 0 && dir.y === 0) dir = { ...h.facing };
  if (committed || !h.moving) h.facing = dir;
  const cycle = (h.stats.attackInterval * s.time) / haste(ctx);
  const startup = cycle * s.startup;
  h.swing = { step, dir, targetId: target?.id ?? null, start: t, strikeAt: t + startup, committed };
  h.nextAttackAt = t + cycle;
  h.recoverUntil = t;
  h.push = null;
  if (lunge > 0) {
    const foe = target ?? foeAhead(ctx, dir, reach + lunge, melee ? (s.arc ?? w.arc) : 360);
    startPush(ctx, dir, lunge, startup, foe?.id ?? null);
  }
  return true;
}

/** Land the swing's blow from where the hero stands now. */
export function strike(ctx: SimCtx): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const sw = h.swing;
  if (!sw) return;
  h.swing = null;
  h.push = null;
  const w = h.stats.weapon;
  const s = w.combo[sw.step];
  const last = sw.step === w.combo.length - 1;
  h.attackCount++;
  h.lastBasicAt = world.t;

  const surge = h.defend?.form === 'surge' ? defendingAbility(ctx) : null;
  const unit = h.stats.weaponDamage * h.stats.damageMult;
  const base = unit * s.power;
  const twinPct = (h.stats.legendaries.twin_fang ?? 0) / 100;
  const twin = twinPct > 0 && last;
  const element = w.element;
  const applies: StatusId[] = surge ? [...surge.knobs.applies] : [];
  if (element) {
    const chance = element === 'earth' ? BASIC_STATUS_CHANCE * 0.6 : BASIC_STATUS_CHANCE;
    const status = BASIC_STATUS[element];
    if (!applies.includes(status) && world.rng.next() < chance) applies.push(status);
  }
  if (s.stagger && !applies.includes('stagger')) applies.push('stagger');
  const dir = sw.dir;

  // Mana only for an attack at something: a blow that connects, or a shot with a foe in range.
  let landed = w.kind !== 'melee' && !!nearestMonster(ctx, h.x, h.y, w.range);
  if (w.kind === 'melee') {
    const crit = world.rng.next() < h.stats.critChance;
    const arc = s.arc ?? w.arc;
    const reach = w.range + (s.reach ?? 0);
    const halfArc = (arc * Math.PI) / 360;
    const kb = s.knockback ? { knockback: s.knockback, kbFrom: { x: h.x, y: h.y } } : {};
    for (const m of alive(ctx)) {
      if (dist(h.x, h.y, m.x, m.y) - m.radius > reach) continue;
      if (
        arc < 360 &&
        m.id !== sw.targetId &&
        angleBetween(dir, dirTo(h.x, h.y, m.x, m.y)) > halfArc
      )
        continue;
      landed = true;
      hitMonster(ctx, m, base, element, { source: 'basic', crit, applies, heft: s.heft, ...kb });
      // Twin Fang: today's finisher value (×1.5) on melee.
      if (twin)
        hitMonster(ctx, m, unit * 1.5 * twinPct, element, { source: 'basic', crit, heft: s.heft });
    }
  } else {
    const size = s.size ?? 1;
    const speed = w.speed * (s.speed ?? 1);
    for (let i = 0; i < (twin ? 2 : 1); i++) {
      const spread = i === 0 ? 0 : 0.12;
      const d = {
        x: dir.x * Math.cos(spread) - dir.y * Math.sin(spread),
        y: dir.x * Math.sin(spread) + dir.y * Math.cos(spread),
      };
      spawnProjectile(ctx, {
        owner: 'hero',
        form: null,
        ability: null,
        homingId: null,
        x: h.x + d.x * 0.5,
        y: h.y + d.y * 0.5,
        vx: d.x * speed,
        vy: d.y * speed,
        radius: 0.3 * size,
        // Twin Fang's extra shot: today's value (×1.0) and never an explosion.
        damage: i === 0 ? base : unit * twinPct,
        element,
        pierce: w.pierce,
        maxDist: w.range + 1.5,
        explodeRadius: i === 0 ? (s.explode ?? 0) : 0,
        applies,
        knockback: 0,
        heft: s.heft,
      });
    }
    if (sw.committed && s.step < 0)
      startPush(ctx, { x: -dir.x, y: -dir.y }, -s.step, bal.feel.recoilSeconds);
  }

  const tgt =
    sw.targetId !== null ? world.monsters.find((m) => m.id === sw.targetId && !m.dead) : null;
  ctx.events.push({
    kind: 'basic',
    x: h.x,
    y: h.y,
    tx: tgt ? tgt.x : h.x + dir.x * w.range,
    ty: tgt ? tgt.y : h.y + dir.y * w.range,
    element,
    melee: w.kind === 'melee',
    heft: s.heft,
    step: sw.step,
    dir,
    finisher: last,
  });
  if (landed) h.mana = Math.min(h.manaMax, h.mana + bal.mana.basicAttackGain);
  if (sw.committed)
    h.recoverUntil = Math.min(
      h.nextAttackAt,
      world.t + (h.nextAttackAt - sw.start) * bal.feel.basicRecovery,
    );
}

/** A basic shot with an explosion bursts over every foe around it (each once). */
export function burstShot(ctx: SimCtx, p: Projectile): void {
  p.dead = true;
  ctx.events.push({ kind: 'explode', x: p.x, y: p.y, radius: p.explodeRadius, element: p.element });
  for (const m of alive(ctx)) {
    if (dist(p.x, p.y, m.x, m.y) > p.explodeRadius + m.radius) continue;
    hitMonster(ctx, m, p.damage, p.element, {
      source: 'basic',
      canCrit: true,
      applies: p.applies,
      heft: p.heft ?? 0,
    });
  }
}
