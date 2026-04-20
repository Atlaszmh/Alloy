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
    store.startDebugMatch({ seed: 42, mode: 'run_async', aiTier: 3, targetPhase: 'forge', targetRound: 1, runConfig: { startingLives: 3, goalRound: 10 } });
    expect(selectAiOpponentTier(useMatchStore.getState())).toBe(3);
  });

  it('reset clears aiOpponentTier back to null', () => {
    useMatchStore.setState({ aiOpponentTier: 2 });
    useMatchStore.getState().reset();
    expect(selectAiOpponentTier(useMatchStore.getState())).toBeNull();
  });
});

describe('matchStore — startDebugMatch runStateOverride', () => {
  it('applies runStateOverride to matchState.runState', () => {
    useMatchStore.getState().startDebugMatch({
      seed: 42,
      mode: 'run_async',
      aiTier: 1,
      targetPhase: 'draft',
      runStateOverride: { lives: 1, totalWins: 2, totalLosses: 0, consecutiveWins: 2 },
    });
    const s = useMatchStore.getState().state;
    expect(s?.runState?.lives).toBe(1);
    expect(s?.runState?.totalWins).toBe(2);
    expect(s?.runState?.consecutiveWins).toBe(2);
  });

  it('forceRunResult dispatches duel_continue and updates runState.lives after a win', () => {
    // Start at a duel phase, round 1 with 2 lives and 2 consecutive wins
    // (one more win triggers win-streak recovery at 3)
    useMatchStore.getState().startDebugMatch({
      seed: 42,
      mode: 'run_async',
      aiTier: 1,
      targetPhase: 'duel',
      runStateOverride: { lives: 2, consecutiveWins: 2, totalWins: 2 },
    });
    const livesBefore = useMatchStore.getState().state?.runState?.lives;
    expect(livesBefore).toBe(2);

    useMatchStore.getState().forceRunResult(0); // player 0 wins
    const livesAfter = useMatchStore.getState().state?.runState?.lives;
    // 3-win streak → recover 1 life (up to startingLives cap)
    expect(livesAfter).toBeGreaterThan(livesBefore!);
  });
});
