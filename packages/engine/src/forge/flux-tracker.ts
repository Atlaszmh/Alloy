import type { BalanceConfig } from '../types/balance.js';
import type { ForgeAction } from '../types/forge-action.js';

/**
 * Returns the flux budget for a given round.
 * DEPRECATED: Flux tracking is no longer used in the gem system.
 * Kept for backward compatibility during migration.
 */
export function getFluxForRound(
  _round: 1 | 2 | 3,
  _balance: BalanceConfig,
  _isQuickMatch: boolean,
): number {
  return 0;
}

/**
 * Returns the flux cost for a given forge action.
 * DEPRECATED: All gem forge actions are free (no flux cost).
 */
export function getActionCost(
  _action: ForgeAction,
  _balance: BalanceConfig,
): number {
  return 0;
}
