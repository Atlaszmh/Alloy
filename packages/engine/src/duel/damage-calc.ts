import type { DerivedStats, Element } from '../types/derived-stats.js';
import type { ActiveDOT } from '../types/combat.js';

/**
 * Calculate physical damage after armor mitigation and armor penetration.
 * Armor and armorPenetration are integer percentages (1 = 1%).
 * Formula: physicalDamage * (1 - (armor/100) * (1 - armorPenetration/100))
 */
export function calculatePhysicalDamage(attacker: DerivedStats, defender: DerivedStats): number {
  const effectiveArmor = (defender.armor / 100) * (1 - attacker.armorPenetration / 100);
  const mitigation = Math.max(0, Math.min(1, effectiveArmor));
  return Math.max(0, attacker.physicalDamage * (1 - mitigation));
}

/**
 * Calculate elemental damage for a specific element after resistance and penetration.
 * Resistances and elementalPenetration are integer percentages (1 = 1%).
 * Formula: elementalDamage[type] * (1 - (resistance[type]/100) * (1 - elementalPenetration/100))
 */
export function calculateElementalDamage(
  attacker: DerivedStats,
  defender: DerivedStats,
  element: Element,
): number {
  const baseDmg = attacker.elementalDamage[element];
  if (baseDmg <= 0) return 0;
  const effectiveResist = (defender.resistances[element] / 100) * (1 - attacker.elementalPenetration / 100);
  const mitigation = Math.max(0, Math.min(1, effectiveResist));
  return Math.max(0, baseDmg * (1 - mitigation));
}

/**
 * Calculate DOT tick damage after resistance and DOT multiplier.
 * dotMultiplier is integer scale (100 = 1.0x baseline).
 */
export function calculateDOTDamage(
  dot: ActiveDOT,
  defender: DerivedStats,
  attacker: DerivedStats,
): number {
  const resist = (defender.resistances[dot.element] / 100) * (1 - attacker.elementalPenetration / 100);
  const effectiveResist = Math.max(0, Math.min(1, resist));
  const rawDamage = dot.damagePerTick * dot.stacks;
  return Math.max(0, rawDamage * (1 - effectiveResist) * (attacker.dotMultiplier / 100));
}
