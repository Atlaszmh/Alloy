import type { AffixTag, StatModifier } from './affix.js';

export interface CompoundAffixDef {
  id: string; // e.g., 'ignite'
  name: string; // e.g., 'Ignite'
  components: [string, string]; // Two affixIds (order-independent)
  fluxCost: number; // Default: 2
  slotCost: number; // Default: 2 (occupies 2 affix slots)
  weaponEffect: StatModifier[];
  armorEffect: StatModifier[];
  tags: AffixTag[];
}
