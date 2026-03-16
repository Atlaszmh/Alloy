import type { AffixTier } from './affix.js';
import type { BaseStat } from './base-stats.js';

export interface FluxCosts {
  assignOrb: number;
  combineOrbs: number;
  upgradeTier: number;
  swapOrb: number;
  removeOrb: number;
}

export interface BalanceConfig {
  baseHP: number;
  ticksPerSecond: number;
  maxDuelTicks: number;
  baseCritMultiplier: number;
  minAttackInterval: number; // In ticks

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
}
