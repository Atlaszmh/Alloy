import type { DerivedStats, Element } from '../types/derived-stats.js';
import type { ActiveDOT } from '../types/combat.js';

/**
 * Calculate physical damage after armor mitigation and armor penetration.
 * Formula: physicalDamage * (1 - armor * (1 - armorPenetration))
 */
export function calculatePhysicalDamage(attacker: DerivedStats, defender: DerivedStats): number {
  const effectiveArmor = defender.armor * (1 - attacker.armorPenetration);
  const mitigation = Math.max(0, Math.min(1, effectiveArmor));
  return Math.max(0, attacker.physicalDamage * (1 - mitigation));
}

/**
 * Calculate elemental damage for a specific element after resistance and penetration.
 * Formula: elementalDamage[type] * (1 - resistance[type] * (1 - elementalPenetration))
 */
export function calculateElementalDamage(
  attacker: DerivedStats,
  defender: DerivedStats,
  element: Element,
): number {
  const baseDmg = attacker.elementalDamage[element];
  if (baseDmg <= 0) return 0;
  const effectiveResist = defender.resistances[element] * (1 - attacker.elementalPenetration);
  const mitigation = Math.max(0, Math.min(1, effectiveResist));
  return Math.max(0, baseDmg * (1 - mitigation));
}

/**
 * Calculate DOT tick damage after resistance and DOT multiplier.
 */
export function calculateDOTDamage(
  dot: ActiveDOT,
  defender: DerivedStats,
  attacker: DerivedStats,
): number {
  const resist = defender.resistances[dot.element] * (1 - attacker.elementalPenetration);
  const effectiveResist = Math.max(0, Math.min(1, resist));
  const rawDamage = dot.damagePerTick * dot.stacks;
  return Math.max(0, rawDamage * (1 - effectiveResist) * attacker.dotMultiplier);
}
