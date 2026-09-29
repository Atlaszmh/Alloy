import type { HeroEntity, MonsterEntity, Projectile, StatusId, Vec } from '../types/arpg.js';
import { HOLD_STAGE_KINDS } from '../types/ability.js';
import type { DelveBalance } from '../types/delve.js';
import { BASIC_STATUS, hitMonster, type SimCtx } from './combat.js';
import { angleBetween, dirTo, dist } from './geometry.js';
import { startPush } from './action.js';
import { holdCharge } from './abilities/cast.js';
import { surging } from './abilities/defend.js';
import { alive, nearestMonster, spawnProjectile } from './abilities/targeting.js';

/**
 * The basic attack: each blow of the hero's basic chain (its kind's row, in
 * its element) has a startup (a committed melee blow lunges in), a strike,
 * and a recovery that slows movement. See the combat weight and the moves and
 * chains specs.
 */

function haste(ctx: SimCtx): number {
  const surge = surging(ctx);
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

/** The blow of the basic chain the next swing makes: the chain restarts after a pause. */
export function basicStep(h: HeroEntity, t: number, bal: DelveBalance): number {
  if (t - h.lastBasicAt > h.stats.attackInterval + bal.hero.basicComboGrace) return 0;
  return h.attackCount % h.stats.weapon.blows.length;
}

/**
 * Start the next blow of the chain when the weapon is ready. Automatic: only
 * at a foe in reach. Manual: toward `aim` if given, else the nearest foe in
 * reach, else straight ahead. A committed swing roots the hero, lunges and
 * ends any recovery; a manual hold blow starts as a medium one (it holds at
 * its strike point: see `basicHoldTick`). Returns whether a swing started.
 */
export function startSwing(
  ctx: SimCtx,
  manual: boolean,
  committed: boolean,
  aim: Vec | null = null,
): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const t = world.t;
  if (t < h.nextAttackAt) return false;
  const w = h.stats.weapon;
  const step = basicStep(h, t, bal);
  h.attackCount = step;
  const blow = w.blows[step];
  const s = manual && blow.kind === 'hold' ? w.feel.medium : blow;
  const melee = w.kind === 'melee';
  const lunge = melee && committed ? Math.max(0, s.move) : 0;
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
  h.swing = {
    step,
    dir,
    targetId: target?.id ?? null,
    start: t,
    strikeAt: t + startup,
    cycle,
    committed,
    held: null,
  };
  h.nextAttackAt = t + cycle;
  // An automatic swing on the move leaves an ability's recovery alone.
  if (committed) h.recoverUntil = t;
  if (lunge > 0) {
    const foe = target ?? foeAhead(ctx, dir, reach + lunge, s.arc ?? w.arc);
    // Planted for the first part of the startup, then the lunge.
    const hold = startup * bal.feel.lungeHold;
    startPush(ctx, dir, lunge, startup - hold, foe?.id ?? null, hold);
  }
  return true;
}

/**
 * A manual hold blow at its strike point: while the attack stays held it
 * charges (stages by `holdStages`, saying so), and it strikes with its
 * stage's row when the attack lets go or at `holdMax` (stage 2).
 */
export function basicHoldTick(ctx: SimCtx, held: boolean, dt: number): void {
  const { world, bal } = ctx;
  const sw = world.hero.swing!;
  const t = world.t;
  sw.held ??= t;
  const { stage } = holdCharge(bal, sw.held, t);
  if (t - sw.held >= bal.chains.holdMax - 1e-9) return strike(ctx, 2);
  if (!held) return strike(ctx, stage);
  if (stage > holdCharge(bal, sw.held, t - dt).stage)
    ctx.events.push({ kind: 'holdStage', slot: null, stage });
}

/**
 * Land the swing's blow from where the hero stands now: in its element, with
 * its power and its kind's stacks. A held blow (`stage`) strikes with that
 * stage's row (medium, heavy, hold) and takes its time from it.
 */
export function strike(ctx: SimCtx, stage: number | null = null): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const sw = h.swing;
  if (!sw) return;
  h.swing = null;
  const w = h.stats.weapon;
  const blow = w.blows[sw.step];
  const kind = stage === null ? blow.kind : HOLD_STAGE_KINDS[stage];
  const s = stage === null ? blow : w.feel[kind];
  // The lunge belongs to the swing and ends with it (no other push runs during a swing).
  h.push = null;
  const last = sw.step === w.blows.length - 1;
  h.attackCount++;
  h.lastBasicAt = world.t;

  const surge = surging(ctx);
  const element = blow.element;
  const unit = h.stats.weaponDamage * h.stats.damageMult * blow.attunePower;
  const base = unit * s.power;
  const twinPct = (h.stats.legendaries.twin_fang ?? 0) / 100;
  const twin = twinPct > 0 && last;
  // Every blow applies its element's stacks, by its kind (a Surge's statuses ride along).
  const applies: StatusId[] = surge ? [...surge.knobs.applies] : [];
  if (!applies.includes(BASIC_STATUS[element])) applies.push(BASIC_STATUS[element]);
  if (s.stagger && !applies.includes('stagger')) applies.push('stagger');
  const stacks = bal.stacks.basicByKind[kind];
  // An Earth blow or an Earth Surge's statuses: its stagger adds Earth stacks.
  const rattles = element === 'earth' || !!surge?.elements.includes('earth');
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
      hitMonster(ctx, m, base, element, {
        source: 'basic',
        crit,
        applies,
        heft: s.heft,
        rattles,
        stacks,
        ...kb,
      });
      // Twin Fang: today's finisher value (×1.5) on melee; it applies no stacks and pairs
      // nothing (it would only react with the last blow's own fresh stacks).
      if (twin)
        hitMonster(ctx, m, unit * 1.5 * twinPct, element, {
          source: 'basic',
          crit,
          heft: s.heft,
          stacks: 0,
          noReact: true,
        });
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
        // Twin Fang's extra shot: today's value (×1.0), never an explosion, no stacks and no pairing.
        damage: i === 0 ? base : unit * twinPct,
        element,
        pierce: w.pierce,
        maxDist: w.range + 1.5,
        explodeRadius: i === 0 ? (s.explode ?? 0) : 0,
        applies: i === 0 ? applies : [],
        knockback: 0,
        heft: s.heft,
        rattles,
        stacks: i === 0 ? stacks : 0,
        noReact: i === 1,
      });
    }
    if (sw.committed && s.move < 0)
      startPush(ctx, { x: -dir.x, y: -dir.y }, -s.move, bal.feel.recoilSeconds);
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
    moveKind: kind,
    dir,
  });
  if (landed) h.mana = Math.min(h.manaMax, h.mana + bal.mana.basicAttackGain);
  // A held blow takes its time from its stage's row; its startup was spent holding.
  const cycle = stage === null ? sw.cycle : (h.stats.attackInterval * s.time) / haste(ctx);
  if (stage !== null) h.nextAttackAt = world.t + cycle * (1 - s.startup);
  if (sw.committed)
    h.recoverUntil = Math.min(h.nextAttackAt, world.t + cycle * bal.feel.basicRecovery);
}

/** A basic shot with an explosion bursts over the foe it struck and every foe around it (each once). */
export function burstShot(ctx: SimCtx, p: Projectile, struck: MonsterEntity | null = null): void {
  p.dead = true;
  ctx.events.push({
    kind: 'explode',
    x: p.x,
    y: p.y,
    radius: p.explodeRadius,
    element: p.element,
    infusion: null,
  });
  for (const m of alive(ctx)) {
    if (m !== struck && dist(p.x, p.y, m.x, m.y) > p.explodeRadius + m.radius) continue;
    hitMonster(ctx, m, p.damage, p.element, {
      source: 'basic',
      canCrit: true,
      applies: p.applies,
      heft: p.heft ?? 0,
      rattles: p.rattles,
      stacks: p.stacks,
      noReact: p.noReact,
    });
  }
}
