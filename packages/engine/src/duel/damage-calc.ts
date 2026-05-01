import type { DerivedStats, Element } from '../types/derived-stats.js';
import type {
  DamageBreakdown,
  PhysicalBreakdown,
  ElementalBreakdown,
  DotTickBreakdown,
} from '../types/damage-breakdown.js';
import type { PassiveDamageModifier, GladiatorRuntime } from '../types/combat.js';
import { ALL_ELEMENTS } from '../types/derived-stats.js';
import { evaluatePassiveModifierCondition } from './trigger-system.js';

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
 *
 * `attackerModifiers` are conditional damage multipliers contributed by the
 * attacker's equipped compounds (built once at duel start by
 * extractPassiveModifiers). When `attackerRuntime` and `defenderRuntime` are
 * both supplied, each modifier's condition is evaluated against current state
 * and the multiplier is applied to the matching damage type.
 */
export function calculateAttackBreakdown(
  attacker: DerivedStats,
  defender: DerivedStats,
  isCrit: boolean,
  isDodged: boolean,
  blockAmount: number,
  attackerModifiers: PassiveDamageModifier[] = [],
  attackerRuntime?: GladiatorRuntime,
  defenderRuntime?: GladiatorRuntime,
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
  let rawPhysical = Math.round(attacker.physicalDamage * critMult);
  if (attackerRuntime && defenderRuntime) {
    for (const mod of attackerModifiers) {
      if (mod.damageType !== 'physical') continue;
      if (evaluatePassiveModifierCondition(mod.condition, attackerRuntime, defenderRuntime)) {
        rawPhysical = Math.round(rawPhysical * mod.multiplier);
      }
    }
  }
  const physical = buildPhysicalBreakdown(rawPhysical, defender.armor, attacker.armorPenetration);

  // Elemental
  const elemental: Partial<Record<Element, ElementalBreakdown>> = {};
  let elemTotalRaw = 0;
  let elemTotalMitigated = 0;
  let elemTotalNet = 0;

  for (const el of ALL_ELEMENTS) {
    const baseDmg = attacker.elementalDamage[el];
    if (baseDmg <= 0) continue;
    let rawElem = Math.round(baseDmg * critMult);
    // Apply passive damage modifiers for this element if their conditions hold
    if (attackerRuntime && defenderRuntime) {
      for (const mod of attackerModifiers) {
        if (mod.damageType !== el) continue;
        if (evaluatePassiveModifierCondition(mod.condition, attackerRuntime, defenderRuntime)) {
          rawElem = Math.round(rawElem * mod.multiplier);
        }
      }
    }
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
 *
 * stackMultiplier is a per-target element-amplifier scalar applied to
 * effective stacks (default 1.0 — no amplification). Set by the duel
 * loop when the defender has an active elementAmplifier for this element.
 */
export function calculateDOTBreakdown(
  element: Element,
  damagePerSecond: number,
  stacks: number,
  defender: DerivedStats,
  attackerElemPen: number,
  attackerDotMultiplier: number,
  stackMultiplier: number = 1.0,
): DotTickBreakdown {
  const rawTotal = Math.round(damagePerSecond * stacks * stackMultiplier * (attackerDotMultiplier / 100));
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
