import type { GemInstance } from '../types/gem.js';
import type { SlotArray } from '../types/match.js';
import {
  clearSlot,
  findSlotIndex,
  liveCount,
  liveSlots,
  placeInFirstEmpty,
} from '../types/slot-array.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import {
  validateActivePlayer,
  validateOrbInPool,
  validateDraftNotComplete,
  activePlayerForPick,
} from './draft-actions.js';

// --- Types ---

export interface DraftState {
  /** Fixed-slot pool — picks null out the slot rather than compacting. */
  pool: SlotArray<GemInstance>;
  /** Per-player fixed-slot stockpiles — grow as picks come in. */
  stockpiles: [SlotArray<GemInstance>, SlotArray<GemInstance>];
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
 * All orbs in the pool will be drafted (maxPicks = live gem count).
 */
export function createDraftState(pool: SlotArray<GemInstance>): DraftState {
  return {
    pool: [...pool],
    stockpiles: [[], []],
    pickIndex: 0,
    activePlayer: 0,
    maxPicks: liveCount(pool),
    isComplete: false,
  };
}

/**
 * Attempt a pick: validate, null out the pool slot (position preserved),
 * append to player stockpile, advance turn.
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

  const orbIndex = findSlotIndex(state.pool, (o) => o.uid === orbUid);
  const orb = state.pool[orbIndex]!;

  // Slot position is preserved — remaining gems in the pool don't shift
  // when this one is picked.
  const newPool = clearSlot(state.pool, orbIndex);

  const newStockpiles: [SlotArray<GemInstance>, SlotArray<GemInstance>] = [
    [...state.stockpiles[0]],
    [...state.stockpiles[1]],
  ];
  newStockpiles[player] = placeInFirstEmpty(newStockpiles[player], orb);

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

  // Randomise across live entries only — a null slot isn't pickable.
  const liveOrbs = liveSlots(state.pool);
  if (liveOrbs.length === 0) {
    return { ok: false, error: 'No orbs remaining in pool' };
  }

  const index = rng.nextInt(0, liveOrbs.length - 1);
  const orb = liveOrbs[index];

  return makePick(state, orb.uid, state.activePlayer);
}
