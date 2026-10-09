import type { ResolvedAbility } from '../../types/ability.js';
import type { HeroEntity, MonsterEntity, Vec } from '../../types/arpg.js';
import { hitMonster, type SimCtx } from '../combat.js';
import { angleBetween, dirTo, dist, distToSegment } from '../geometry.js';
import { clipSight, moveCircle, perceives, sees, snapToWalkable } from '../grid.js';
import {
  abilityHit,
  chainFrom,
  cleaveBehind,
  detonate,
  hitOpts,
  impact,
  leaveZone,
  lookOf,
} from './impact.js';
import { stepBonus, stepHeft } from './resolve.js';
import { aimPoint, alive, muzzle, SHOT, spawnProjectile } from './targeting.js';
import { hitObject, objectsIn, objectsOnBeam } from '../objects.js';
import { hitStructures } from '../terrain.js';
import { signatureFor } from './signatures.js';

export interface FormResult {
  ok: boolean;
  tx: number;
  ty: number;
}

/** Repel's knockback per point of its `effect` (Earth's knob is 1: an effect of 0.5 pushes as Earth does). */
const REPEL_PUSH = 2;

function rotate(d: Vec, a: number): Vec {
  return { x: d.x * Math.cos(a) - d.y * Math.sin(a), y: d.x * Math.sin(a) + d.y * Math.cos(a) };
}

/**
 * A melee sweep from where the hero stands (Strike's, Whirl's): every foe it
 * sees within `reach` and `arc` round `dir` takes a direct hit (Detonate
 * blasting round each), a `slash` marks it, and, not an Echo's, it reaches
 * the room objects and (a heavy or hold move's) crumbling cover. With `first`
 * its Chain jumps from the first foe and its zone is left ahead. Returns the
 * foes hit.
 */
function sweep(
  ctx: SimCtx,
  ab: ResolvedAbility,
  hit: number,
  heft: number,
  reach: number,
  arc: number,
  dir: Vec,
  first: boolean,
): MonsterEntity[] {
  const { world } = ctx;
  const h = world.hero;
  const half = (arc * Math.PI) / 360;
  const hits = alive(ctx).filter(
    (m) =>
      dist(h.x, h.y, m.x, m.y) - m.radius <= reach &&
      (arc >= 360 || angleBetween(dir, dirTo(h.x, h.y, m.x, m.y)) <= half) &&
      sees(world.map, h, m),
  );
  ctx.events.push({
    kind: 'slash',
    x: h.x,
    y: h.y,
    dir,
    range: reach,
    arc,
    element: ab.element,
    heft,
    infusion: ab.elements[1] ?? null,
    ...lookOf(ab),
    ...(ab.replay ? { echo: true as const } : {}),
  });
  const opts = hitOpts(ab, { x: h.x, y: h.y }, false, true, heft);
  for (const m of hits) {
    hitMonster(ctx, m, hit, ab.element, opts);
    detonate(ctx, ab, m, hit);
  }
  if (!ab.replay) {
    for (const obj of objectsIn(world, h, reach, dir, arc)) hitObject(ctx, obj, 'hero');
    // A heavy or hold sweep wears crumbling cover in its arc, as a heavy blow does.
    if (ab.kind === 'heavy' || ab.kind === 'hold') hitStructures(ctx, h, reach, hit, dir, arc);
  }
  if (first && hits.length > 0) {
    chainFrom(ctx, ab, hits[0], hit, new Set(hits.map((m) => m.id)));
    leaveZone(ctx, ab, h.x + dir.x * reach * 0.5, h.y + dir.y * reach * 0.5, reach * 0.7, hit);
  }
  return hits;
}

/**
 * Land the beats of the move playing out (`HeroEntity.perform`), one a tick at
 * most: a Whirl's sweep all round where the hero stands (its first beat
 * chaining and leaving its zone). Called after `echoTick`.
 */
export function performTick(ctx: SimCtx): void {
  const { world } = ctx;
  const h = world.hero;
  const o = h.perform;
  if (!o || world.t < o.nextAt - 1e-9) return;
  const ab = o.ability;
  if (o.form === 'whirl') {
    sweep(ctx, ab, o.hit, o.heft, ab.radius * o.size, 360, h.facing, o.struck === 0);
  } else if (!dart(ctx, o)) {
    endOnslaught(ctx, o);
    return;
  }
  o.struck++;
  o.left--;
  o.nextAt += o.every;
  if (o.left <= 0) {
    if (o.form === 'onslaught') endOnslaught(ctx, o);
    else h.perform = null;
  }
}

type Perform = NonNullable<HeroEntity['perform']>;

/**
 * One of Onslaught's darts: to the nearest living foe within the area's
 * radius + 1 of its centre that the hero perceives, never the one struck last
 * while another stands; the hero moves to its contact gap (walls stop it),
 * faces it and strikes it once (a `dash` and a `slash` mark it; Detonate
 * blasts round it; the first dart chains). False with no foe to dart at.
 */
function dart(ctx: SimCtx, o: Perform): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const ab = o.ability;
  const near = alive(ctx)
    .filter(
      (m) =>
        dist(o.at.x, o.at.y, m.x, m.y) - m.radius <= ab.radius + 1 && perceives(world.map, h, m),
    )
    .sort((a, b) => dist(h.x, h.y, a.x, a.y) - dist(h.x, h.y, b.x, b.y));
  const m = near.find((f) => f.id !== o.lastId) ?? near[0];
  if (!m) return false;
  const from = { x: h.x, y: h.y };
  const d = dirTo(h.x, h.y, m.x, m.y);
  const gap = dist(h.x, h.y, m.x, m.y) - m.radius - h.radius - bal.feel.contactGap;
  if (gap > 0 && (d.x !== 0 || d.y !== 0))
    Object.assign(h, moveCircle(world.map, h, h.radius, d.x * gap, d.y * gap));
  if (d.x !== 0 || d.y !== 0) h.facing = d;
  const infusion = ab.elements[1] ?? null;
  ctx.events.push({
    kind: 'dash',
    fromX: from.x,
    fromY: from.y,
    toX: h.x,
    toY: h.y,
    infusion,
    ...lookOf(ab),
  });
  ctx.events.push({
    kind: 'slash',
    x: h.x,
    y: h.y,
    dir: h.facing,
    range: 1.5,
    arc: 90,
    element: ab.element,
    heft: o.heft,
    infusion,
    ...lookOf(ab),
    ...(ab.replay ? { echo: true as const } : {}),
  });
  hitMonster(ctx, m, o.hit, ab.element, hitOpts(ab, from, false, true, o.heft));
  detonate(ctx, ab, m, o.hit);
  cleaveBehind(ctx, ab, m, o.hit);
  if (o.struck === 0) chainFrom(ctx, ab, m, o.hit, new Set([m.id]));
  o.lastId = m.id;
  return true;
}

/** The darts are over: the protection follows the untouchable spell (not an Echo's). */
function endOnslaught(ctx: SimCtx, o: Perform): void {
  const h = ctx.world.hero;
  h.perform = null;
  if (o.ability.replay) return;
  h.onslaughtGuard = {
    until: Math.max(ctx.world.t, h.invulnUntil) + ctx.bal.abilities.defend.onslaughtGuard,
    reduce: o.ability.effect,
  };
}

/**
 * Carry out a move's form. A move after a chain's first lands with its step
 * bonus: harder, and a Bolt, a Lance or a Burst bigger. Fails (nothing
 * happens) when there is nothing to aim at. A signature the weapon has for the
 * form (`signatureFor`, the constructs spec §4.3) replaces the form's behaviour.
 */
export function executeForm(ctx: SimCtx, ab: ResolvedAbility, aim: Vec | null): FormResult {
  const { world } = ctx;
  const h = world.hero;
  const signature = signatureFor(h.stats.weapon.baseId, ab.form.id);
  if (signature) return signature(ctx, ab, aim);
  const t = world.t;
  const p = aimPoint(ctx, ab, aim);
  if (!p) return { ok: false, tx: h.x, ty: h.y };
  const { power, size } = stepBonus(
    ctx.bal,
    ab.index,
    (h.boon.stepBonus ?? 0) + ab.knobs.stepBonus,
  );
  const hit = abilityHit(ctx, ab) * power;
  const heft = stepHeft(ab);
  let dir = dirTo(h.x, h.y, p.x, p.y);
  if (dir.x === 0 && dir.y === 0) dir = { ...h.facing };
  const done = (tx: number, ty: number): FormResult => ({ ok: true, tx, ty });
  // A shared form's melee version plays on a melee weapon (the contract's `FormDef.melee`).
  const melee = h.stats.weapon.class === 'melee' && ab.form.melee !== undefined;
  // A Defensive move replaces the one up: its Ward (without a burst), Surge or Blink trail,
  // for `seconds` × (1 + the boons' `defendDuration`).
  const buff = (form: 'ward' | 'armor' | 'surge' | 'blink', seconds: number) => {
    const until = t + seconds * (1 + (h.boon.defendDuration ?? 0));
    h.ward = null;
    h.defend = { form, until, move: ab.index, stage: ab.stage };
    ctx.events.push({ kind: 'buff', form, element: ab.element, until });
  };

  switch (ab.form.id) {
    case 'bolt': {
      h.facing = dir;
      // Multi-shot: 1 + its extra shots in a fan at Volley's spacing; each bolt hits on its own.
      const n = 1 + (ab.knobs.extraShots?.count ?? 0);
      for (let i = 0; i < n; i++) {
        const d = n > 1 ? rotate(dir, (i - (n - 1) / 2) * 0.22) : dir;
        spawnProjectile(ctx, {
          owner: 'hero',
          form: 'bolt',
          ability: ab,
          homingId: null,
          ...muzzle(ctx, d, 0.6),
          vx: d.x * ab.speed,
          vy: d.y * ab.speed,
          radius: 0.3 + 0.15 * size,
          damage: hit,
          element: ab.element,
          pierce: ab.knobs.pierce > 0,
          pierceLeft: ab.knobs.pierce,
          maxDist: ab.range,
          explodeRadius: ab.radius * size,
          applies: ab.knobs.applies,
          knockback: ab.knobs.knockback,
          heft,
        });
      }
      return done(h.x + dir.x * ab.range, h.y + dir.y * ab.range);
    }
    case 'volley': {
      h.facing = dir;
      const n = ab.count;
      const targets = alive(ctx)
        .filter(
          (m) =>
            dist(h.x, h.y, m.x, m.y) - m.radius <= ab.range + 2 &&
            perceives(world.map, h, m) &&
            objectsOnBeam(world, h, m, SHOT).length === 0,
        )
        .sort((a, b) => dist(h.x, h.y, a.x, a.y) - dist(h.x, h.y, b.x, b.y));
      for (let i = 0; i < n; i++) {
        const d = rotate(dir, (i - (n - 1) / 2) * 0.22);
        spawnProjectile(ctx, {
          owner: 'hero',
          form: 'volley',
          ability: ab,
          homingId: targets.length > 0 ? targets[i % targets.length].id : null,
          ...muzzle(ctx, d, 0.5),
          vx: d.x * ab.speed,
          vy: d.y * ab.speed,
          radius: 0.25,
          damage: hit,
          element: ab.element,
          pierce: ab.knobs.pierce > 0,
          pierceLeft: ab.knobs.pierce,
          maxDist: ab.range + 3,
          explodeRadius: ab.radius,
          applies: ab.knobs.applies,
          knockback: ab.knobs.knockback,
          heft,
        });
      }
      return done(p.x, p.y);
    }

    case 'lance': {
      h.facing = dir;
      const len = ab.range * size;
      const width = ab.radius;
      const opts = hitOpts(ab, { x: h.x, y: h.y }, false, true, heft);
      if (melee) {
        // The lunge (the constructs spec §2.2): the hero drives the line to the first wall and
        // strikes every foe within `width` of its way that either end sees, nearest first. No
        // i-frames; Multi-shot's extra beams are one lunge.
        const from = { x: h.x, y: h.y };
        const far = clipSight(world.map, h, { x: h.x + dir.x * len, y: h.y + dir.y * len });
        const k = dist(h.x, h.y, far.x, far.y);
        Object.assign(h, moveCircle(world.map, h, h.radius, dir.x * k, dir.y * k));
        const hits = alive(ctx)
          .filter(
            (m) =>
              distToSegment(m.x, m.y, from.x, from.y, h.x, h.y) <= width + m.radius &&
              (sees(world.map, from, m) || sees(world.map, h, m)),
          )
          .sort((a, b) => dist(from.x, from.y, a.x, a.y) - dist(from.x, from.y, b.x, b.y));
        ctx.events.push({
          kind: 'dash',
          fromX: from.x,
          fromY: from.y,
          toX: h.x,
          toY: h.y,
          infusion: ab.elements[1] ?? null,
          ...lookOf(ab),
        });
        const struck = new Set<number>();
        for (const m of hits) {
          struck.add(m.id);
          hitMonster(ctx, m, hit, ab.element, opts);
          detonate(ctx, ab, m, hit);
        }
        if (!ab.replay)
          for (const obj of objectsOnBeam(world, from, h, width)) hitObject(ctx, obj, 'hero');
        if (hits.length > 0) {
          chainFrom(ctx, ab, hits[hits.length - 1], hit, struck);
          leaveZone(ctx, ab, hits[0].x, hits[0].y, Math.max(1.2, width * 2), hit);
        }
        return done(h.x, h.y);
      }
      // Multi-shot: 1 + its extra beams in a fan at Volley's spacing. They share one hit set, so
      // a foe is struck once a cast; each beam that hits jumps from its farthest foe and leaves
      // its zone at its first, as one Lance does. A beam ends at the first wall.
      const n = 1 + (ab.knobs.extraShots?.count ?? 0);
      const struck = new Set<number>();
      for (let i = 0; i < n; i++) {
        const d = n > 1 ? rotate(dir, (i - (n - 1) / 2) * 0.22) : dir;
        const { x: ex, y: ey } = clipSight(world.map, h, {
          x: h.x + d.x * len,
          y: h.y + d.y * len,
        });
        const hits = alive(ctx)
          .filter(
            (m) =>
              !struck.has(m.id) &&
              distToSegment(m.x, m.y, h.x, h.y, ex, ey) <= width + m.radius &&
              sees(world.map, h, m),
          )
          .sort((a, b) => dist(h.x, h.y, a.x, a.y) - dist(h.x, h.y, b.x, b.y));
        ctx.events.push({
          kind: 'beam',
          x: h.x,
          y: h.y,
          tx: ex,
          ty: ey,
          width,
          element: ab.element,
          infusion: ab.elements[1] ?? null,
          ...lookOf(ab),
        });
        for (const m of hits) {
          struck.add(m.id);
          hitMonster(ctx, m, hit, ab.element, opts);
          detonate(ctx, ab, m, hit);
        }
        // An Echo's beam sets nothing off (see the room objects spec).
        if (!ab.replay)
          for (const obj of objectsOnBeam(world, h, { x: ex, y: ey }, width))
            hitObject(ctx, obj, 'hero');
        if (hits.length > 0) {
          chainFrom(ctx, ab, hits[hits.length - 1], hit, struck);
          leaveZone(ctx, ab, hits[0].x, hits[0].y, Math.max(1.2, width * 2), hit);
        }
      }
      return done(h.x + dir.x * len, h.y + dir.y * len);
    }
    case 'burst': {
      h.facing = dir;
      if (melee) {
        // The eruption (the constructs spec §2.2): the ground erupts at the aim point at once.
        impact(ctx, ab, p.x, p.y, ab.radius * size, hit, { heft });
        return done(p.x, p.y);
      }
      // Thrown: the mana arcs to the aim point and bursts where it lands.
      const land = t + ctx.bal.feel.lobBase + dist(h.x, h.y, p.x, p.y) / Math.max(1, ab.speed);
      world.zones.push({
        id: world.nextId++,
        owner: 'hero',
        source: 'burst',
        ability: ab,
        x: p.x,
        y: p.y,
        radius: ab.radius * size,
        born: t,
        until: land + 0.1,
        tick: 0,
        nextTick: 0,
        damage: hit,
        element: ab.element,
        detonateAt: land,
        dead: false,
        fromX: h.x,
        fromY: h.y,
        heft,
      });
      return done(p.x, p.y);
    }

    case 'strike': {
      h.facing = dir;
      // The last move of a chain slams all around.
      const slam = ab.last;
      const arc = slam ? 360 : ab.arc;
      const reach = ab.radius * (slam ? 1.15 : 1);
      sweep(ctx, ab, hit, heft, reach, arc, dir, true);
      return done(h.x + dir.x * reach, h.y + dir.y * reach);
    }
    case 'whirl': {
      // The spin (the constructs spec §2.2): a sweep all round now and every `tick` for
      // `duration`, the hero free to walk (`performTick`). An Echo replays one sweep.
      h.facing = dir;
      const reach = ab.radius * size;
      if (ab.replay) {
        sweep(ctx, ab, hit, heft, reach, 360, dir, true);
        return done(h.x, h.y);
      }
      h.perform = {
        form: 'whirl',
        ability: ab,
        hit,
        heft,
        size,
        nextAt: t,
        every: ab.tick,
        left: Math.max(1, Math.round(ab.duration / ab.tick)),
        struck: 0,
        at: { x: h.x, y: h.y },
        lastId: null,
      };
      return done(h.x, h.y);
    }

    case 'ward':
      buff('ward', ab.duration);
      h.ward = { hp: h.stats.maxHp * ab.effect, max: h.stats.maxHp * ab.effect };
      return done(h.x, h.y);

    case 'armor':
      buff('armor', ab.duration);
      return done(h.x, h.y);

    case 'repel': {
      // A pulse (the constructs spec §2.2): the foes round the hero are hit, pushed `effect` ×
      // REPEL_PUSH and chilled (the one slow). It ends the Defensive up, as Blink does, and
      // leaves none.
      h.ward = null;
      h.defend = null;
      const reach = ab.radius * size;
      const hits = alive(ctx).filter(
        (m) => dist(h.x, h.y, m.x, m.y) - m.radius <= reach && sees(world.map, h, m),
      );
      ctx.events.push({
        kind: 'explode',
        x: h.x,
        y: h.y,
        radius: reach,
        element: ab.element,
        infusion: ab.elements[1] ?? null,
        ...lookOf(ab),
      });
      const base = hitOpts(ab, { x: h.x, y: h.y }, false, true, heft);
      const applies = base.applies ?? [];
      const opts = {
        ...base,
        knockback: (base.knockback ?? 0) + ab.effect * REPEL_PUSH,
        applies: applies.includes('chill') ? applies : [...applies, 'chill' as const],
      };
      for (const m of hits) hitMonster(ctx, m, hit, ab.element, opts);
      if (hits.length > 0) chainFrom(ctx, ab, hits[0], hit, new Set(hits.map((m) => m.id)));
      return done(h.x, h.y);
    }

    case 'surge':
      buff('surge', ab.duration);
      return done(h.x, h.y);

    case 'blink': {
      // The defensive it replaces goes first, as `buff()` clears it, so the trail's hits don't draw on it.
      h.ward = null;
      h.defend = null;
      const fromX = h.x;
      const fromY = h.y;
      // It goes no further than the first wall on its line.
      const d = Math.min(dist(h.x, h.y, p.x, p.y), ab.range);
      const far = { x: h.x + dir.x * d, y: h.y + dir.y * d };
      const to = clipSight(world.map, h, far);
      const k = to === far ? d : dist(h.x, h.y, to.x, to.y);
      Object.assign(h, moveCircle(world.map, h, h.radius, dir.x * k, dir.y * k));
      h.facing = dir;
      h.invulnUntil = Math.max(h.invulnUntil, t + ab.effect);
      ctx.events.push({
        kind: 'dash',
        fromX,
        fromY,
        toX: h.x,
        toY: h.y,
        infusion: ab.elements[1] ?? null,
      });
      const opts = hitOpts(ab, { x: fromX, y: fromY }, false, true, heft);
      // The trail strikes the foes it passes that either of its ends sees.
      const from = { x: fromX, y: fromY };
      for (const m of alive(ctx)) {
        if (
          distToSegment(m.x, m.y, fromX, fromY, h.x, h.y) <= ab.radius + m.radius &&
          (sees(world.map, from, m) || sees(world.map, h, m))
        )
          hitMonster(ctx, m, hit, ab.element, opts);
      }
      buff('blink', ctx.bal.abilities.defend.blinkSeconds);
      return done(h.x, h.y);
    }

    case 'nova':
      impact(ctx, ab, h.x, h.y, ab.radius, hit, { noScatter: true, heft });
      return done(h.x, h.y);

    case 'onslaught': {
      // The darts (the constructs spec §2.2): `count` over `duration` between the foes in the
      // area round `p` (`performTick`), the hero untouchable meanwhile, then protected
      // (`onslaughtGuard`). An Echo replays one dart.
      h.facing = dir;
      h.perform = {
        form: 'onslaught',
        ability: ab,
        hit,
        heft,
        size,
        nextAt: t,
        every: ab.duration / ab.count,
        left: ab.replay ? 1 : ab.count,
        struck: 0,
        at: p,
        lastId: null,
      };
      if (!ab.replay) h.invulnUntil = Math.max(h.invulnUntil, t + ab.duration);
      return done(p.x, p.y);
    }

    case 'barrage': {
      const spread = ab.radius * 1.6;
      for (let i = 0; i < ab.count; i++) {
        const a = world.rng.next() * Math.PI * 2;
        const r = Math.sqrt(world.rng.next()) * spread;
        const at = t + 0.35 + (ab.duration * i) / ab.count;
        world.zones.push({
          id: world.nextId++,
          owner: 'hero',
          source: 'barrage',
          ability: ab,
          // Each where the aim point sees.
          ...clipSight(
            world.map,
            p,
            snapToWalkable(world.map, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r),
          ),
          radius: ab.radius,
          born: t,
          until: at + 0.1,
          tick: 0,
          nextTick: 0,
          damage: hit,
          element: ab.element,
          detonateAt: at,
          dead: false,
          heft: heft * 0.5,
        });
      }
      return done(p.x, p.y);
    }

    case 'maelstrom':
      // A melee weapon's rides the hero (`follow`; the constructs spec §2.2).
      world.zones.push({
        id: world.nextId++,
        owner: 'hero',
        source: 'maelstrom',
        ability: ab,
        x: melee ? h.x : p.x,
        y: melee ? h.y : p.y,
        ...(melee ? { follow: true } : {}),
        radius: ab.radius,
        born: t,
        until: t + ab.duration,
        tick: ab.tick,
        nextTick: t + 0.05,
        damage: hit,
        element: ab.element,
        detonateAt: 0,
        dead: false,
      });
      return done(melee ? h.x : p.x, melee ? h.y : p.y);
  }
}
