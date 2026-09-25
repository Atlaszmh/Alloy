import type { ResolvedAbility } from '../../types/ability.js';
import type { Vec } from '../../types/arpg.js';
import { hitMonster, type SimCtx } from '../combat.js';
import { angleBetween, clamp, dirTo, dist, distToSegment } from '../geometry.js';
import { abilityHit, chainFrom, hitOpts, impact, leaveZone } from './impact.js';
import { aimPoint, alive, spawnProjectile } from './targeting.js';

export interface FormResult {
  ok: boolean;
  tx: number;
  ty: number;
}

function rotate(d: Vec, a: number): Vec {
  return { x: d.x * Math.cos(a) - d.y * Math.sin(a), y: d.x * Math.sin(a) + d.y * Math.cos(a) };
}

/**
 * Carry out an ability's form. `step` is the press-combo step (Primary forms
 * scale their size and power by `combo[step]`). Fails (nothing happens) when
 * there is nothing to aim at.
 */
export function executeForm(
  ctx: SimCtx,
  ab: ResolvedAbility,
  aim: Vec | null,
  step: number,
): FormResult {
  const { world } = ctx;
  const h = world.hero;
  const t = world.t;
  const p = aimPoint(ctx, ab, aim);
  if (!p) return { ok: false, tx: h.x, ty: h.y };
  const mult = ab.combo[step % ab.combo.length];
  const hit = abilityHit(ctx, ab) * mult;
  let dir = dirTo(h.x, h.y, p.x, p.y);
  if (dir.x === 0 && dir.y === 0) dir = { ...h.facing };
  const done = (tx: number, ty: number): FormResult => ({ ok: true, tx, ty });
  const buff = (form: 'ward' | 'armor' | 'surge' | 'blink', until: number) => {
    h.defend = { form, until };
    ctx.events.push({ kind: 'buff', form, element: ab.element, until });
  };

  switch (ab.form.id) {
    case 'bolt':
      h.facing = dir;
      spawnProjectile(ctx, {
        owner: 'hero',
        form: 'bolt',
        ability: ab,
        homingId: null,
        x: h.x + dir.x * 0.6,
        y: h.y + dir.y * 0.6,
        vx: dir.x * ab.speed,
        vy: dir.y * ab.speed,
        radius: 0.3 + 0.15 * mult,
        damage: hit,
        element: ab.element,
        pierce: ab.knobs.pierce,
        maxDist: ab.range,
        explodeRadius: ab.radius * mult,
        applies: ab.knobs.applies,
        knockback: ab.knobs.knockback,
      });
      return done(h.x + dir.x * ab.range, h.y + dir.y * ab.range);

    case 'volley': {
      h.facing = dir;
      const n = ab.comboCount?.[step % ab.comboCount.length] ?? ab.count;
      const targets = alive(ctx)
        .filter((m) => dist(h.x, h.y, m.x, m.y) - m.radius <= ab.range + 2)
        .sort((a, b) => dist(h.x, h.y, a.x, a.y) - dist(h.x, h.y, b.x, b.y));
      for (let i = 0; i < n; i++) {
        const d = rotate(dir, (i - (n - 1) / 2) * 0.22);
        spawnProjectile(ctx, {
          owner: 'hero',
          form: 'volley',
          ability: ab,
          homingId: targets.length > 0 ? targets[i % targets.length].id : null,
          x: h.x + d.x * 0.5,
          y: h.y + d.y * 0.5,
          vx: d.x * ab.speed,
          vy: d.y * ab.speed,
          radius: 0.25,
          damage: hit,
          element: ab.element,
          pierce: ab.knobs.pierce,
          maxDist: ab.range + 3,
          explodeRadius: ab.radius,
          applies: ab.knobs.applies,
          knockback: ab.knobs.knockback,
        });
      }
      return done(p.x, p.y);
    }

    case 'lance': {
      h.facing = dir;
      const len = ab.range * mult;
      const ex = h.x + dir.x * len;
      const ey = h.y + dir.y * len;
      const width = ab.radius;
      const hits = alive(ctx)
        .filter((m) => distToSegment(m.x, m.y, h.x, h.y, ex, ey) <= width + m.radius)
        .sort((a, b) => dist(h.x, h.y, a.x, a.y) - dist(h.x, h.y, b.x, b.y));
      ctx.events.push({ kind: 'beam', x: h.x, y: h.y, tx: ex, ty: ey, width, element: ab.element });
      const opts = hitOpts(ab, { x: h.x, y: h.y });
      for (const m of hits) hitMonster(ctx, m, hit, ab.element, opts);
      if (hits.length > 0) {
        const last = hits[hits.length - 1];
        chainFrom(ctx, ab, last, hit, new Set(hits.map((m) => m.id)));
        leaveZone(ctx, ab, hits[0].x, hits[0].y, Math.max(1.2, width * 2), hit);
      }
      return done(ex, ey);
    }

    case 'burst':
      h.facing = dir;
      impact(ctx, ab, p.x, p.y, ab.radius * mult, hit);
      return done(p.x, p.y);

    case 'strike': {
      h.facing = dir;
      const slam = ab.combo.length > 1 && step % ab.combo.length === ab.combo.length - 1;
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
      });
      const opts = hitOpts(ab, { x: h.x, y: h.y });
      for (const m of hits) hitMonster(ctx, m, hit, ab.element, opts);
      if (hits.length > 0) {
        chainFrom(ctx, ab, hits[0], hit, new Set(hits.map((m) => m.id)));
        leaveZone(ctx, ab, h.x + dir.x * reach * 0.5, h.y + dir.y * reach * 0.5, reach * 0.7, hit);
      }
      return done(h.x + dir.x * reach, h.y + dir.y * reach);
    }

    case 'ward':
      h.ward = { hp: h.stats.maxHp * ab.effect, max: h.stats.maxHp * ab.effect };
      buff('ward', t + ab.duration);
      return done(h.x, h.y);

    case 'armor':
      buff('armor', t + ab.duration);
      return done(h.x, h.y);

    case 'surge':
      buff('surge', t + ab.duration);
      return done(h.x, h.y);

    case 'blink': {
      const fromX = h.x;
      const fromY = h.y;
      const d = Math.min(dist(h.x, h.y, p.x, p.y), ab.range);
      h.x = clamp(h.x + dir.x * d, h.radius, world.width - h.radius);
      h.y = clamp(h.y + dir.y * d, h.radius, world.height - h.radius);
      h.facing = dir;
      h.invulnUntil = Math.max(h.invulnUntil, t + ab.effect);
      ctx.events.push({ kind: 'dash', fromX, fromY, toX: h.x, toY: h.y });
      const opts = hitOpts(ab, { x: fromX, y: fromY });
      for (const m of alive(ctx)) {
        if (distToSegment(m.x, m.y, fromX, fromY, h.x, h.y) <= ab.radius + m.radius)
          hitMonster(ctx, m, hit, ab.element, opts);
      }
      buff('blink', t + ctx.bal.abilities.defend.blinkSeconds);
      return done(h.x, h.y);
    }

    case 'nova':
      impact(ctx, ab, h.x, h.y, ab.radius, hit, { noScatter: true });
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
          x: clamp(p.x + Math.cos(a) * r, 0, world.width),
          y: clamp(p.y + Math.sin(a) * r, 0, world.height),
          radius: ab.radius,
          born: t,
          until: at + 0.1,
          tick: 0,
          nextTick: 0,
          damage: hit,
          element: ab.element,
          applies: ab.knobs.applies,
          detonateAt: at,
          dead: false,
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
        applies: ab.knobs.applies,
        detonateAt: 0,
        dead: false,
      });
      return done(p.x, p.y);
  }
}
