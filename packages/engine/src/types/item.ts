import type { BaseStatAllocation } from './base-stats.js';
import type { GemInstance } from './gem.js';

export interface EquippedSlot {
  gem: GemInstance;
}

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
  baseStats: Record<string, number>;
  description: string;
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
