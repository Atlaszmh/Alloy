/**
 * Run State + Lives System
 *
 * Pure functions for managing run lifecycle: lives, rounds, win/loss tracking,
 * and life recovery mechanics (win streaks, milestone rounds, discovery threshold).
 */

import type { BalanceConfig } from '../types/balance.js';

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
  flux: number;
  rerollNextDraft: boolean;
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
    flux: 0,
    rerollNextDraft: false,
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

export interface RoundPreview {
  /** Updated run state after applying win/loss + life recovery (no round advance). */
  afterRunState: RunState;
  /** Flux earned this round, broken out by source plus total. */
  fluxEarned: { win: number; discovery: number; milestone: number; total: number };
  /** True iff a life was just recovered AND the win-streak threshold was met. */
  streakJustTriggered: boolean;
  /** True iff a life was just recovered AND the current round is a milestone. */
  milestoneJustHit: boolean;
}

/**
 * Preview the result of a round without mutating the input state. Mirrors the
 * engine's duel_continue flow (winRound/loseLife → checkLifeRecovery) so the
 * client can show flux, lives, and recovery reasons on the between-round
 * interstitial before the real action is dispatched.
 *
 * Returns a fresh RunState; the input `before` object is not modified.
 */
export function previewRoundResult(
  before: RunState,
  discoveryCount: number,
  roundWon: boolean,
  balance: BalanceConfig,
): RoundPreview {
  // Step 1: apply win or loss
  const mid = roundWon ? winRound(before) : loseLife(before);

  // Step 2: apply life recovery (only meaningful after a win, but the engine
  // runs it unconditionally — match that behavior here)
  const afterRunState = roundWon ? checkLifeRecovery(mid, discoveryCount) : mid;

  // Step 3: flux breakdown
  const rewards = balance.gem.flux.rewards;
  const winFlux = roundWon ? (rewards.win ?? 0) : 0;
  const milestoneRounds = before.lifeRecovery.milestoneRounds;
  const milestoneFlux = milestoneRounds.includes(before.round)
    ? (rewards.milestone ?? 0)
    : 0;
  // Per-round discovery flux is tracked separately in the engine; leave as 0.
  const discoveryFlux = 0;
  const total = winFlux + discoveryFlux + milestoneFlux;

  // Step 4: recovery-reason flags. Only true when a life was actually granted
  // (afterRunState.lives > mid.lives) AND the corresponding condition held.
  const lifeWasGranted = afterRunState.lives > mid.lives;
  const streakMet = mid.consecutiveWins >= before.lifeRecovery.winStreak;
  const milestoneMet = before.lifeRecovery.milestoneRounds.includes(before.round);

  const streakJustTriggered = lifeWasGranted && streakMet;
  const milestoneJustHit = lifeWasGranted && milestoneMet;

  return {
    afterRunState,
    fluxEarned: {
      win: winFlux,
      discovery: discoveryFlux,
      milestone: milestoneFlux,
      total,
    },
    streakJustTriggered,
    milestoneJustHit,
  };
}
