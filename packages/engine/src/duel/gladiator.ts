import type { DerivedStats } from '../types/derived-stats.js';
import type { GladiatorRuntime } from '../types/combat.js';

const STEP_DURATION = 0.1;

/**
 * Create a GladiatorRuntime from DerivedStats for use in duel simulation.
 * Initiative reduces the initial attack timer so faster gladiators strike first.
 */
export function createGladiator(playerId: 0 | 1, stats: DerivedStats): GladiatorRuntime {
  const attackTimer = Math.max(STEP_DURATION, stats.attackSpeed * (1 - stats.initiative / 100));

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
    reflectRemaining: 0,
    regenAccumulator: 0,
    regenInterval: 1.0,
    slowDebuffMultiplier: 1.0,
    slowDebuffRemaining: 0,
    temporaryBarriers: [],
    maxHpDebuffMultiplier: 1.0,
    maxHpDebuffRemaining: 0,
    elementAmplifiers: {},
  };
}

/**
 * Effective max HP including any active reduce_max_hp debuff.
 * Use this everywhere maxHP feeds a mechanic (regen/heal cap, low-HP threshold,
 * %-of-maxHP heals/barriers, tiebreak HP%). Display events should also use
 * this so the UI reflects the shrunken HP pool.
 */
export function effectiveMaxHP(g: GladiatorRuntime): number {
  return g.maxHP * g.maxHpDebuffMultiplier;
}
