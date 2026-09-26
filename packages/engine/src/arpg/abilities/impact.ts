import { ABILITY_SLOTS, type ResolvedAbility } from '../../types/ability.js';
import type { MonsterEntity, Vec } from '../../types/arpg.js';
import { hasMastery } from '../../delve/hero-stats.js';
import { hitMonster, type HitOpts, type SimCtx } from '../combat.js';
import { dist } from '../geometry.js';
import { alive, nearestMonster, spawnProjectile } from './targeting.js';

/** Pyroclasm's embers come off these forms' impacts. */
const EMBER_FORMS = new Set(['bolt', 'burst', 'barrage']);

export function slotIndex(ab: ResolvedAbility): number {
  return ABILITY_SLOTS.indexOf(ab.slot);
}

/** One hit of an ability before per-foe modifiers: weapon damage × the ability's power. */
export function abilityHit(ctx: SimCtx, ab: ResolvedAbility): number {
  const s = ctx.world.hero.stats;
  return s.weaponDamage * s.damageMult * ab.power;
}

/**
 * How an ability's knobs shape each of its hits. `tick` hits (zone ticks,
 * embers) can't crit or knock back; only `direct` hits (the ability landing,
 * not chain jumps or ticks) get the weight's heavy payoff and carry heft.
 */
export function hitOpts(
  ab: ResolvedAbility,
  from: Vec,
  tick = false,
  direct = !tick,
  heft = ab.heft,
): HitOpts {
  const k = ab.knobs;
  const stagger = direct && ab.heavyStagger && !k.applies.includes('stagger');
  return {
    source: 'skill',
    canCrit: !tick,
    applies: stagger ? [...k.applies, 'stagger'] : k.applies,
    knockback: tick ? 0 : k.knockback + (direct ? ab.heavyKnockback : 0),
    kbFrom: from,
    leech: k.lifesteal,
    execute: k.execute,
    spread: k.spread,
    slot: slotIndex(ab),
    heft: direct ? heft : 0,
  };
}

/** Lightning-style jumps from `first` to foes not yet hit, each weaker than the last. */
export function chainFrom(
  ctx: SimCtx,
  ab: ResolvedAbility,
  first: MonsterEntity,
  damage: number,
  hit: Set<number>,
  tick = false,
): void {
  const jumps =
    ab.knobs.chain +
    (ab.knobs.chain > 0 && hasMastery(ctx.registry, ctx.world.hero.stats.attunement, 'storm')
      ? 2
      : 0);
  if (jumps <= 0) return;
  const { chainRange, chainPower } = ctx.bal.abilities;
  const points: Vec[] = [{ x: first.x, y: first.y }];
  let current = first;
  let amount = damage;
  for (let i = 0; i < jumps; i++) {
    const next = nearestMonster(ctx, current.x, current.y, chainRange, hit);
    if (!next) break;
    hit.add(next.id);
    amount *= chainPower;
    points.push({ x: next.x, y: next.y });
    hitMonster(ctx, next, amount, ab.element, hitOpts(ab, current, tick, false));
    current = next;
  }
  if (points.length > 1) ctx.events.push({ kind: 'chain', points, element: ab.element });
}

/** Lingering ground (Magma, Rimebloom, Wildfire…) where an ability lands. */
export function leaveZone(
  ctx: SimCtx,
  ab: ResolvedAbility,
  x: number,
  y: number,
  radius: number,
  damage: number,
): void {
  const zone = ab.knobs.zone;
  if (!zone) return;
  const { world } = ctx;
  world.zones.push({
    id: world.nextId++,
    owner: 'hero',
    source: ab.fusion?.id ?? ab.form.id,
    ability: ab,
    x,
    y,
    radius,
    born: world.t,
    until: world.t + zone.seconds,
    tick: 0.5,
    nextTick: world.t + 0.5,
    damage: damage * zone.tickPower,
    element: ab.element,
    applies: ab.knobs.applies,
    detonateAt: 0,
    dead: false,
  });
}

/** Drag foes toward a point (bosses don't budge, elites half as far). */
function pull(ctx: SimCtx, x: number, y: number, reach: number, strength: number): void {
  for (const m of alive(ctx)) {
    if (m.kind === 'boss' || dist(x, y, m.x, m.y) > reach) continue;
    const k = strength * (m.kind === 'elite' ? 0.5 : 1);
    m.x += (x - m.x) * k;
    m.y += (y - m.y) * k;
  }
}

function embers(ctx: SimCtx, ab: ResolvedAbility, x: number, y: number, damage: number): void {
  const { world } = ctx;
  const pyro = world.hero.stats.legendaries.pyroclasm ?? 0;
  if (pyro <= 0 || !ab.elements.includes('fire') || !EMBER_FORMS.has(ab.form.id)) return;
  for (let i = 0; i < 3; i++) {
    const a = (Math.PI * 2 * i) / 3 + world.rng.next();
    spawnProjectile(ctx, {
      owner: 'hero',
      form: 'ember',
      ability: ab,
      homingId: null,
      x,
      y,
      vx: Math.cos(a) * 8,
      vy: Math.sin(a) * 8,
      radius: 0.3,
      damage: damage * (pyro / 100),
      element: ab.element,
      pierce: false,
      maxDist: 3,
      explodeRadius: 1.1,
      applies: ab.knobs.applies,
      knockback: 0,
    });
  }
}

export interface ImpactOpts {
  /** Knockback source (defaults to the impact point). */
  from?: Vec;
  /** A lingering tick or an ember: no crits, scatter, knockback, zones or embers. */
  tick?: boolean;
  noScatter?: boolean;
  /** Don't emit an explosion event (zone ticks). */
  silent?: boolean;
  /** How hard direct hits land (defaults to the ability's). */
  heft?: number;
}

/**
 * Where every offensive ability deals its damage: scatter, pull, the area
 * hit, chains, lingering ground and Pyroclasm's embers all happen here, so
 * any element or fusion works on any form. Returns the foes hit.
 */
export function impact(
  ctx: SimCtx,
  ab: ResolvedAbility,
  x: number,
  y: number,
  radius: number,
  damage: number,
  o: ImpactOpts = {},
): MonsterEntity[] {
  const { world } = ctx;
  const k = ab.knobs;
  if (k.scatter > 0 && !o.tick && !o.noScatter) {
    const reach = k.scatter * radius * ctx.bal.abilities.scatterReach;
    const a = world.rng.next() * Math.PI * 2;
    const r = reach * (0.3 + 0.7 * world.rng.next());
    x = Math.max(0, Math.min(world.width, x + Math.cos(a) * r));
    y = Math.max(0, Math.min(world.height, y + Math.sin(a) * r));
    radius *= 1 + (world.rng.next() * 2 - 1) * 0.3 * k.scatter;
  }
  if (k.pull) pull(ctx, x, y, radius * 2.2, o.tick ? 0.15 : 0.75);
  if (!o.silent) ctx.events.push({ kind: 'explode', x, y, radius, element: ab.element });

  const hits = alive(ctx).filter((m) => dist(x, y, m.x, m.y) <= radius + m.radius);
  const opts = hitOpts(ab, o.from ?? { x, y }, o.tick, !o.tick, o.heft ?? ab.heft);
  for (const m of hits) hitMonster(ctx, m, damage, ab.element, opts);

  if (hits.length > 0) {
    const first = hits.reduce((a, b) => (dist(x, y, a.x, a.y) <= dist(x, y, b.x, b.y) ? a : b));
    chainFrom(ctx, ab, first, damage, new Set(hits.map((m) => m.id)), o.tick);
  }
  if (!o.tick) {
    leaveZone(ctx, ab, x, y, radius, damage);
    embers(ctx, ab, x, y, damage);
  }
  return hits;
}
