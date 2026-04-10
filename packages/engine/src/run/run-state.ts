/**
 * Run State + Lives System
 *
 * Pure functions for managing run lifecycle: lives, rounds, win/loss tracking,
 * and life recovery mechanics (win streaks, milestone rounds, discovery threshold).
 */

export interface LifeRecoveryConfig {
  /** Consecutive wins needed to recover a life */
  winStreak: number;
  /** Specific round numbers that grant a bonus life */
  milestoneRounds: number[];
  /** Minimum discovery count to earn a bonus life (checked per round) */
  discoveryThreshold: number;
}

export interface RunState {
  lives: number;
  startingLives: number;
  round: number;
  status: 'active' | 'won' | 'lost';
  consecutiveWins: number;
  totalWins: number;
  totalLosses: number;
  goalRound: number;
  lifeRecovery: LifeRecoveryConfig;
}

export interface CreateRunOpts {
  startingLives?: number;
  goalRound?: number;
  lifeRecovery?: Partial<LifeRecoveryConfig>;
}

const DEFAULT_LIFE_RECOVERY: LifeRecoveryConfig = {
  winStreak: 3,
  milestoneRounds: [5, 10],
  discoveryThreshold: 5,
};

export function createRunState(opts: CreateRunOpts = {}): RunState {
  const startingLives = opts.startingLives ?? 3;
  return {
    lives: startingLives,
    startingLives,
    round: 1,
    status: 'active',
    consecutiveWins: 0,
    totalWins: 0,
    totalLosses: 0,
    goalRound: opts.goalRound ?? 10,
    lifeRecovery: {
      ...DEFAULT_LIFE_RECOVERY,
      ...opts.lifeRecovery,
    },
  };
}

export function loseLife(state: RunState): RunState {
  const newLives = state.lives - 1;
  return {
    ...state,
    lives: newLives,
    consecutiveWins: 0,
    totalLosses: state.totalLosses + 1,
    status: newLives <= 0 ? 'lost' : state.status,
  };
}

export function winRound(state: RunState): RunState {
  return {
    ...state,
    consecutiveWins: state.consecutiveWins + 1,
    totalWins: state.totalWins + 1,
  };
}

/**
 * Check and apply life recovery. Returns updated state with recovered life
 * if any recovery condition is met. Conditions checked:
 *   1. Win streak reached → recover 1 life, reset streak
 *   2. Current round is a milestone round → recover 1 life
 *   3. discoveryCount >= discoveryThreshold → recover 1 life
 *
 * Lives are capped at startingLives.
 */
export function checkLifeRecovery(
  state: RunState,
  discoveryCount: number = 0,
): RunState {
  let newState = { ...state };
  const { lifeRecovery, startingLives } = state;

  // Win streak recovery
  if (
    lifeRecovery.winStreak > 0 &&
    newState.consecutiveWins >= lifeRecovery.winStreak
  ) {
    newState = {
      ...newState,
      lives: Math.min(newState.lives + 1, startingLives),
      consecutiveWins: 0,
    };
  }

  // Milestone round recovery
  if (lifeRecovery.milestoneRounds.includes(newState.round)) {
    newState = {
      ...newState,
      lives: Math.min(newState.lives + 1, startingLives),
    };
  }

  // Discovery threshold recovery
  if (
    lifeRecovery.discoveryThreshold > 0 &&
    discoveryCount >= lifeRecovery.discoveryThreshold
  ) {
    newState = {
      ...newState,
      lives: Math.min(newState.lives + 1, startingLives),
    };
  }

  return newState;
}

export function isRunOver(state: RunState): boolean {
  return state.lives <= 0;
}

export function isGoalReached(state: RunState): boolean {
  return state.round >= state.goalRound;
}

export function advanceRound(state: RunState): RunState {
  const newRound = state.round + 1;
  return {
    ...state,
    round: newRound,
    status: newRound >= state.goalRound ? 'won' : state.status,
  };
}
