import type { DraftState } from './draft-state.js';

/**
 * Validates that the given player is the active player for the current pick.
 */
export function validateActivePlayer(
  state: DraftState,
  player: 0 | 1,
): string | null {
  if (player !== state.activePlayer) {
    return `Not player ${player}'s turn (active player is ${state.activePlayer})`;
  }
  return null;
}

/**
 * Validates that an orb with the given UID exists in the draft pool.
 */
export function validateOrbInPool(
  state: DraftState,
  orbUid: string,
): string | null {
  const found = state.pool.some((o) => o.uid === orbUid);
  if (!found) {
    return `Orb "${orbUid}" is not in the draft pool`;
  }
  return null;
}

/**
 * Validates that the draft is not already complete.
 */
export function validateDraftNotComplete(state: DraftState): string | null {
  if (state.isComplete) {
    return 'Draft is already complete';
  }
  return null;
}

/**
 * Returns the active player for a given pick index.
 * Alternates: 0, 1, 0, 1, ...
 */
export function activePlayerForPick(pickIndex: number): 0 | 1 {
  return (pickIndex % 2) as 0 | 1;
}
