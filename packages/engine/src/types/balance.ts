import type { AffixTier } from './affix.js';
import type { BaseStat } from './base-stats.js';
import type { GemRarity } from './gem.js';

export interface FluxCosts {
  assignOrb: number;
  combineOrbs: number;
  upgradeTier: number;
  swapOrb: number;
  removeOrb: number;
}

export interface PoolScalingEntry {
  roundRange: [number, number];
  tiers: [number, number];
  rarities: GemRarity[];
  poolSize: number;
}

export interface GemBalanceConfig {
  tierValues: number[];
  rarityMultipliers: Record<GemRarity, number>;
  matchingRarityBonus: number;
  depthBonusPerLevel: number;
  maxRecipeDepth: number;
  recipeQualityThresholds: Record<GemRarity, number>;
  poolScaling: PoolScalingEntry[];
  goalRound: number;
  endlessStartRound: number;
  lives: { default: number; min: number; max: number };
  lifeRecovery: { winStreak: number; milestoneRounds: number[]; discoveryThreshold: number };
  flux: { rewards: Record<string, number>; costs: Record<string, number> };
}

export interface BalanceConfig {
  baseHP: number;
  maxDuelSeconds: number;
  baseCritMultiplier: number;
  minAttackSpeed: number; // In seconds (minimum time between attacks)

  fluxPerRound: [number, number, number]; // [8, 4, 2]
  quickMatchFlux: number; // Effectively unlimited for quick matches
  fluxCosts: FluxCosts;

  draftPoolPerRound: [number, number, number];     // [16, 8, 8]
  draftPicksPerPlayer: [number, number, number];   // [8, 4, 4]
  draftPoolSizeQuick: { min: number; max: number };
  tierDistribution: Record<AffixTier, number>; // Must sum to ~1.0
  draftTimerSeconds: number;
  forgeTimerSeconds: { round1: number; subsequent: number };
  archetypeMinOrbs: number;

  baseStatScaling: Record<
    BaseStat,
    {
      weapon: Record<string, number>;
      armor: Record<string, number>;
    }
  >;

  statCaps: Record<string, { min: number; max: number }>;

  gem: GemBalanceConfig;

  // TODO(Task 1.3): Add transplant config with unlockThreshold
  transplant?: {
    unlockThreshold: number;
  };
}
