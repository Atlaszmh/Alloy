// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { useRunStore } from '@/stores/runStore';
import type { MatchState, GameAction, ActionResult } from '@alloy/engine';

/* ------------------------------------------------------------------ */
/*  Mock gateway                                                        */
/* ------------------------------------------------------------------ */

let mockGatewayState: MatchState | null = null;

vi.mock('@/gateway', () => ({
  useGateway: () => ({
    code: 'ai-run-test01',
    getState: () => mockGatewayState,
    dispatch: vi.fn(),
    subscribe: () => () => {},
    onEvent: () => () => {},
    destroy: () => {},
  }),
  GatewayProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Import PostMatch after mocks
import { PostMatch } from '../PostMatch';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function makeRunWonState(): MatchState {
  return {
    id: 'test-match',
    seed: 42,
    mode: 'run_async',
    playerIds: ['player', 'ai'],
    phase: { kind: 'complete', winner: 0, scores: [1, 0] },
    pool: [],
    players: [{ stockpile: [] }, { stockpile: [] }],
    roundResults: [],
    duelLogs: [],
    runState: {
      lives: 2,
      startingLives: 3,
      round: 10,
      status: 'won',
      consecutiveWins: 1,
      totalWins: 7,
      totalLosses: 3,
      goalRound: 10,
      flux: 4,
      rerollNextDraft: false,
      lifeRecovery: { winStreak: 3, milestoneRounds: [5, 10], discoveryThreshold: 5 },
    },
  } as unknown as MatchState;
}

function setupStores(matchState: MatchState | null) {
  mockGatewayState = matchState;

  if (matchState) {
    useMatchStore.setState({
      state: matchState,
      aiController: null,
      error: null,
      dispatch: vi.fn(() => ({ ok: true as const, state: matchState })) as unknown as (action: GameAction) => ActionResult,
      getRegistry: () => ({} as never),
    });

    // Sync runStore from runState (mirrors what matchStore.syncRunStore does)
    if (matchState.runState) {
      useRunStore.setState({
        lives: matchState.runState.lives,
        round: matchState.runState.round,
        goal: matchState.runState.goalRound,
        status: matchState.runState.status,
        consecutiveWins: matchState.runState.consecutiveWins,
      });
    }
  } else {
    useMatchStore.setState({
      state: null,
      aiController: null,
      error: null,
    } as Parameters<typeof useMatchStore.setState>[0]);
    useRunStore.setState({ status: 'active', round: 1, goal: null, lives: 3, consecutiveWins: 0 });
  }
}

function renderPostMatch() {
  return render(
    <MemoryRouter initialEntries={['/match/ai-run-test01/post']}>
      <Routes>
        <Route path="/match/:code/post" element={<PostMatch />} />
      </Routes>
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe('PostMatch — goal-reached overlay', () => {
  beforeEach(() => {
    mockGatewayState = null;
    useRunStore.setState({ status: 'active', round: 1, goal: null, lives: 3, consecutiveWins: 0 });
  });

  it('shows goal-reached overlay when run ended with status=won', () => {
    const wonState = makeRunWonState();
    setupStores(wonState);
    renderPostMatch();
    expect(screen.getByTestId('goal-reached-overlay')).toBeTruthy();
  });

  it('does NOT show goal-reached overlay when run ended with status=lost', () => {
    const lostState: MatchState = {
      ...makeRunWonState(),
      runState: {
        ...makeRunWonState().runState!,
        status: 'lost',
      },
    } as unknown as MatchState;
    setupStores(lostState);
    // Also set runStore to lost
    useRunStore.setState({ status: 'lost', round: 10, goal: 10, lives: 0, consecutiveWins: 0 });
    renderPostMatch();
    expect(screen.queryByTestId('goal-reached-overlay')).toBeNull();
  });

  it('does NOT show goal-reached overlay in non-run modes (mode: ranked, no runState)', () => {
    const rankedState: MatchState = {
      id: 'test-match',
      seed: 42,
      mode: 'ranked',
      playerIds: ['player', 'ai'],
      phase: { kind: 'complete', winner: 0, scores: [1, 0] },
      pool: [],
      players: [{ stockpile: [] }, { stockpile: [] }],
      roundResults: [],
      duelLogs: [],
    } as unknown as MatchState;
    setupStores(rankedState);
    renderPostMatch();
    expect(screen.queryByTestId('goal-reached-overlay')).toBeNull();
  });
});
