import type { ResolvedAbility } from '../../types/ability.js';
import type { MonsterEntity } from '../../types/arpg.js';
import { applyStatus, hitMonster, type SimCtx } from '../combat.js';
import { abilityHit, impact } from './impact.js';

const DEFENSIVE = 1;

/** The Defensive ability while its effect is up, else null. */
export function defendingAbility(ctx: SimCtx): ResolvedAbility | null {
  const h = ctx.world.hero;
  if (!h.defend || ctx.world.t >= h.defend.until) return null;
  return h.abilities[DEFENSIVE] ?? null;
}

/** The Ward bursts with its element around the hero. */
export function wardBurst(ctx: SimCtx): void {
  const h = ctx.world.hero;
  const ab = h.abilities[DEFENSIVE];
  h.ward = null;
  if (!ab) return;
  ctx.events.push({ kind: 'wardBreak', x: h.x, y: h.y, element: ab.element });
  impact(ctx, ab, h.x, h.y, ab.radius, abilityHit(ctx, ab), { noScatter: true });
}

/**
 * Damage the hero takes after the Defensive: Armor and Earth reduce it, the
 * Ward soaks it up, and melt attackers catch the element (Armor strikes back).
 */
export function shieldHero(
  ctx: SimCtx,
  dmg: number,
  source: MonsterEntity | null,
  melee: boolean,
): number {
  const ab = defendingAbility(ctx);
  if (!ab) return dmg;
  const h = ctx.world.hero;
  const form = h.defend!.form;
  if (form === 'armor') dmg *= 1 - Math.min(0.75, ab.effect);
  if (ab.elements.includes('earth')) dmg *= 1 - ctx.bal.abilities.defend.earthReduction;

  if (melee && source && !source.dead) {
    if (form === 'armor') {
      hitMonster(ctx, source, abilityHit(ctx, ab), ab.element, {
        source: 'skill',
        applies: ab.knobs.applies,
        leech: ab.knobs.lifesteal,
        slot: DEFENSIVE,
      });
    } else {
      for (const s of ab.knobs.applies)
        if (!source.dead) applyStatus(ctx, source, s, abilityHit(ctx, ab) * 0.5);
    }
  }

  if (form === 'ward' && h.ward) {
    const soaked = Math.min(h.ward.hp, dmg);
    h.ward.hp -= soaked;
    dmg -= soaked;
    if (h.ward.hp <= 1e-6) {
      h.defend = null;
      wardBurst(ctx);
    }
  }
  return dmg;
}

/** Expire the Defensive (a Ward bursts as it fades) and apply Nature's regeneration. */
export function defendTick(ctx: SimCtx, dt: number): void {
  const { world } = ctx;
  const h = world.hero;
  if (!h.defend) return;
  if (world.t >= h.defend.until) {
    const wasWard = h.defend.form === 'ward' && h.ward;
    h.defend = null;
    if (wasWard) wardBurst(ctx);
    return;
  }
  const ab = h.abilities[DEFENSIVE];
  if (ab?.elements.includes('nature') && h.hp < h.stats.maxHp) {
    h.hp = Math.min(
      h.stats.maxHp,
      h.hp + h.stats.maxHp * ctx.bal.abilities.defend.natureRegen * dt,
    );
  }
}

/**
 * Charge-paid abilities bank one unit per weapon-hit worth of damage the hero
 * deals; an ability never charges from its own hits, nor during its lockout.
 */
export function addCharge(ctx: SimCtx, amount: number, fromSlot: number | undefined): void {
  const h = ctx.world.hero;
  const unit = Math.max(1, h.stats.weaponDamage * h.stats.damageMult);
  gainCharge(ctx, amount / unit, fromSlot);
}

export function gainCharge(ctx: SimCtx, units: number, fromSlot?: number): void {
  const h = ctx.world.hero;
  h.abilities.forEach((ab, i) => {
    if (ab.build.payment !== 'charge' || i === fromSlot || ctx.world.t < h.cooldowns[i]) return;
    h.charge[i] = Math.min(ab.chargeNeed, h.charge[i] + units);
  });
}
