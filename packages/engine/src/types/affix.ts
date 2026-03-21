export type AffixTier = 1 | 2 | 3 | 4;
export type AffixCategory = 'offensive' | 'defensive' | 'sustain' | 'utility' | 'trigger';
export type AffixTag = string; // e.g., 'physical', 'fire', 'elemental', 'defensive', 'crit'

export interface StatModifier {
  stat: string; // Key into DerivedStats or special trigger key
  op: 'flat' | 'percent' | 'override';
  value: number;
}

export interface AffixTierData {
  weaponEffect: StatModifier[];
  armorEffect: StatModifier[];
  valueRange: [number, number]; // For display: e.g., [10, 20] for "10-20 fire damage"
}

export interface AffixDef {
  id: string; // e.g., 'fire_damage'
  name: string; // e.g., 'Fire Damage'
  description: string; // Brief player-facing description of the affix
  category: AffixCategory;
  tags: AffixTag[];
  tiers: Record<AffixTier, AffixTierData>;
}
