import type { GemRarity } from './gem.js';

// Delve gear reuses the gem rarity ladder so the whole game speaks one
// rarity language (common → legendary).
export type Rarity = GemRarity;

export type GearSlot = 'weapon' | 'helm' | 'chest' | 'gloves' | 'boots' | 'amulet' | 'ring';

export const GEAR_SLOTS: readonly GearSlot[] = [
  'weapon',
  'helm',
  'chest',
  'gloves',
  'boots',
  'amulet',
  'ring',
] as const;

/**
 * Every stat a piece of gear can grant. Flat stats scale with item level;
 * percentage stats are stored in percentage points (12 = 12%).
 */
export type HeroStatKey =
  | 'damage'
  | 'fireDamage'
  | 'coldDamage'
  | 'lightningDamage'
  | 'damagePct'
  | 'attackSpeedPct'
  | 'critChance'
  | 'critDamage'
  | 'maxHp'
  | 'hpPct'
  | 'armor'
  | 'dodge'
  | 'lifesteal'
  | 'lifeOnHit'
  | 'healOnKill'
  | 'thorns'
  | 'magicFind'
  | 'scrapFind';

/** A rolled stat line. `roll` is the 0–1 quality of the roll within its range. */
export interface StatRoll {
  stat: HeroStatKey;
  value: number;
  roll: number;
}

export interface LegendaryRoll {
  id: string;
  value: number;
  roll: number;
}

export interface GearItem {
  uid: string;
  slot: GearSlot;
  baseId: string;
  rarity: Rarity;
  ilvl: number;
  /** Display title: legendary power name, generated rare name, or material + base. */
  name: string;
  implicits: StatRoll[];
  affixes: StatRoll[];
  legendary?: LegendaryRoll;
  /** Forge upgrade level (0..maxUpgrade). Scales every stat on the item. */
  upgrade: number;
  /** Number of reforges performed — drives escalating reforge cost. */
  reforges: number;
  locked: boolean;
}

export type EquippedGear = Partial<Record<GearSlot, GearItem>>;
