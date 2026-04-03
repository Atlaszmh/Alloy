import type { Element } from './derived-stats.js';

export interface PhysicalBreakdown {
  raw: number;
  armorPoints: number;
  armorPenetration: number;
  effectiveArmor: number;
  reductionPct: number;
  mitigated: number;
  net: number;
}

export interface ElementalBreakdown {
  raw: number;
  resistPoints: number;
  elementalPenetration: number;
  effectiveResist: number;
  reductionPct: number;
  mitigated: number;
  net: number;
}

export interface DamageBreakdown {
  dodged: boolean;
  physical: PhysicalBreakdown;
  elemental: Partial<Record<Element, ElementalBreakdown>>;
  blocked: number;
  barrierAbsorbed: number;
  totalRaw: number;
  totalMitigated: number;
  totalNet: number;
  isCrit: boolean;
  critMultiplier?: number;
  triggeredEffects?: Array<{ name: string; description: string }>;
}

export interface DotTickBreakdown {
  element: Element;
  damagePerSecond: number;
  stacks: number;
  rawTotal: number;
  resistPoints: number;
  elementalPenetration: number;
  effectiveResist: number;
  reductionPct: number;
  netDamage: number;
}

/**
 * Return the dominant damage type from a DamageBreakdown.
 * Compares physical net damage against each elemental net damage and returns
 * whichever dealt the most. Falls back to 'physical' when everything is zero.
 */
export function getDominantDamageType(bd: DamageBreakdown): 'physical' | Element {
  let best: 'physical' | Element = 'physical';
  let bestNet = bd.physical.net;

  for (const [elem, elemBd] of Object.entries(bd.elemental) as [Element, ElementalBreakdown | undefined][]) {
    if (elemBd && elemBd.net > bestNet) {
      best = elem;
      bestNet = elemBd.net;
    }
  }
  return best;
}

export type HealSource = 'lifesteal' | 'regen' | 'hot' | 'burst';

export interface HealBreakdown {
  source: HealSource;
  rawHeal: number;
  effectiveHeal: number;
  overheal: number;
}
