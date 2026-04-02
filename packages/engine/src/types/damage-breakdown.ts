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
  damagePerTick: number;
  stacks: number;
  rawTotal: number;
  resistPoints: number;
  elementalPenetration: number;
  effectiveResist: number;
  reductionPct: number;
  netDamage: number;
}

export type HealSource = 'lifesteal' | 'regen' | 'hot' | 'burst';

export interface HealBreakdown {
  source: HealSource;
  rawHeal: number;
  effectiveHeal: number;
  overheal: number;
}
