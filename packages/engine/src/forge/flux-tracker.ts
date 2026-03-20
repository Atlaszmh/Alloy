import type { BalanceConfig } from '../types/balance.js';
import type { ForgeAction } from '../types/forge-action.js';

/**
 * Returns the flux budget for a given round.
 * Quick match: all flux in one round (quickMatchFlux from balance config).
 * Normal: fluxPerRound[round - 1].
 */
export function getFluxForRound(
  round: 1 | 2 | 3,
  balance: BalanceConfig,
  isQuickMatch: boolean,
): number {
  if (isQuickMatch) return balance.quickMatchFlux;
  return balance.fluxPerRound[round - 1];
}

/**
 * Returns the flux cost for a given forge action.
 * set_base_stats is always free (0 flux).
 */
export function getActionCost(
  action: ForgeAction,
  balance: BalanceConfig,
): number {
  switch (action.kind) {
    case 'assign_orb':
      return balance.fluxCosts.assignOrb;
    case 'combine':
      return balance.fluxCosts.combineOrbs;
    case 'upgrade_tier':
      return balance.fluxCosts.upgradeTier;
    case 'swap_orb':
      return balance.fluxCosts.assignOrb;
    case 'remove_orb':
      return 0;
    case 'set_base_stats':
      return 0;
  }
}
