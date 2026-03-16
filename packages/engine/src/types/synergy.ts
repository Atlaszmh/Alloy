import type { StatModifier } from './affix.js';

export interface SynergyDef {
  id: string;
  name: string;
  requiredAffixes: string[]; // AffixIds or tags required across weapon + armor
  bonusEffects: StatModifier[];
  description: string;
}

export interface ActiveSynergy {
  synergyId: string;
  isActive: boolean;
  missingCount: number; // 0 = active, 1 = one away, etc.
}
