import type { MatchPhase } from '../types/match.js';
import type { DuelResult } from '../types/combat.js';
import type { RunState } from '../run/run-state.js';
import { isRunOver } from '../run/run-state.js';

/**
 * Determine the next phase given the current phase and duel results so far.
 *
 * Ranked/unranked flow:
 *   draft(1) → forge(1) → duel(1) → draft(2) → forge(2) → duel(2) → draft(3) → forge(3) → duel(3) → complete
 *
 * Match can end early if a player reaches 2 wins (best of 3).
 */
export function getNextPhase(
  current: MatchPhase,
  roundResults: DuelResult[],
): MatchPhase {
  switch (current.kind) {
    case 'draft':
      return { kind: 'forge', round: current.round };

    case 'forge':
      return { kind: 'duel', round: current.round };

    case 'duel': {
      const round = current.round;
      const wins = countWins(roundResults);

      if (wins[0] >= 2 || wins[1] >= 2) {
        const winner = wins[0] >= 2 ? 0 : 1;
        return { kind: 'complete', winner, scores: wins };
      }
      if (round >= 3) {
        const winner = determineWinner(wins);
        return { kind: 'complete', winner, scores: wins };
      }

      // Move to draft for next round
      const nextRound = round + 1;
      return { kind: 'draft', round: nextRound, pickIndex: 0, activePlayer: 0 };
    }

    case 'complete':
      return current;
  }
}

/**
 * Quick match variant: draft(1) -> forge(1) -> duel(1) -> complete
 */
export function getNextPhaseQuick(
  current: MatchPhase,
  roundResults: DuelResult[],
): MatchPhase {
  switch (current.kind) {
    case 'draft':
      return { kind: 'forge', round: 1 };

    case 'forge':
      return { kind: 'duel', round: 1 };

    case 'duel': {
      const wins = countWins(roundResults);
      const winner = determineWinner(wins);
      return { kind: 'complete', winner, scores: wins };
    }

    case 'complete':
      return current;
  }
}

/**
 * Run-based phase progression (run_async / run_live modes).
 * After a duel, checks if the run is over (lives depleted) or goal reached.
 * If neither, advances to draft for the next round (unlimited rounds).
 */
export function getNextPhaseRun(
  current: MatchPhase,
  roundResults: DuelResult[],
  runState: RunState,
): MatchPhase {
  switch (current.kind) {
    case 'draft':
      return { kind: 'forge', round: current.round };

    case 'forge':
      return { kind: 'duel', round: current.round };

    case 'duel': {
      // Check if run is over (lives depleted)
      if (isRunOver(runState)) {
        const wins = countWins(roundResults);
        return { kind: 'complete', winner: 1, scores: wins }; // Player lost the run
      }

      // Check if goal reached — in run mode, reaching the goal still means we
      // continue to "endless" mode. But if the run state says 'won', mark complete.
      if (runState.status === 'won') {
        const wins = countWins(roundResults);
        return { kind: 'complete', winner: 0, scores: wins }; // Player won the run
      }

      // Advance to next round
      const nextRound = current.round + 1;
      return { kind: 'draft', round: nextRound, pickIndex: 0, activePlayer: 0 };
    }

    case 'complete':
      return current;
  }
}

export function isValidTransition(from: MatchPhase, to: MatchPhase): boolean {
  if (from.kind === 'complete') return false;

  switch (from.kind) {
    case 'draft':
      return to.kind === 'forge' && to.round === from.round;

    case 'forge':
      return to.kind === 'duel' && to.round === from.round;

    case 'duel':
      if (to.kind === 'complete') return true;
      if (to.kind === 'draft') {
        return to.round === from.round + 1;
      }
      return false;

    default:
      return false;
  }
}

export function countWins(results: DuelResult[]): [number, number] {
  let w0 = 0;
  let w1 = 0;
  for (const r of results) {
    if (r.winner === 0) w0++;
    else if (r.winner === 1) w1++;
  }
  return [w0, w1];
}

function determineWinner(wins: [number, number]): 0 | 1 | 'draw' {
  if (wins[0] > wins[1]) return 0;
  if (wins[1] > wins[0]) return 1;
  return 'draw';
}
