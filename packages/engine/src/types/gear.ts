import type { Chains, ChainSkill } from './ability.js';
import type { ManaType } from './mana.js';

export type Rarity = 'common' | 'uncommon' | 'magic' | 'rare' | 'epic' | 'legendary';

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'magic', 'rare', 'epic', 'legendary'];

export function rarityIndex(rarity: Rarity): number {
  return RARITY_ORDER.indexOf(rarity);
}

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
 * percentage stats are stored in percentage points (12 = 12%). Attunement
 * stats (`*Attune`) are whole points and never scale with upgrades.
 */
export type HeroStatKey =
  | 'damage'
  | 'damagePct'
  | 'attackSpeedPct'
  | 'critChance'
  | 'critDamage'
  | 'maxHp'
  | 'hpPct'
  | 'armor'
  | 'dodge'
  | 'lifesteal'
  | 'healOnKill'
  | 'thorns'
  | 'magicFind'
  | 'scrapFind'
  | 'moveSpeed'
  | 'cooldownReduction'
  | 'manaRegen'
  | 'firePower'
  | 'frostPower'
  | 'stormPower'
  | 'earthPower'
  | 'shadowPower'
  | 'naturePower'
  | 'fireAttune'
  | 'frostAttune'
  | 'stormAttune'
  | 'earthAttune'
  | 'shadowAttune'
  | 'natureAttune';

export const HERO_STAT_KEYS: readonly HeroStatKey[] = [
  'damage',
  'damagePct',
  'attackSpeedPct',
  'critChance',
  'critDamage',
  'maxHp',
  'hpPct',
  'armor',
  'dodge',
  'lifesteal',
  'healOnKill',
  'thorns',
  'magicFind',
  'scrapFind',
  'moveSpeed',
  'cooldownReduction',
  'manaRegen',
  'firePower',
  'frostPower',
  'stormPower',
  'earthPower',
  'shadowPower',
  'naturePower',
  'fireAttune',
  'frostAttune',
  'stormAttune',
  'earthAttune',
  'shadowAttune',
  'natureAttune',
] as const;

/** A rolled stat line. `roll` is the 0–1 quality of the roll within its range. */
export interface StatRoll {
  stat: HeroStatKey;
  value: number;
  roll: number;
  /**
   * An affix line's roll band, 0–1 in its range: a shard's tier band (see the
   * crafting spec). Absent: the rarity's default, `[minRoll, 1]`.
   */
  band?: [number, number];
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
  /** Mana affinity: wearing the item attunes the hero to this mana type. */
  mana: ManaType;
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
  /** Number of hones performed — drives escalating hone cost (see the crafting spec). */
  hones: number;
  locked: boolean;
  /** Weapons: the chains the weapon carries and their slots (see the weapon movesets spec). */
  moveset?: Moveset;
  /** A rare weapon awakened to carry the Ultimate too (see the tutorial spec's Awaken). */
  awakened?: boolean;
}

/**
 * A weapon's moveset: a chain for each skill its rarity carries, each holding
 * 1 to `slots[skill]` moves; a skill it doesn't carry has neither.
 */
export interface Moveset {
  chains: Partial<Chains>;
  slots: Partial<Record<ChainSkill, number>>;
}

export type EquippedGear = Partial<Record<GearSlot, GearItem>>;
