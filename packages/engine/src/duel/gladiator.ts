import type { DerivedStats } from '../types/derived-stats.js';
import type { GladiatorRuntime } from '../types/combat.js';

/**
 * Create a GladiatorRuntime from DerivedStats for use in duel simulation.
 * Initiative reduces the initial attack timer so faster gladiators strike first.
 */
export function createGladiator(playerId: 0 | 1, stats: DerivedStats): GladiatorRuntime {
  const attackTimer = Math.max(1, Math.round(stats.attackInterval * (1 - stats.initiative)));

  return {
    playerId,
    currentHP: stats.maxHP,
    maxHP: stats.maxHP,
    barrier: stats.barrierAmount,
    stats,
    activeDOTs: [],
    activeBuffs: [],
    cooldowns: new Map(),
    attackTimer,
    stunTimer: 0,
    isLowHP: false,
    reflectMultiplier: 0,
    reflectTicksRemaining: 0,
  };
}
