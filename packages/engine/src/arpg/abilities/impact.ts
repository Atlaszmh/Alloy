import {
  ABILITY_SLOTS,
  type Knobs,
  type ResolvedAbility,
  type SplitKnob,
  type ZoneKnob,
} from '../../types/ability.js';
import type { MonsterEntity, StatusId, Vec } from '../../types/arpg.js';
import type { ManaType } from '../../types/mana.js';
import { hasMastery } from '../../delve/hero-stats.js';
import { hitMonster, type HitOpts, type SimCtx } from '../combat.js';
import { dirTo, dist } from '../geometry.js';
import { snapToWalkable } from '../grid.js';
import { alive, nearestMonster, spawnProjectile } from './targeting.js';

/** Pyroclasm's embers come off these forms' impacts. */
const EMBER_FORMS = new Set(['bolt', 'burst', 'barrage']);

/** A Split shard's size: it hits what it touches. */
const SHARD_RADIUS = 0.2;

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
 * not chain jumps or ticks) get the weight's heavy payoff and stacks, and carry
 * heft (the rest apply `stacks.tick`).
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
    ...knobHitOpts(k),
    execute: k.execute,
    spread: k.spread,
    slot: slotIndex(ab),
    heft: direct ? heft : 0,
    // Either element counts: an ability applies both elements' statuses.
    rattles: ab.elements.includes('earth'),
    stacks: direct ? ab.stacks : undefined,
  };
}

/**
 * Lightning-style jumps from `first` to foes not yet hit (`hit`, which they
 * join), each `chainPower` weaker than the last: `jumps` of them, 2 more with
 * the Storm mastery when there are any. Each hits with `opts`, knocked back
 * from the foe it jumps from. Abilities (`chainFrom`) and basic blows share it.
 */
export function chainJumps(
  ctx: SimCtx,
  first: MonsterEntity,
  damage: number,
  element: ManaType,
  jumps: number,
  opts: HitOpts,
  hit: Set<number>,
): void {
  const storm = hasMastery(ctx.registry, ctx.world.hero.stats.attunement, 'storm');
  const total = jumps + (jumps > 0 && storm ? 2 : 0);
  if (total <= 0) return;
  const { chainRange, chainPower } = ctx.bal.abilities;
  const points: Vec[] = [{ x: first.x, y: first.y }];
  let current = first;
  let amount = damage;
  for (let i = 0; i < total; i++) {
    const next = nearestMonster(ctx, current.x, current.y, chainRange, hit);
    if (!next) break;
    hit.add(next.id);
    amount *= chainPower;
    points.push({ x: next.x, y: next.y });
    hitMonster(ctx, next, amount, element, { ...opts, kbFrom: current });
    current = next;
  }
  if (points.length > 1) ctx.events.push({ kind: 'chain', points, element });
}

/** An ability's jumps (its `chain` knob) from `first`: hits that aren't direct. */
export function chainFrom(
  ctx: SimCtx,
  ab: ResolvedAbility,
  first: MonsterEntity,
  damage: number,
  hit: Set<number>,
  tick = false,
): void {
  const opts = hitOpts(ab, first, tick, false);
  chainJumps(ctx, first, damage, ab.element, ab.knobs.chain, opts, hit);
}
/**
 * Whether skill `slot` (3: the basic attack) may leave `zone` now: a capped zone (Linger's,
 * `perCast`) spends one of the cast's (`HeroEntity.zonesLeft`); an uncapped one always may.
 */
export function spendZone(ctx: SimCtx, slot: number, zone: ZoneKnob): boolean {
  if (zone.perCast === undefined) return true;
  const left = ctx.world.hero.zonesLeft;
  if (left[slot] <= 0) return false;
  left[slot]--;
  return true;
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
  if (!zone || !spendZone(ctx, slotIndex(ab), zone)) return;
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
  /**
   * A shot's later impact as it pierces on, by a rune's count (see the runes spec's balance
   * pass): it hits, but its jumps, zone and shards come off its first foe only.
   */
  through?: boolean;
}

/** The hit-time knobs a hit carries: lifesteal, Volatile and Drain (see the runes spec). */
export function knobHitOpts(k: Knobs): Pick<HitOpts, 'leech' | 'catalyst' | 'manaOnHit'> {
  return { leech: k.lifesteal, catalyst: k.catalyst, manaOnHit: k.manaOnHit };
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
    ({ x, y } = snapToWalkable(world.map, x + Math.cos(a) * r, y + Math.sin(a) * r));
    radius *= 1 + (world.rng.next() * 2 - 1) * 0.3 * k.scatter;
  }
  if (k.pull) pull(ctx, x, y, radius * 2.2, o.tick ? 0.15 : 0.75);
  // A tick (a zone tick, an ember) draws no infusion.
  if (!o.silent)
    ctx.events.push({
      kind: 'explode',
      x,
      y,
      radius,
      element: ab.element,
      infusion: o.tick ? null : (ab.elements[1] ?? null),
    });

  const hits = alive(ctx).filter((m) => dist(x, y, m.x, m.y) <= radius + m.radius);
  const opts = hitOpts(ab, o.from ?? { x, y }, o.tick, !o.tick, o.heft ?? ab.heft);
  for (const m of hits) hitMonster(ctx, m, damage, ab.element, opts);

  if (hits.length > 0 && !o.through) {
    const first = hits.reduce((a, b) => (dist(x, y, a.x, a.y) <= dist(x, y, b.x, b.y) ? a : b));
    chainFrom(ctx, ab, first, damage, new Set(hits.map((m) => m.id)), o.tick);
  }
  if (!o.tick) {
    if (!o.through) leaveZone(ctx, ab, x, y, radius, damage);
    embers(ctx, ab, x, y, damage);
    // Split: an impact that hit sheds shards, each carrying the move without the knobs that
    // would multiply them (shards of shards, a zone or an echo per shard).
    if (k.split && hits.length > 0 && !o.through) {
      const ability: ResolvedAbility = {
        ...ab,
        knobs: {
          ...k,
          split: null,
          extraShots: null,
          echo: 0,
          zone: null,
          chain: 0,
          guardOnLand: 0,
        },
      };
      shedShards(ctx, x, y, k.split, damage, hits, {
        ability,
        element: ab.element,
        applies: k.applies,
      });
    }
  }
  return hits;
}

/**
 * Split: `split.count` shards from (x, y), evenly spaced round a circle that
 * starts along the way from the hero to (x, y) (no RNG), each at `damage` ×
 * `split.power`, skipping the foes in `hit`, flying `shardSpeed` for
 * `shardRange` and ending there. An ability's shard (`carry.ability`) hits only
 * the foe it touches, as the move's direct hit; a basic shot's hits as a basic
 * shot (a tick's stacks). A `runeFx` marks it.
 */
export function shedShards(
  ctx: SimCtx,
  x: number,
  y: number,
  split: SplitKnob,
  damage: number,
  hit: readonly MonsterEntity[],
  carry: { ability: ResolvedAbility | null; element: ManaType | null; applies: StatusId[] },
): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const way = dirTo(h.x, h.y, x, y);
  const from = way.x === 0 && way.y === 0 ? h.facing : way;
  const start = Math.atan2(from.y, from.x);
  for (let i = 0; i < split.count; i++) {
    const a = start + (Math.PI * 2 * i) / split.count;
    spawnProjectile(ctx, {
      owner: 'hero',
      form: 'shard',
      ability: carry.ability,
      homingId: null,
      x,
      y,
      vx: Math.cos(a) * bal.runes.shardSpeed,
      vy: Math.sin(a) * bal.runes.shardSpeed,
      radius: SHARD_RADIUS,
      damage: damage * split.power,
      element: carry.element,
      pierce: false,
      pierceLeft: 0,
      maxDist: bal.runes.shardRange,
      explodeRadius: 0,
      applies: carry.applies,
      knockback: 0,
      heft: 0,
      hitIds: hit.map((m) => m.id),
    });
  }
  ctx.events.push({ kind: 'runeFx', effect: 'split', x, y, element: carry.element });
}
