import type { CompoundEffectShape } from '@alloy/engine';

/**
 * Convert a CompoundEffectBlueprint's effect shape into a player-readable
 * description string for the gem inspect panel. Encodes per-tier scaling so
 * the player sees the actual numbers their gem will produce.
 */
export function describeCompoundEffect(effect: CompoundEffectShape, gemTier: number): string {
  switch (effect.kind) {
    case 'compound_dot': {
      const dps = effect.dpsPerTier * gemTier;
      const total = Math.round(dps * effect.dotMultiplier * effect.duration);
      return `${dps} ${effect.element} damage/sec × ${effect.duration}s (${total} total, ${effect.dotMultiplier}× multiplier)`;
    }
    case 'apply_dot':
      return `${effect.dpsPerTier * gemTier} ${effect.element} damage/sec for ${effect.duration}s`;
    case 'apply_slow':
      return `Slow target by ${Math.round((effect.multiplier - 1) * 100)}% for ${effect.duration}s`;
    case 'amplify_dot_element':
      return `${effect.element} DOTs deal ${effect.stackMultiplier}× damage and tick ${effect.tickMultiplier}× faster for ${effect.duration}s (DOT amplifier)`;
    case 'reduce_max_hp':
      return `Reduce target max HP by ${Math.round(effect.fraction * 100)}% for ${effect.duration}s`;
    case 'damage_current_hp':
      return `Deal ${Math.round(effect.fraction * 100)}% of target current HP as damage`;
    case 'gain_barrier': {
      const amt = (effect.amount ?? 0) + (effect.amountPerTier ?? 0) * gemTier;
      const amount = effect.isPercent ? `${Math.round(amt * 100)}% max HP` : `${amt} HP`;
      const dur = effect.duration && effect.duration > 0 ? ` for ${effect.duration}s` : '';
      return `Gain ${amount} barrier${dur}`;
    }
    case 'stun':
      return `Stun target for ${effect.duration}s`;
    case 'reflect_damage':
      return `Reflect ${Math.round(effect.multiplier * 100)}% of incoming damage for ${effect.duration}s`;
    case 'heal': {
      const amt = (effect.amount ?? 0) + (effect.amountPerTier ?? 0) * gemTier;
      return effect.isPercent ? `Heal ${Math.round(amt * 100)}% max HP` : `Heal ${amt} HP`;
    }
    case 'bonus_damage': {
      const amt = (effect.amount ?? 0) + (effect.amountPerTier ?? 0) * gemTier;
      return `Deal ${amt} ${effect.damageType} damage`;
    }
    case 'bonus_damage_scaled':
      return `Echo ${Math.round(effect.multiplier * 100)}% of attack damage as ${effect.damageType}`;
    case 'stat_buff_add': {
      const v = (effect.value ?? 0) + (effect.valuePerTier ?? 0) * gemTier;
      const sign = v >= 0 ? '+' : '';
      return `${sign}${v} ${effect.stat} for ${effect.duration}s`;
    }
    case 'stat_buff_mul': {
      const pct = Math.round((effect.multiplier - 1) * 100);
      const sign = pct >= 0 ? '+' : '';
      return `${sign}${pct}% ${effect.stat} for ${effect.duration}s`;
    }
  }
}
