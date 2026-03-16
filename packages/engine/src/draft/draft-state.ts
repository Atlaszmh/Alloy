import type { OrbInstance } from '../types/orb.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import {
  validateActivePlayer,
  validateOrbInPool,
  validateDraftNotComplete,
  activePlayerForPick,
} from './draft-actions.js';

// --- Types ---

export interface DraftState {
  pool: OrbInstance[];
  stockpiles: [OrbInstance[], OrbInstance[]];
  pickIndex: number;
  activePlayer: 0 | 1;
  maxPicks: number;
  isComplete: boolean;
}

export type DraftResult =
  | { ok: true; state: DraftState }
  | { ok: false; error: string };

// --- Functions ---

/**
 * Create an initial draft state from a pool of orbs.
 * All orbs in the pool will be drafted (maxPicks = pool.length).
 */
export function createDraftState(pool: OrbInstance[]): DraftState {
  return {
    pool: [...pool],
    stockpiles: [[], []],
    pickIndex: 0,
    activePlayer: 0,
    maxPicks: pool.length,
    isComplete: false,
  };
}

/**
 * Attempt a pick: validate, remove orb from pool, add to player stockpile,
 * advance turn. Returns a new state on success or an error message on failure.
 */
export function makePick(
  state: DraftState,
  orbUid: string,
  player: 0 | 1,
): DraftResult {
  const completeErr = validateDraftNotComplete(state);
  if (completeErr !== null) {
    return { ok: false, error: completeErr };
  }

  const turnErr = validateActivePlayer(state, player);
  if (turnErr !== null) {
    return { ok: false, error: turnErr };
  }

  const poolErr = validateOrbInPool(state, orbUid);
  if (poolErr !== null) {
    return { ok: false, error: poolErr };
  }

  const orbIndex = state.pool.findIndex((o) => o.uid === orbUid);
  const orb = state.pool[orbIndex]!;

  const newPool = [...state.pool.slice(0, orbIndex), ...state.pool.slice(orbIndex + 1)];

  const newStockpiles: [OrbInstance[], OrbInstance[]] = [
    [...state.stockpiles[0]],
    [...state.stockpiles[1]],
  ];
  newStockpiles[player] = [...newStockpiles[player], orb];

  const newPickIndex = state.pickIndex + 1;
  const isComplete = newPickIndex >= state.maxPicks;

  return {
    ok: true,
    state: {
      pool: newPool,
      stockpiles: newStockpiles,
      pickIndex: newPickIndex,
      activePlayer: isComplete ? state.activePlayer : activePlayerForPick(newPickIndex),
      maxPicks: state.maxPicks,
      isComplete,
    },
  };
}

/**
 * Auto-pick a random orb from the remaining pool using the given RNG.
 * Used when a player's timer expires.
 */
export function autoPickRandom(
  state: DraftState,
  rng: SeededRNG,
): DraftResult {
  if (state.isComplete) {
    return { ok: false, error: 'Draft is already complete' };
  }

  if (state.pool.length === 0) {
    return { ok: false, error: 'No orbs remaining in pool' };
  }

  const index = rng.nextInt(0, state.pool.length - 1);
  const orb = state.pool[index]!;

  return makePick(state, orb.uid, state.activePlayer);
}
