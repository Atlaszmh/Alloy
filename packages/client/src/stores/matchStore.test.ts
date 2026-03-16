import { describe, it, expect } from 'vitest';
import { useMatchStore, selectPool, selectRoundResults, selectDuelLogs, selectPhase, selectPlayer } from './matchStore';

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
