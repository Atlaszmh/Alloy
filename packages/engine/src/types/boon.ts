import type { KnobsData } from './ability.js';

// The boons (see the boons spec): dive-scoped rewards taken at the stops between depths, and the
// sanctums' shrine blessings, which are boon rows too (`boons.json`).

export const BOON_FAMILIES = [
  'offense',
  'element',
  'defense',
  'tempo',
  'fortune',
  'pact',
  'floor',
] as const;
export type BoonFamily = (typeof BOON_FAMILIES)[number];
export type BoonId = string;
export type BoonTierIndex = 1 | 2 | 3;
export const BOON_TIER_NAMES = ['common', 'rare', 'epic'] as const;

/**
 * What a boon or shrine does. Every field optional. Units: a bonus is the added fraction
 * (`damage: 0.25` is +25%); a drop multiplier (`flux`, `runes`, `gear`) is the raw factor (1.3).
 * Stacking (spec §2): counts and additive bonuses sum; `damage`, `manaRegen`, `maxLife`, `tempo`,
 * `flux`, `runes`, `gear` multiply per entry; `hazardsFriendly` takes the largest; `knobs` merge
 * per entry through `mergeKnobs`.
 */
export interface BoonEffect {
  // stats (applyBuffs)
  damage?: number;
  manaRegen?: number;
  lifeRegen?: number;
  maxLife?: number;
  tempo?: number;
  lifesteal?: number;
  bloodPrice?: number;
  // stats before stats exist (diveStats)
  attune?: { role: 'primary' | 'secondary'; points: number };
  knobs?: KnobsData;
  // the damage path
  byKind?: Partial<Record<'light' | 'medium' | 'heavy' | 'hold', number>>;
  firstMove?: number;
  stepBonus?: number;
  lowLife?: { below: number; mult: number };
  nearFoes?: { per: number; cap: number; radius: number };
  // defence and tempo
  dodgeCharges?: number;
  dodgeWindow?: number;
  dodgeRecharge?: number;
  perfectAlways?: true;
  freeCast?: { seconds: number; damage: number };
  defendDuration?: number;
  barrierOnFloor?: number;
  healOnClear?: number;
  lastStand?: { below: number; reduce: number; seconds: number };
  // loot and the dive
  find?: number;
  magnet?: number;
  metalUp?: number;
  flux?: number;
  runes?: number;
  gear?: number;
  scrap?: number;
  deathLoss?: number;
  potions?: true;
  noPotions?: true;
  eliteChance?: number;
  skip?: number;
  // the floor
  exitRevealed?: true;
  shrinesLastDive?: true;
  noSlow?: true;
  hazardsFriendly?: number;
}

export interface BoonTier {
  text: string;
  effect: BoonEffect;
}

export interface BoonDef {
  id: BoonId;
  name: string;
  family: BoonFamily;
  duration: 'dive' | 'floor';
  cap: 1 | 2 | 3;
  minDepth?: number;
  /** A sanctum's draw weight; absent: never a shrine. */
  shrine?: number;
  /** A stop's draw weight by tier; all 0: never at a stop. */
  weight: { common: number; rare: number; epic: number };
  tiers: [BoonTier, BoonTier, BoonTier];
}

/** A boon on the hero (`HeroEntity.floorBuffs`, `diveBuffs`, `DiveState.diveBuffs`). */
export interface Buff {
  boon: BoonId;
  tier: BoonTierIndex;
  effect: BoonEffect;
}

export interface BoonOffer {
  id: BoonId;
  tier: BoonTierIndex;
}

/** `buffSum`'s combined view (spec §2), kept on `HeroEntity.boon`. Absent fields: neutral. */
export type BoonSum = Omit<BoonEffect, 'knobs' | 'attune'> & {
  knobs: KnobsData[];
  attune: { primary: number; secondary: number };
};

/** `balance.json → delve.boons`: a stop's cards and its tier odds by depth band (see the boons spec §4). */
export interface BoonsBalance {
  /** Cards a stop offers. */
  offers: number;
  /** From `fromDepth` on (ascending from 1), the weights of common, rare and epic. */
  tierWeights: { fromDepth: number; weights: [number, number, number] }[];
}
