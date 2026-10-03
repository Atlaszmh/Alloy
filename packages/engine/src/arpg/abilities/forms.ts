import type { ResolvedAbility } from '../../types/ability.js';
import type { Vec } from '../../types/arpg.js';
import { hitMonster, type SimCtx } from '../combat.js';
import { angleBetween, dirTo, dist, distToSegment } from '../geometry.js';
import { clipSight, moveCircle, sees, snapToWalkable } from '../grid.js';
import { abilityHit, chainFrom, hitOpts, impact, leaveZone } from './impact.js';
import { stepBonus, stepHeft } from './resolve.js';
import { aimPoint, alive, muzzle, spawnProjectile } from './targeting.js';

export interface FormResult {
  ok: boolean;
  tx: number;
  ty: number;
}

function rotate(d: Vec, a: number): Vec {
  return { x: d.x * Math.cos(a) - d.y * Math.sin(a), y: d.x * Math.sin(a) + d.y * Math.cos(a) };
}

/**
 * Carry out a move's form. A move after a chain's first lands with its step
 * bonus: harder, and a Bolt, a Lance or a Burst bigger. Fails (nothing
 * happens) when there is nothing to aim at.
 */
export function executeForm(ctx: SimCtx, ab: ResolvedAbility, aim: Vec | null): FormResult {
  const { world } = ctx;
  const h = world.hero;
  const t = world.t;
  const p = aimPoint(ctx, ab, aim);
  if (!p) return { ok: false, tx: h.x, ty: h.y };
  const { power, size } = stepBonus(ctx.bal, ab.index);
  const hit = abilityHit(ctx, ab) * power;
  const heft = stepHeft(ab);
  let dir = dirTo(h.x, h.y, p.x, p.y);
  if (dir.x === 0 && dir.y === 0) dir = { ...h.facing };
  const done = (tx: number, ty: number): FormResult => ({ ok: true, tx, ty });
  // A Defensive move replaces the one up: its Ward (without a burst), Surge or Blink trail.
  const buff = (form: 'ward' | 'armor' | 'surge' | 'blink', until: number) => {
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
        .filter((m) => dist(h.x, h.y, m.x, m.y) - m.radius <= ab.range + 2 && sees(world.map, h, m))
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
        });
        for (const m of hits) {
          struck.add(m.id);
          hitMonster(ctx, m, hit, ab.element, opts);
        }
        if (hits.length > 0) {
          chainFrom(ctx, ab, hits[hits.length - 1], hit, struck);
          leaveZone(ctx, ab, hits[0].x, hits[0].y, Math.max(1.2, width * 2), hit);
        }
      }
      return done(h.x + dir.x * len, h.y + dir.y * len);
    }
    case 'burst': {
      // Thrown: the mana arcs to the aim point and bursts where it lands.
      h.facing = dir;
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
      const half = (arc * Math.PI) / 360;
      const hits = alive(ctx).filter(
        (m) =>
          dist(h.x, h.y, m.x, m.y) - m.radius <= reach &&
          (arc >= 360 || angleBetween(dir, dirTo(h.x, h.y, m.x, m.y)) <= half),
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
      });
      const opts = hitOpts(ab, { x: h.x, y: h.y }, false, true, heft);
      for (const m of hits) hitMonster(ctx, m, hit, ab.element, opts);
      if (hits.length > 0) {
        chainFrom(ctx, ab, hits[0], hit, new Set(hits.map((m) => m.id)));
        leaveZone(ctx, ab, h.x + dir.x * reach * 0.5, h.y + dir.y * reach * 0.5, reach * 0.7, hit);
      }
      return done(h.x + dir.x * reach, h.y + dir.y * reach);
    }

    case 'ward':
      buff('ward', t + ab.duration);
      h.ward = { hp: h.stats.maxHp * ab.effect, max: h.stats.maxHp * ab.effect };
      return done(h.x, h.y);

    case 'armor':
      buff('armor', t + ab.duration);
      return done(h.x, h.y);

    case 'surge':
      buff('surge', t + ab.duration);
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
      for (const m of alive(ctx)) {
        if (distToSegment(m.x, m.y, fromX, fromY, h.x, h.y) <= ab.radius + m.radius)
          hitMonster(ctx, m, hit, ab.element, opts);
      }
      buff('blink', t + ctx.bal.abilities.defend.blinkSeconds);
      return done(h.x, h.y);
    }

    case 'nova':
      impact(ctx, ab, h.x, h.y, ab.radius, hit, { noScatter: true, heft });
      return done(h.x, h.y);

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
      world.zones.push({
        id: world.nextId++,
        owner: 'hero',
        source: 'maelstrom',
        ability: ab,
        x: p.x,
        y: p.y,
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
      return done(p.x, p.y);
  }
}
