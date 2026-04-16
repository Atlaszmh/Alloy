/**
 * Pool Scaling for Run Progression
 *
 * Determines pool configuration (size, tier range, available rarities)
 * based on the current round in a run. Uses a configurable scaling table.
 */

import type { GemRarity } from '../types/gem.js';

export interface PoolScalingEntry {
  roundRange: [number, number];
  tiers: [number, number];
  rarities: GemRarity[];
  poolSize: number;
}

/**
 * Default scaling table for standard runs.
 * As rounds progress, pool shrinks, higher tiers unlock, and rarer gems appear.
 */
export const DEFAULT_SCALING: PoolScalingEntry[] = [
  {
    roundRange: [1, 3],
    tiers: [1, 2],
    rarities: ['common', 'uncommon'],
    poolSize: 20,
  },
  {
    roundRange: [4, 6],
    tiers: [1, 3],
    rarities: ['common', 'uncommon', 'magic', 'rare'],
    poolSize: 16,
  },
  {
    roundRange: [7, 9],
    tiers: [2, 4],
    rarities: ['uncommon', 'magic', 'rare', 'epic'],
    poolSize: 14,
  },
  {
    roundRange: [10, 14],
    tiers: [2, 5],
    rarities: ['magic', 'rare', 'epic', 'legendary'],
    poolSize: 12,
  },
  {
    roundRange: [15, Infinity],
    tiers: [3, 5],
    rarities: ['rare', 'epic', 'legendary'],
    poolSize: 10,
  },
];

/**
 * Look up the pool configuration for a given round.
 * Falls back to the last entry if no range matches.
 */
export function getPoolConfigForRound(
  round: number,
  scaling: PoolScalingEntry[] = DEFAULT_SCALING,
): PoolScalingEntry {
  for (const entry of scaling) {
    if (round >= entry.roundRange[0] && round <= entry.roundRange[1]) {
      return entry;
    }
  }
  return scaling[scaling.length - 1];
}
