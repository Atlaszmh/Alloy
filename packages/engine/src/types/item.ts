import type { AffixTier, StatModifier } from './affix.js';
import type { BaseStatAllocation } from './base-stats.js';
import type { OrbInstance } from './orb.js';

export type EquippedSlot =
  | { kind: 'single'; orb: OrbInstance; socketedRound: 1 | 2 | 3 }
  | { kind: 'compound'; orbs: [OrbInstance, OrbInstance]; compoundId: string; socketedRound: 1 | 2 | 3 }
  | { kind: 'upgraded'; orb: OrbInstance; originalTier: AffixTier; upgradedTier: AffixTier; socketedRound: 1 | 2 | 3 };

export interface ForgedItem {
  baseItemId: string;
  baseStats: BaseStatAllocation | null; // null = not yet set (pre-Round 1)
  slots: (EquippedSlot | null)[]; // length 6, null = empty
}

export interface Loadout {
  weapon: ForgedItem;
  armor: ForgedItem;
}

export interface BaseItemDef {
  id: string;
  type: 'weapon' | 'armor';
  name: string;
  inherentBonuses: StatModifier[];
  unlockLevel: number;
}

export function createEmptyForgedItem(baseItemId: string): ForgedItem {
  return {
    baseItemId,
    baseStats: null,
    slots: [null, null, null, null, null, null],
  };
}

export function createEmptyLoadout(weaponBaseId: string, armorBaseId: string): Loadout {
  return {
    weapon: createEmptyForgedItem(weaponBaseId),
    armor: createEmptyForgedItem(armorBaseId),
  };
}
