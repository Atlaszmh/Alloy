import { describe, it, expect } from 'vitest';
import {
  createRunState,
  loseLife,
  winRound,
  checkLifeRecovery,
  isRunOver,
  isGoalReached,
  advanceRound,
} from '../src/run/run-state.js';

describe('RunState', () => {
  describe('createRunState', () => {
    it('creates default state with 3 lives and goal round 10', () => {
      const state = createRunState();
      expect(state.lives).toBe(3);
      expect(state.startingLives).toBe(3);
      expect(state.round).toBe(1);
      expect(state.status).toBe('active');
      expect(state.consecutiveWins).toBe(0);
      expect(state.totalWins).toBe(0);
      expect(state.totalLosses).toBe(0);
      expect(state.goalRound).toBe(10);
    });

    it('accepts custom starting lives and goal round', () => {
      const state = createRunState({ startingLives: 5, goalRound: 20 });
      expect(state.lives).toBe(5);
      expect(state.startingLives).toBe(5);
      expect(state.goalRound).toBe(20);
    });

    it('accepts custom life recovery config', () => {
      const state = createRunState({
        lifeRecovery: { winStreak: 5, milestoneRounds: [3, 7] },
      });
      expect(state.lifeRecovery.winStreak).toBe(5);
      expect(state.lifeRecovery.milestoneRounds).toEqual([3, 7]);
      // discoveryThreshold should keep its default
      expect(state.lifeRecovery.discoveryThreshold).toBe(5);
    });
  });

  describe('loseLife', () => {
    it('decrements lives by 1', () => {
      const state = createRunState();
      const after = loseLife(state);
      expect(after.lives).toBe(2);
    });

    it('resets consecutive wins on loss', () => {
      let state = createRunState();
      state = winRound(state);
      state = winRound(state);
      expect(state.consecutiveWins).toBe(2);

      const after = loseLife(state);
      expect(after.consecutiveWins).toBe(0);
    });

    it('increments totalLosses', () => {
      const state = createRunState();
      const after = loseLife(state);
      expect(after.totalLosses).toBe(1);
    });

    it('sets status to lost when lives reach 0', () => {
      let state = createRunState({ startingLives: 1 });
      state = loseLife(state);
      expect(state.lives).toBe(0);
      expect(state.status).toBe('lost');
    });

    it('does not change status if lives remain above 0', () => {
      const state = createRunState({ startingLives: 2 });
      const after = loseLife(state);
      expect(after.lives).toBe(1);
      expect(after.status).toBe('active');
    });
  });

  describe('winRound', () => {
    it('increments consecutiveWins and totalWins', () => {
      const state = createRunState();
      const after = winRound(state);
      expect(after.consecutiveWins).toBe(1);
      expect(after.totalWins).toBe(1);
    });

    it('accumulates consecutive wins', () => {
      let state = createRunState();
      state = winRound(state);
      state = winRound(state);
      state = winRound(state);
      expect(state.consecutiveWins).toBe(3);
      expect(state.totalWins).toBe(3);
    });
  });

  describe('checkLifeRecovery', () => {
    describe('win streak recovery', () => {
      it('restores a life when win streak threshold is met', () => {
        let state = createRunState({
          startingLives: 3,
          lifeRecovery: { winStreak: 3 },
        });
        // Lose a life first so recovery is observable
        state = loseLife(state);
        expect(state.lives).toBe(2);

        // Win 3 in a row
        state = winRound(state);
        state = winRound(state);
        state = winRound(state);
        expect(state.consecutiveWins).toBe(3);

        state = checkLifeRecovery(state);
        expect(state.lives).toBe(3);
        expect(state.consecutiveWins).toBe(0); // streak reset
      });

      it('does not restore life if streak not reached', () => {
        let state = createRunState({
          startingLives: 3,
          lifeRecovery: { winStreak: 3 },
        });
        state = loseLife(state);
        state = winRound(state);
        state = winRound(state);

        state = checkLifeRecovery(state);
        expect(state.lives).toBe(2); // no change
      });
    });

    describe('milestone round recovery', () => {
      it('restores a life on a milestone round', () => {
        let state = createRunState({
          startingLives: 3,
          lifeRecovery: { milestoneRounds: [5] },
        });
        state = loseLife(state);
        // Advance to round 5
        state = { ...state, round: 5 };

        state = checkLifeRecovery(state);
        expect(state.lives).toBe(3);
      });

      it('does not restore a life on non-milestone round', () => {
        let state = createRunState({
          startingLives: 3,
          lifeRecovery: { milestoneRounds: [5] },
        });
        state = loseLife(state);
        state = { ...state, round: 4 };

        state = checkLifeRecovery(state);
        expect(state.lives).toBe(2);
      });
    });

    describe('discovery threshold recovery', () => {
      it('restores a life when discovery count meets threshold', () => {
        let state = createRunState({
          startingLives: 3,
          lifeRecovery: { discoveryThreshold: 5 },
        });
        state = loseLife(state);

        state = checkLifeRecovery(state, 5);
        expect(state.lives).toBe(3);
      });

      it('does not restore life when discovery count is below threshold', () => {
        let state = createRunState({
          startingLives: 3,
          lifeRecovery: { discoveryThreshold: 5 },
        });
        state = loseLife(state);

        state = checkLifeRecovery(state, 4);
        expect(state.lives).toBe(2);
      });
    });

    describe('life cap', () => {
      it('does not exceed starting lives even with multiple recovery sources', () => {
        let state = createRunState({
          startingLives: 3,
          lifeRecovery: {
            winStreak: 1,
            milestoneRounds: [1],
            discoveryThreshold: 1,
          },
        });
        // State starts at full lives (3/3)
        state = winRound(state);

        // All three sources trigger: streak=1 met, round=1 milestone, discovery=1
        state = checkLifeRecovery(state, 1);
        expect(state.lives).toBe(3); // capped at startingLives
      });

      it('caps at starting lives after single recovery', () => {
        let state = createRunState({ startingLives: 3 });
        // Already at full lives
        state = winRound(state);
        state = winRound(state);
        state = winRound(state);

        state = checkLifeRecovery(state);
        expect(state.lives).toBe(3);
      });
    });
  });

  describe('isRunOver', () => {
    it('returns true when lives are 0', () => {
      let state = createRunState({ startingLives: 1 });
      state = loseLife(state);
      expect(isRunOver(state)).toBe(true);
    });

    it('returns false when lives remain', () => {
      const state = createRunState();
      expect(isRunOver(state)).toBe(false);
    });
  });

  describe('isGoalReached', () => {
    it('returns true when round equals goal round', () => {
      let state = createRunState({ goalRound: 5 });
      state = { ...state, round: 5 };
      expect(isGoalReached(state)).toBe(true);
    });

    it('returns true when round exceeds goal round', () => {
      let state = createRunState({ goalRound: 5 });
      state = { ...state, round: 7 };
      expect(isGoalReached(state)).toBe(true);
    });

    it('returns false when round is below goal', () => {
      const state = createRunState({ goalRound: 10 });
      expect(isGoalReached(state)).toBe(false);
    });
  });

  describe('advanceRound', () => {
    it('increments round by 1', () => {
      const state = createRunState();
      const after = advanceRound(state);
      expect(after.round).toBe(2);
    });

    it('sets status to won when reaching goal round', () => {
      let state = createRunState({ goalRound: 3 });
      state = advanceRound(state); // round 2
      expect(state.status).toBe('active');
      state = advanceRound(state); // round 3
      expect(state.status).toBe('won');
    });

    it('does not change status before reaching goal', () => {
      let state = createRunState({ goalRound: 10 });
      state = advanceRound(state);
      expect(state.status).toBe('active');
    });
  });

  describe('full run simulation', () => {
    it('simulates a complete run with wins and losses', () => {
      let state = createRunState({
        startingLives: 3,
        goalRound: 5,
        lifeRecovery: { winStreak: 2, milestoneRounds: [3], discoveryThreshold: 10 },
      });

      // Round 1: win
      state = winRound(state);
      state = checkLifeRecovery(state);
      state = advanceRound(state);
      expect(state.round).toBe(2);
      expect(state.lives).toBe(3);

      // Round 2: lose
      state = loseLife(state);
      state = advanceRound(state);
      expect(state.round).toBe(3);
      expect(state.lives).toBe(2);

      // Round 3: win (milestone round + win, but streak is only 1)
      state = winRound(state);
      state = checkLifeRecovery(state);
      state = advanceRound(state);
      expect(state.round).toBe(4);
      expect(state.lives).toBe(3); // milestone recovery at round 3

      // Round 4: win (streak = 2, triggers win streak recovery but already full)
      state = winRound(state);
      state = checkLifeRecovery(state);
      state = advanceRound(state);
      expect(state.round).toBe(5);
      expect(state.lives).toBe(3);
      expect(state.status).toBe('won');
      expect(isGoalReached(state)).toBe(true);
    });
  });
});
