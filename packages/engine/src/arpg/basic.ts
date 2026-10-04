import type { HeroEntity, MonsterEntity, Projectile, StatusId, Vec } from '../types/arpg.js';
import { HOLD_STAGE_KINDS, type MoveKind, type ZoneKnob } from '../types/ability.js';
import type { ComboStepDef, DelveBalance, HeroBlow, HeroWeapon } from '../types/delve.js';
import type { ManaType } from '../types/mana.js';
import { BASIC_STATUS, hitMonster, type SimCtx } from './combat.js';
import { angleBetween, dirTo, dist } from './geometry.js';
import { perceives, sees } from './grid.js';
import { endPushes, startPush } from './action.js';
import { holdCharge } from './abilities/cast.js';
import { holdFull } from './abilities/resolve.js';
import { guardLand, surging } from './abilities/defend.js';
import { queueEcho } from './abilities/echo.js';
import { chainJumps, knobHitOpts, shedShards, spendZone } from './abilities/impact.js';
import { alive, muzzle, nearestMonster, spawnProjectile } from './abilities/targeting.js';
import { hitObject, objectsIn } from './objects.js';
import { hitStructures } from './terrain.js';

/**
 * The basic attack: each blow of the hero's basic chain (its kind's row, in
 * its element) has a startup (a forward `move` lunges in), a strike, then its
 * step (a step back, a side step, a hop), and a recovery that slows movement
 * after a committed blow. See the combat weight, the moves and chains, and the
 * weapon flow specs.
 */

function haste(ctx: SimCtx): number {
  const surge = surging(ctx);
  return surge ? 1 + surge.effect : 1;
}

/** The nearest foe the hero perceives within `range` inside the arc around `dir` (where a manual lunge stops). */
function foeAhead(ctx: SimCtx, dir: Vec, range: number, arcDeg: number): MonsterEntity | null {
  const h = ctx.world.hero;
  const half = (arcDeg * Math.PI) / 360;
  let best: MonsterEntity | null = null;
  let bestD = Infinity;
  for (const m of alive(ctx)) {
    const d = dist(h.x, h.y, m.x, m.y) - m.radius;
    if (d > range || d >= bestD) continue;
    if (arcDeg < 360 && angleBetween(dir, dirTo(h.x, h.y, m.x, m.y)) > half) continue;
    if (!perceives(ctx.world.map, h, m)) continue;
    best = m;
    bestD = d;
  }
  return best;
}

/**
 * A swing on row `s`: its lunge (a forward `move`), its reach, and how far it
 * looks for a foe: its reach plus its lunge, plus 1 for a manual swing.
 */
function swingReach(w: HeroWeapon, s: ComboStepDef, manual: boolean) {
  const lunge = Math.max(0, s.move);
  const reach = w.range + (w.kind === 'melee' ? (s.reach ?? 0) : 0);
  return { lunge, reach, acquire: reach + lunge + (manual ? 1 : 0) };
}

/** Toward `aim` if given, else toward the nearest foe within `acquire`, else along `fallback`. */
function aimAt(ctx: SimCtx, aim: Vec | null, acquire: number, fallback: Vec) {
  const h = ctx.world.hero;
  const target = aim ? null : nearestMonster(ctx, h.x, h.y, acquire);
  const to = aim ?? target;
  const dir = to ? dirTo(h.x, h.y, to.x, to.y) : fallback;
  return { target, dir: dir.x === 0 && dir.y === 0 ? fallback : dir };
}

/** The blow of the basic chain the next swing makes: the chain restarts after a pause. */
export function basicStep(h: HeroEntity, t: number, bal: DelveBalance): number {
  if (t - h.lastBasicAt > h.stats.attackInterval + bal.hero.basicComboGrace) return 0;
  return h.attackCount % h.stats.weapon.blows.length;
}

/**
 * Start the next blow of the chain when the weapon is ready. Automatic: only
 * at a foe in reach. Manual: toward `aim` if given, else the nearest foe in
 * reach, else straight ahead. The hero faces it, and it lunges (planted for
 * `lungeHold` of its startup, then in, stopping at its foe); a committed swing
 * ends any recovery. A manual hold blow starts as a medium one (it holds at
 * its strike point: see `basicHoldTick`). With a press waiting (see the chain
 * feel spec), only a blow that strikes by `deadline` (the tick the press
 * fires) starts. Returns whether a swing started.
 */
export function startSwing(
  ctx: SimCtx,
  manual: boolean,
  committed: boolean,
  aim: Vec | null = null,
  deadline = Infinity,
): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const t = world.t;
  if (t < h.nextAttackAt) return false;
  const w = h.stats.weapon;
  const step = basicStep(h, t, bal);
  const blow = w.blows[step];
  const s = manual && blow.kind === 'hold' ? w.feel.medium : blow;
  // Quick and Heavy (`quick`): the cycle × its beat; the startup, from the base cycle, × its
  // wind-up, at most the cycle.
  const q = blow.knobs.quick;
  const base = (h.stats.attackInterval * s.time) / haste(ctx);
  const cycle = base * q.beat;
  const startup = Math.min(cycle, base * s.startup * q.windup);
  if (t + startup > deadline + 1e-9) return false;
  h.attackCount = step;
  const { lunge, reach, acquire } = swingReach(w, s, manual);
  const { target, dir } = aimAt(ctx, aim, acquire, { ...h.facing });
  if (!target && !manual) return false;
  h.facing = dir;
  h.swing = {
    step,
    dir,
    targetId: target?.id ?? null,
    start: t,
    strikeAt: t + startup,
    cycle,
    committed,
    held: null,
    released: null,
  };
  h.nextAttackAt = t + cycle;
  // An automatic swing on the move leaves an ability's recovery alone.
  if (committed) h.recoverUntil = t;
  if (lunge > 0) {
    const foe = target ?? foeAhead(ctx, dir, reach + lunge, s.arc ?? w.arc);
    // Planted for the first part of the startup, then the lunge.
    const hold = startup * bal.feel.lungeHold;
    startPush(ctx, 'lunge', dir, lunge, startup - hold, foe?.id ?? null, hold);
  }
  return true;
}

/**
 * A manual hold blow at its strike point: while the attack stays held it
 * charges over `holdTime` × the hero's tempo (stages by `holdStages`, saying
 * so), and it strikes with its stage's row when the attack lets go or at
 * `holdMax` × the tempo (stage 2). A blow held
 * past its strike point re-aims as it strikes, as a manual swing aims (on the
 * medium row it began with): toward `aim`, else the nearest foe, else where it
 * was aimed. A tap (let go by its strike point) strikes where it began. One let
 * go at stage 1 or 2 whose row lunges at least `minLeap` further than
 * medium's leaps the rest first, over `stepSeconds` toward where it re-aimed,
 * stopping at its foe (the re-aimed target, else the first ahead), and strikes
 * as it lands, unless that foe is already within `minLeap` of contact (see the
 * weapon flow spec).
 */
export function basicHoldTick(
  ctx: SimCtx,
  held: boolean,
  dt: number,
  aim: Vec | null,
  steer: Vec,
): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const sw = h.swing!;
  const t = world.t;
  sw.held ??= t;
  // The hero's tempo now: a weapon swap drops the swing.
  const fullTime = holdFull(bal, h.stats.tempo);
  const { stage } = holdCharge(bal, sw.held, t, fullTime);
  const full = t - sw.held >= bal.chains.holdMax * h.stats.tempo - 1e-9;
  if (full || !held) {
    const w = h.stats.weapon;
    let target: MonsterEntity | null = null;
    if (t > sw.held + 1e-9) {
      const { acquire } = swingReach(w, w.feel.medium, true);
      const aimed = aimAt(ctx, aim, acquire, sw.dir);
      target = aimed.target;
      sw.dir = aimed.dir;
      sw.targetId = target?.id ?? null;
      h.facing = sw.dir;
    }
    const at = full ? 2 : stage;
    const row = w.feel[HOLD_STAGE_KINDS[at]];
    const leap = at > 0 ? row.move - w.feel.medium.move : 0;
    // A leap shorter than `minLeap` (unarmed's) isn't worth its delay: it strikes now.
    if (leap < bal.feel.minLeap - 1e-9) return strike(ctx, steer, at);
    const { reach } = swingReach(w, row, true);
    const foe = target ?? foeAhead(ctx, sw.dir, reach + leap, row.arc ?? w.arc);
    // Nor is one whose foe is already within `minLeap` of contact.
    if (
      foe &&
      dist(h.x, h.y, foe.x, foe.y) - foe.radius - h.radius - bal.feel.contactGap <=
        bal.feel.minLeap + 1e-9
    )
      return strike(ctx, steer, at);
    startPush(ctx, 'lunge', sw.dir, leap, bal.feel.stepSeconds, foe?.id ?? null);
    sw.released = at;
    sw.strikeAt = t + bal.feel.stepSeconds;
    return;
  }
  if (stage > holdCharge(bal, sw.held, t - dt, fullTime).stage)
    ctx.events.push({ kind: 'holdStage', slot: null, stage });
}

/**
 * Land the swing's blow from where the hero stands now: in its element, with
 * its power and its kind's stacks, then start its step. A held blow (`stage`)
 * strikes with that stage's row (medium, heavy, hold) and takes its time from
 * it. `steer` is the stick (length up to 1): its part square to the blow picks
 * the side step's side.
 */
export function strike(ctx: SimCtx, steer: Vec, stage: number | null = null): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const sw = h.swing;
  if (!sw) return;
  h.swing = null;
  const w = h.stats.weapon;
  const blow = w.blows[sw.step];
  const kind = stage === null ? blow.kind : HOLD_STAGE_KINDS[stage];
  const s = stage === null ? blow : w.feel[kind];
  // The lunge belongs to the swing and ends with it.
  endPushes(h, 'lunge');
  const last = sw.step === w.blows.length - 1;
  h.attackCount++;
  h.lastBasicAt = world.t;
  const element = blow.element;
  const twinPct = (h.stats.legendaries.twin_fang ?? 0) / 100;
  const dir = sw.dir;
  // Mana only for an attack at something: a blow that connects, or a shot with a foe in range.
  // Drain's and Linger's budgets are the blow's: they count from before its hits land.
  h.drained[3] = 0;
  h.drainLeft[3] = bal.mana.basicAttackGain * bal.runes.drainShare;
  h.zonesLeft[3] = blow.knobs.zone?.perCast ?? 0;
  const landed = landBlow(ctx, blow, kind, dir, 1, {
    twin: last ? twinPct : 0,
    targetId: sw.targetId,
  });
  blowStep(ctx, s, dir, steer);

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
  if (landed) {
    h.mana = Math.min(h.manaMax, h.mana + bal.mana.basicAttackGain);
    guardLand(ctx, blow.knobs);
  }
  // Echo: the blow again (a held blow at its stage), along its way, from where the hero stands then.
  if (blow.knobs.echo > 0)
    queueEcho(ctx, {
      at: world.t + bal.runes.echoDelay,
      slot: null,
      ability: null,
      aim: null,
      blow: sw.step,
      stage,
      dir,
    });
  // A held blow takes its time from its stage's row (by the swing's `quick` rule); its startup
  // was spent holding. A tap (struck on the tick it reached its strike point) keeps a medium
  // blow's timing.
  const q = blow.knobs.quick;
  const cycle =
    stage === null ? sw.cycle : ((h.stats.attackInterval * s.time) / haste(ctx)) * q.beat;
  if (stage !== null && world.t > sw.held! + 1e-9)
    h.nextAttackAt = world.t + cycle * Math.max(0, 1 - (s.startup * q.windup) / q.beat);
  if (sw.committed)
    h.recoverUntil = Math.min(h.nextAttackAt, world.t + cycle * bal.feel.basicRecovery);
}

/**
 * A blow's damage from where the hero stands now, along `dir`, struck as `kind`
 * (a held blow's stage's: its row follows), at `powerMult` × its power. A melee
 * blow hits every foe the hero sees in its reach (× its `area`) and arc, the
 * swing's `targetId` whatever its angle, with one crit roll; a shot blow fires its shot.
 * Every hit carries the blow's knobs (`knobHitOpts`). `twin`: Twin Fang's share
 * on the chain's last blow (its extra hit or shot carries no runes). Returns
 * whether it landed: a melee blow that connected, or a shot with a foe in range.
 */
export function landBlow(
  ctx: SimCtx,
  blow: HeroBlow,
  kind: MoveKind,
  dir: Vec,
  powerMult: number,
  o: { twin?: number; targetId?: number | null } = {},
): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const w = h.stats.weapon;
  const s = kind === blow.kind ? blow : w.feel[kind];
  const k = blow.knobs;
  const twin = o.twin ?? 0;
  const surge = surging(ctx);
  const element = blow.element;
  const unit = h.stats.weaponDamage * h.stats.damageMult * blow.attunePower;
  const base = unit * s.power * k.power * powerMult;
  // Every blow applies its element's stacks, by its kind (a Surge's statuses ride along).
  const applies: StatusId[] = surge ? [...surge.knobs.applies] : [];
  if (!applies.includes(BASIC_STATUS[element])) applies.push(BASIC_STATUS[element]);
  if (s.stagger && !applies.includes('stagger')) applies.push('stagger');
  for (const a of k.applies) if (!applies.includes(a)) applies.push(a);
  const stacks = bal.stacks.basicByKind[kind] + k.stacksBonus;
  // An Earth blow or an Earth Surge's statuses: its stagger adds Earth stacks.
  const rattles = element === 'earth' || !!surge?.elements.includes('earth');
  const knobbed = knobHitOpts(k);

  let landed = w.kind !== 'melee' && !!nearestMonster(ctx, h.x, h.y, w.range);
  if (w.kind === 'melee') {
    const crit = world.rng.next() < h.stats.critChance;
    const arc = s.arc ?? w.arc;
    const reach = (w.range + (s.reach ?? 0)) * k.area;
    const halfArc = (arc * Math.PI) / 360;
    const kb = s.knockback ? { knockback: s.knockback, kbFrom: { x: h.x, y: h.y } } : {};
    const struck = new Set<number>();
    let first: MonsterEntity | null = null;
    for (const m of alive(ctx)) {
      if (dist(h.x, h.y, m.x, m.y) - m.radius > reach) continue;
      if (
        arc < 360 &&
        m.id !== o.targetId &&
        angleBetween(dir, dirTo(h.x, h.y, m.x, m.y)) > halfArc
      )
        continue;
      if (!sees(world.map, h, m)) continue;
      landed = true;
      first ??= m;
      struck.add(m.id);
      hitMonster(ctx, m, base, element, {
        source: 'basic',
        crit,
        applies,
        heft: s.heft,
        rattles,
        stacks,
        ...kb,
        ...knobbed,
      });
      // Twin Fang: today's finisher value (×1.5) on melee; it applies no stacks and pairs
      // nothing (it would only react with the last blow's own fresh stacks).
      if (twin > 0)
        hitMonster(ctx, m, unit * 1.5 * twin, element, {
          source: 'basic',
          crit,
          heft: s.heft,
          stacks: 0,
          noReact: true,
        });
    }
    // The swing reaches the props and hazards in its arc; a heavy or hold blow wears crumbling
    // cover too (see the room objects spec).
    for (const obj of objectsIn(world, h, reach, dir, arc)) hitObject(ctx, obj, 'hero');
    if (kind === 'heavy' || kind === 'hold') hitStructures(ctx, h, reach, base, dir, arc);
    // Chain: jumps from the first foe struck. Linger: a zone ahead, at half the reach.
    if (first) {
      const jump = { source: 'basic' as const, canCrit: true, applies, rattles, ...knobbed };
      chainJumps(ctx, first, base, element, k.chain, jump, struck);
      if (k.zone)
        blowZone(ctx, h.x + dir.x * reach * 0.5, h.y + dir.y * reach * 0.5, base, element, k.zone);
    }
  } else {
    const size = s.size ?? 1;
    const speed = w.speed * (s.speed ?? 1);
    const weaponPierce = w.pierce ? Infinity : 0;
    // Multi-shot: 1 + its extra shots in a fan at Volley's spacing, each at the cut power. Twin
    // Fang's extra shot stays one, 0.12 off the blow's way, and carries no runes.
    const n = 1 + (k.extraShots?.count ?? 0);
    const shot = base * (k.extraShots?.power ?? 1);
    for (let i = 0; i < n + (twin > 0 ? 1 : 0); i++) {
      const main = i < n;
      const spread = main ? (i - (n - 1) / 2) * 0.22 : 0.12;
      const d = {
        x: dir.x * Math.cos(spread) - dir.y * Math.sin(spread),
        y: dir.x * Math.sin(spread) + dir.y * Math.cos(spread),
      };
      const pierceLeft = main ? weaponPierce + k.pierce : weaponPierce;
      spawnProjectile(ctx, {
        owner: 'hero',
        form: null,
        ability: null,
        homingId: null,
        ...muzzle(ctx, d, 0.5),
        vx: d.x * speed,
        vy: d.y * speed,
        radius: 0.3 * size,
        // Twin Fang's extra shot: today's value (×1.0), never an explosion, no stacks and no pairing.
        damage: main ? shot : unit * twin,
        element,
        pierce: pierceLeft > 0,
        pierceLeft,
        maxDist: w.range + 1.5,
        explodeRadius: main ? (s.explode ?? 0) : 0,
        applies: main ? applies : [],
        knockback: 0,
        heft: s.heft,
        rattles,
        stacks: main ? stacks : 0,
        noReact: !main,
        ...(main ? { knobs: k } : {}),
      });
    }
  }
  return landed;
}

/**
 * A blow's step, from its strike over `stepSeconds`: its step back (a negative
 * `move`) and hop away from `dir`, and its side step square to it, as one push
 * with no stop. The side is the steering's when its part square to `dir` is at
 * least `sideSteer`, else the weapon's `sway`: `alternate` flips from the
 * last side taken, `orbit` keeps it. See the weapon flow spec.
 */
function blowStep(ctx: SimCtx, s: ComboStepDef, dir: Vec, steer: Vec): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const back = Math.max(0, -s.move) + (s.hop ?? 0);
  let side = 0;
  if (s.side) {
    // Square to the blow: (−dir.y, dir.x) is side 1.
    const lateral = -steer.x * dir.y + steer.y * dir.x;
    if (Math.abs(lateral) >= bal.feel.sideSteer - 1e-9) h.swaySide = Math.sign(lateral);
    else if (h.stats.weapon.sway === 'alternate') h.swaySide = -h.swaySide;
    side = s.side * h.swaySide;
  }
  const x = -dir.x * back - dir.y * side;
  const y = -dir.y * back + dir.x * side;
  const len = Math.hypot(x, y);
  if (len > 1e-9) startPush(ctx, 'step', { x: x / len, y: y / len }, len, bal.feel.stepSeconds);
}

/** A blow's Linger zone's radius. */
const BLOW_ZONE_RADIUS = 1.2;

/**
 * Linger on a heavy or hold blow: a hero zone with no ability at (x, y), for
 * `zone.seconds`, whose ticks (every 0.5 s, `zonesTick`) hit each foe inside as
 * a basic hit for `hit × zone.tickPower`.
 */
function blowZone(
  ctx: SimCtx,
  x: number,
  y: number,
  hit: number,
  element: ManaType,
  zone: ZoneKnob,
): void {
  const { world } = ctx;
  if (!spendZone(ctx, 3, zone)) return;
  world.zones.push({
    id: world.nextId++,
    owner: 'hero',
    source: 'linger',
    ability: null,
    x,
    y,
    radius: BLOW_ZONE_RADIUS,
    born: world.t,
    until: world.t + zone.seconds,
    tick: 0.5,
    nextTick: world.t + 0.5,
    damage: hit * zone.tickPower,
    element,
    detonateAt: 0,
    dead: false,
  });
}

/**
 * A basic shot's knobs where it lands (see `burstShot` and the projectile tick):
 * `hit` are the foes it hit there, the one it struck first. Chain jumps from
 * that one, Linger leaves its zone there, and Split's shards skip them all.
 */
export function shotLands(ctx: SimCtx, p: Projectile, hit: readonly MonsterEntity[]): void {
  const k = p.knobs!;
  // Chain: jumps from the foe it struck.
  const jump = {
    source: 'basic' as const,
    canCrit: true,
    applies: p.applies,
    rattles: p.rattles,
    ...knobHitOpts(k),
  };
  chainJumps(ctx, hit[0], p.damage, p.element!, k.chain, jump, new Set(hit.map((m) => m.id)));
  // Linger: a zone where it hit.
  if (k.zone) blowZone(ctx, p.x, p.y, p.damage, p.element!, k.zone);
  if (k.split)
    shedShards(ctx, p.x, p.y, k.split, p.damage, hit, {
      ability: null,
      element: p.element,
      applies: p.applies,
    });
}

/**
 * A basic shot with an explosion bursts over the foe it struck and every foe
 * around it that it sees (each once); with knobs, they act after the burst (`shotLands`).
 */
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
  const hit: MonsterEntity[] = struck ? [struck] : [];
  for (const m of alive(ctx)) {
    if (
      m !== struck &&
      (dist(p.x, p.y, m.x, m.y) > p.explodeRadius + m.radius || !sees(ctx.world.map, p, m))
    )
      continue;
    if (m !== struck) hit.push(m);
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
  }
  for (const obj of objectsIn(ctx.world, p, p.explodeRadius)) hitObject(ctx, obj, 'hero');
  if (p.knobs && hit.length > 0) shotLands(ctx, p, hit);
}
