import { create } from 'zustand';

interface RunStoreState {
  lives: number;
  round: number;
  goal: number | null; // null = endless mode
  status: 'active' | 'won' | 'lost';
  consecutiveWins: number;

  startRun: (startingLives: number, goalRound: number | null) => void;
  loseLife: () => void;
  winRound: () => void;
  advanceRound: () => void;
  resetRun: () => void;
}

export const useRunStore = create<RunStoreState>((set, get) => ({
  lives: 3,
  round: 1,
  goal: null,
  status: 'active',
  consecutiveWins: 0,

  startRun: (startingLives, goalRound) =>
    set({
      lives: startingLives,
      round: 1,
      goal: goalRound,
      status: 'active',
      consecutiveWins: 0,
    }),

  loseLife: () => {
    const { lives } = get();
    const newLives = lives - 1;
    set({
      lives: newLives,
      consecutiveWins: 0,
      status: newLives <= 0 ? 'lost' : 'active',
    });
  },

  winRound: () => {
    const { consecutiveWins, round, goal } = get();
    const newConsecutiveWins = consecutiveWins + 1;
    const isGoalReached = goal !== null && round >= goal;
    set({
      consecutiveWins: newConsecutiveWins,
      status: isGoalReached ? 'won' : 'active',
    });
  },

  advanceRound: () => {
    set((s) => ({ round: s.round + 1 }));
  },

  resetRun: () =>
    set({
      lives: 3,
      round: 1,
      goal: null,
      status: 'active',
      consecutiveWins: 0,
    }),
}));

// Selectors
export const selectIsRunOver = (s: RunStoreState) => s.status === 'lost';
export const selectIsGoalReached = (s: RunStoreState) => s.status === 'won';
export const selectIsEndless = (s: RunStoreState) => s.goal === null;
