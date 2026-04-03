import type { DerivedStats, Element } from '../types/derived-stats.js';
import type {
  DamageBreakdown,
  PhysicalBreakdown,
  ElementalBreakdown,
  DotTickBreakdown,
} from '../types/damage-breakdown.js';
import { ALL_ELEMENTS } from '../types/derived-stats.js';

/**
 * Build a PhysicalBreakdown for a given raw physical damage value.
 */
function buildPhysicalBreakdown(
  raw: number,
  armorPoints: number,
  armorPenetration: number,
): PhysicalBreakdown {
  const effectiveArmor = Math.max(0, armorPoints - armorPenetration);
  const reductionPct = Math.min(effectiveArmor, 90);
  const mitigated = Math.round((raw * reductionPct) / 100);
  const net = Math.max(0, raw - mitigated);
  return { raw, armorPoints, armorPenetration, effectiveArmor, reductionPct, mitigated, net };
}

/**
 * Build an ElementalBreakdown for a single element.
 */
function buildElementalBreakdown(
  raw: number,
  resistPoints: number,
  elementalPenetration: number,
): ElementalBreakdown {
  const effectiveResist = Math.max(0, resistPoints - elementalPenetration);
  const reductionPct = Math.min(effectiveResist, 90);
  const mitigated = Math.round((raw * reductionPct) / 100);
  const net = Math.max(0, raw - mitigated);
  return { raw, resistPoints, elementalPenetration, effectiveResist, reductionPct, mitigated, net };
}

/**
 * Calculate a full attack breakdown including physical, elemental, crit,
 * dodge, and block.
 */
export function calculateAttackBreakdown(
  attacker: DerivedStats,
  defender: DerivedStats,
  isCrit: boolean,
  isDodged: boolean,
  blockAmount: number,
): DamageBreakdown {
  // Dodge → zero everything
  if (isDodged) {
    return {
      dodged: true,
      physical: { raw: 0, armorPoints: 0, armorPenetration: 0, effectiveArmor: 0, reductionPct: 0, mitigated: 0, net: 0 },
      elemental: {},
      blocked: 0,
      barrierAbsorbed: 0,
      totalRaw: 0,
      totalMitigated: 0,
      totalNet: 0,
      isCrit,
    };
  }

  // Crit multiplier (integer scale: 150 = 1.5x)
  const critMult = isCrit ? attacker.critMultiplier / 100 : 1;

  // Physical
  const rawPhysical = Math.round(attacker.physicalDamage * critMult);
  const physical = buildPhysicalBreakdown(rawPhysical, defender.armor, attacker.armorPenetration);

  // Elemental
  const elemental: Partial<Record<Element, ElementalBreakdown>> = {};
  let elemTotalRaw = 0;
  let elemTotalMitigated = 0;
  let elemTotalNet = 0;

  for (const el of ALL_ELEMENTS) {
    const baseDmg = attacker.elementalDamage[el];
    if (baseDmg <= 0) continue;
    const rawElem = Math.round(baseDmg * critMult);
    const eb = buildElementalBreakdown(rawElem, defender.resistances[el], attacker.elementalPenetration);
    elemental[el] = eb;
    elemTotalRaw += eb.raw;
    elemTotalMitigated += eb.mitigated;
    elemTotalNet += eb.net;
  }

  const totalRaw = physical.raw + elemTotalRaw;
  const totalMitigated = physical.mitigated + elemTotalMitigated;
  const preBlockNet = physical.net + elemTotalNet;

  // Block subtraction
  const blocked = Math.min(blockAmount, preBlockNet);
  const totalNet = Math.max(0, preBlockNet - blocked);

  return {
    dodged: false,
    physical,
    elemental,
    blocked,
    barrierAbsorbed: 0, // filled in by duel-engine when barrier is consumed
    totalRaw,
    totalMitigated,
    totalNet,
    isCrit,
    ...(isCrit ? { critMultiplier: critMult } : {}),
  };
}

/**
 * Calculate a DOT tick breakdown after resistance and DOT multiplier.
 * attackerDotMultiplier is integer scale (100 = 1.0x).
 * attackerElemPen is integer points.
 */
export function calculateDOTBreakdown(
  element: Element,
  damagePerSecond: number,
  stacks: number,
  defender: DerivedStats,
  attackerElemPen: number,
  attackerDotMultiplier: number,
): DotTickBreakdown {
  const rawTotal = Math.round(damagePerSecond * stacks * (attackerDotMultiplier / 100));
  const resistPoints = defender.resistances[element];
  const effectiveResist = Math.max(0, resistPoints - attackerElemPen);
  const reductionPct = Math.min(effectiveResist, 90);
  const mitigated = Math.round((rawTotal * reductionPct) / 100);
  const netDamage = Math.max(0, rawTotal - mitigated);

  return {
    element,
    damagePerSecond,
    stacks,
    rawTotal,
    resistPoints,
    elementalPenetration: attackerElemPen,
    effectiveResist,
    reductionPct,
    netDamage,
  };
}
