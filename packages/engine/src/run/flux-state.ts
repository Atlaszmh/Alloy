/**
 * Flux Economy
 *
 * Pure functions for managing the flux resource: earning (win, discovery, milestone)
 * and spending (boost combine, reroll pool, guarantee rarity).
 */

/**
 * Add earned flux to current balance.
 * @param currentFlux The current flux balance
 * @param earnedAmount The amount to earn
 * @returns New flux balance
 */
export function earnFlux(currentFlux: number, earnedAmount: number): number {
  return currentFlux + earnedAmount;
}

/**
 * Spend flux from current balance, preventing negative balance.
 * @param currentFlux The current flux balance
 * @param cost The cost to spend
 * @returns New flux balance (unchanged if insufficient funds)
 */
export function spendFlux(currentFlux: number, cost: number): number {
  if (currentFlux >= cost) {
    return currentFlux - cost;
  }
  return currentFlux;
}

/**
 * Check if sufficient flux is available to spend.
 * @param currentFlux The current flux balance
 * @param cost The cost to check
 * @returns True if balance >= cost
 */
export function canSpendFlux(currentFlux: number, cost: number): boolean {
  return currentFlux >= cost;
}
