import { describe, it, expect } from 'vitest';
import { useMatchStore, selectPool, selectRoundResults, selectDuelLogs, selectPhase, selectPlayer, selectAiOpponentTier } from './matchStore';

describe('matchStore selectors — referential stability', () => {
  // Bug regression: selectors returning `?? []` created a new array reference
  // each call, causing Zustand's useSyncExternalStore to infinite-loop.

  it('selectPool returns same reference when state is null', () => {
    useMatchStore.setState({ state: null, aiController: null, error: null });
    const a = selectPool(useMatchStore.getState());
    const b = selectPool(useMatchStore.getState());
    expect(a).toBe(b); // Same reference, not just deep equal
  });

  it('selectRoundResults returns same reference when state is null', () => {
    useMatchStore.setState({ state: null, aiController: null, error: null });
    const a = selectRoundResults(useMatchStore.getState());
    const b = selectRoundResults(useMatchStore.getState());
    expect(a).toBe(b);
  });

  it('selectDuelLogs returns same reference when state is null', () => {
    useMatchStore.setState({ state: null, aiController: null, error: null });
    const a = selectDuelLogs(useMatchStore.getState());
    const b = selectDuelLogs(useMatchStore.getState());
    expect(a).toBe(b);
  });

  it('selectPhase returns null when state is null', () => {
    useMatchStore.setState({ state: null, aiController: null, error: null });
    expect(selectPhase(useMatchStore.getState())).toBeNull();
  });

  it('selectPlayer returns null when state is null', () => {
    useMatchStore.setState({ state: null, aiController: null, error: null });
    expect(selectPlayer(0)(useMatchStore.getState())).toBeNull();
    expect(selectPlayer(1)(useMatchStore.getState())).toBeNull();
  });

  it('selectPool returns empty array (not undefined) when state is null', () => {
    useMatchStore.setState({ state: null, aiController: null, error: null });
    const pool = selectPool(useMatchStore.getState());
    expect(Array.isArray(pool)).toBe(true);
    expect(pool.length).toBe(0);
  });
});

describe('matchStore — aiOpponentTier slice', () => {
  it('defaults to null', () => {
    useMatchStore.setState({ state: null, aiController: null, error: null, aiOpponentTier: null });
    expect(selectAiOpponentTier(useMatchStore.getState())).toBeNull();
  });

  it('startDebugMatch with run_async mode sets aiOpponentTier to the given tier', () => {
    const store = useMatchStore.getState();
    // Use tier 3 as a distinguishable value
    store.startDebugMatch(42, 'run_async', 3, 'forge', 'sword', 'chainmail', 1, { startingLives: 3, goalRound: 10 });
    expect(selectAiOpponentTier(useMatchStore.getState())).toBe(3);
  });

  it('reset clears aiOpponentTier back to null', () => {
    useMatchStore.setState({ aiOpponentTier: 2 });
    useMatchStore.getState().reset();
    expect(selectAiOpponentTier(useMatchStore.getState())).toBeNull();
  });
});
