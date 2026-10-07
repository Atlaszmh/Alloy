import type { Knobs, ResolvedAbility } from '../../types/ability.js';
import type { MonsterEntity } from '../../types/arpg.js';
import { applyStatus, hitMonster, type SimCtx } from '../combat.js';
import { abilityHit, impact, knobHitOpts } from './impact.js';
import { chainMove, chargeCap } from './resolve.js';

const DEFENSIVE = 1;

/** The Defensive move whose effect is up (`defend.move` at its stage), else null. */
export function defendingAbility(ctx: SimCtx): ResolvedAbility | null {
  const h = ctx.world.hero;
  if (!h.defend || ctx.world.t >= h.defend.until) return null;
  // A Defensive's effect runs only with a Defensive chain (a new one ends it).
  return chainMove(h.chains[DEFENSIVE]!, h.defend.move, h.defend.stage);
}

/**
 * Guard (`guardOnLand`): a move or a blow that lands puts up a shield of that
 * fraction of max life for `delve.runes.guardSeconds`, as Obsidian's barrier
 * (it soaks after the Defensive's reductions and before the Ward). It never
 * keeps a larger barrier alive: holding at least the barrier's life left (or
 * with none up), it sets the barrier to its value for a fresh `guardSeconds`;
 * against a larger one it does nothing.
 */
export function guardLand(ctx: SimCtx, knobs: Knobs): void {
  if (knobs.guardOnLand <= 0) return;
  const h = ctx.world.hero;
  const hp = h.stats.maxHp * knobs.guardOnLand;
  if (h.barrier && h.barrier.hp > hp) return;
  // A floor-long barrier (Stone Skin) stays floor-long under a larger Guard.
  const until = h.barrier?.until === Infinity ? Infinity : ctx.world.t + ctx.bal.runes.guardSeconds;
  h.barrier = { hp, max: hp, until };
}

/** The Surge while it is up, else null. */
export function surging(ctx: SimCtx): ResolvedAbility | null {
  return ctx.world.hero.defend?.form === 'surge' ? defendingAbility(ctx) : null;
}

/** The Ward (the Defensive move `ab`) bursts with its element around the hero. */
export function wardBurst(ctx: SimCtx, ab: ResolvedAbility): void {
  const h = ctx.world.hero;
  h.ward = null;
  ctx.events.push({ kind: 'wardBreak', x: h.x, y: h.y, element: ab.element });
  impact(ctx, ab, h.x, h.y, ab.radius, abilityHit(ctx, ab), { noScatter: true });
}

/**
 * Damage the hero takes after its guards: Armor and Earth reduce it, melee
 * attackers catch the element (Armor strikes back), then Obsidian's barrier
 * (with or without a Defensive) and the Ward soak it up.
 */
export function shieldHero(
  ctx: SimCtx,
  dmg: number,
  source: MonsterEntity | null,
  melee: boolean,
): number {
  const h = ctx.world.hero;
  const ab = defendingAbility(ctx);
  const form = ab ? h.defend!.form : null;
  if (ab) {
    if (form === 'armor') dmg *= 1 - Math.min(0.75, ab.effect);
    if (ab.elements.includes('earth')) dmg *= 1 - ctx.bal.abilities.defend.earthReduction;

    if (melee && source && !source.dead) {
      const rattles = ab.elements.includes('earth');
      if (form === 'armor') {
        hitMonster(ctx, source, abilityHit(ctx, ab), ab.element, {
          source: 'skill',
          applies: ab.knobs.applies,
          ...knobHitOpts(ab.knobs),
          slot: DEFENSIVE,
          rattles,
        });
      } else {
        for (const s of ab.knobs.applies)
          if (!source.dead) applyStatus(ctx, source, s, abilityHit(ctx, ab) * 0.5, rattles);
      }
    }
  }

  if (h.barrier) {
    const soaked = Math.min(h.barrier.hp, dmg);
    h.barrier.hp -= soaked;
    dmg -= soaked;
    if (h.barrier.hp <= 1e-6) {
      h.barrier = null;
      ctx.events.push({ kind: 'barrierBreak', x: h.x, y: h.y });
    }
  }

  if (form === 'ward' && h.ward) {
    const soaked = Math.min(h.ward.hp, dmg);
    h.ward.hp -= soaked;
    dmg -= soaked;
    if (h.ward.hp <= 1e-6) {
      h.defend = null;
      wardBurst(ctx, ab!);
    }
  }
  return dmg;
}

/** Expire the Defensive (a Ward bursts as it fades) and apply Nature's regeneration. */
export function defendTick(ctx: SimCtx, dt: number): void {
  const { world } = ctx;
  const h = world.hero;
  if (!h.defend) return;
  const ab = chainMove(h.chains[DEFENSIVE]!, h.defend.move, h.defend.stage);
  if (world.t >= h.defend.until) {
    const wasWard = h.defend.form === 'ward' && h.ward;
    h.defend = null;
    if (wasWard) wardBurst(ctx, ab);
    return;
  }
  if (ab.elements.includes('nature') && h.hp < h.stats.maxHp) {
    h.hp = Math.min(
      h.stats.maxHp,
      h.hp + h.stats.maxHp * ctx.bal.abilities.defend.natureRegen * dt,
    );
  }
}

/**
 * Charge-paid chains bank one unit per weapon-hit worth of damage the hero
 * deals, up to their largest need; a chain never charges from its own hits,
 * nor while any of its moves cools down (its lockout).
 */
export function addCharge(ctx: SimCtx, amount: number, fromSlot: number | undefined): void {
  const h = ctx.world.hero;
  const unit = Math.max(1, h.stats.weaponDamage * h.stats.damageMult);
  gainCharge(ctx, amount / unit, fromSlot);
}

export function gainCharge(ctx: SimCtx, units: number, fromSlot?: number): void {
  const h = ctx.world.hero;
  const t = ctx.world.t;
  h.chains.forEach((chain, i) => {
    if (chain?.payment !== 'charge' || i === fromSlot || h.cooldowns[i].some((c) => t < c)) return;
    h.charge[i] = Math.min(chargeCap(chain), h.charge[i] + units);
  });
}
