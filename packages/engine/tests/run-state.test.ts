import { describe, it, expect } from 'vitest';
import {
  createRunState,
  loseLife,
  winRound,
  checkLifeRecovery,
  isRunOver,
  isGoalReached,
  advanceRound,
  previewRoundResult,
} from '../src/run/run-state.js';
import { loadAndValidateData } from '../src/data/loader.js';

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

  describe('previewRoundResult', () => {
    const balance = loadAndValidateData().balance;

    it('win without recovery: +1 flux, no life gained, streak +1', () => {
      const before = createRunState({
        startingLives: 3,
        lifeRecovery: { winStreak: 3, milestoneRounds: [5, 10], discoveryThreshold: 5 },
      });
      const preview = previewRoundResult(before, 0, true, balance);

      expect(preview.afterRunState.lives).toBe(3); // already at cap, no gain
      expect(preview.afterRunState.consecutiveWins).toBe(1);
      expect(preview.fluxEarned.win).toBe(balance.gem.flux.rewards.win);
      expect(preview.fluxEarned.milestone).toBe(0);
      expect(preview.fluxEarned.total).toBe(balance.gem.flux.rewards.win);
      expect(preview.streakJustTriggered).toBe(false);
      expect(preview.milestoneJustHit).toBe(false);
    });

    it('win with 3-streak triggers streak recovery', () => {
      let before = createRunState({
        startingLives: 3,
        lifeRecovery: { winStreak: 3, milestoneRounds: [5, 10], discoveryThreshold: 5 },
      });
      // Lose one life so recovery is observable
      before = loseLife(before);
      // Build up a 2-win streak so this round's win makes it 3
      before = winRound(before);
      before = winRound(before);
      expect(before.lives).toBe(2);
      expect(before.consecutiveWins).toBe(2);

      const preview = previewRoundResult(before, 0, true, balance);

      expect(preview.afterRunState.lives).toBe(3); // +1 recovered
      expect(preview.afterRunState.consecutiveWins).toBe(0); // streak reset
      expect(preview.streakJustTriggered).toBe(true);
      expect(preview.milestoneJustHit).toBe(false);
    });

    it('finishing a milestone round triggers milestone LIFE recovery (pre-advance)', () => {
      // Engine: checkLifeRecovery runs before advanceRound and keys on the
      // current (pre-advance) round. So finishing round 5 with milestoneRounds=[5]
      // grants a life. Flux is awarded separately after advanceRound, so it
      // fires on entering (not finishing) a milestone round — see next test.
      let before = createRunState({
        startingLives: 3,
        lifeRecovery: { winStreak: 3, milestoneRounds: [5], discoveryThreshold: 999 },
      });
      before = loseLife(before);
      before = { ...before, round: 5 };

      const preview = previewRoundResult(before, 0, true, balance);

      expect(preview.afterRunState.lives).toBe(3);
      expect(preview.milestoneJustHit).toBe(true);
      expect(preview.streakJustTriggered).toBe(false);
      // Post-advance round is 6, not a milestone → no milestone flux here.
      expect(preview.fluxEarned.milestone).toBe(0);
    });

    it('entering a milestone round triggers milestone FLUX (post-advance)', () => {
      // Engine: milestone flux is awarded after advanceRound and keys on the
      // post-advance round. Finishing round 4 → advancing to milestone round 5
      // → awards milestone flux. This is different from the round that grants
      // milestone LIFE recovery (see previous test).
      const before = {
        ...createRunState({
          startingLives: 3,
          lifeRecovery: { winStreak: 3, milestoneRounds: [5], discoveryThreshold: 999 },
        }),
        round: 4,
      };

      const preview = previewRoundResult(before, 0, true, balance);

      expect(preview.fluxEarned.milestone).toBe(balance.gem.flux.rewards.milestone);
      // Life recovery keys on pre-advance round (4, not a milestone) → no life gain.
      expect(preview.milestoneJustHit).toBe(false);
    });

    it('loss: no flux, lives -1, no recovery flags', () => {
      const before = createRunState({
        startingLives: 3,
        lifeRecovery: { winStreak: 3, milestoneRounds: [5], discoveryThreshold: 5 },
      });
      const preview = previewRoundResult(before, 0, false, balance);

      expect(preview.afterRunState.lives).toBe(2);
      expect(preview.fluxEarned.total).toBe(0);
      expect(preview.fluxEarned.win).toBe(0);
      expect(preview.streakJustTriggered).toBe(false);
      expect(preview.milestoneJustHit).toBe(false);
    });

    it('win with both streak and milestone still caps at startingLives', () => {
      let before = createRunState({
        startingLives: 3,
        lifeRecovery: { winStreak: 3, milestoneRounds: [5], discoveryThreshold: 999 },
      });
      // Drop to 1 life so there's room to gain
      before = loseLife(before);
      before = loseLife(before);
      // Build a 2-win streak so this win makes 3
      before = winRound(before);
      before = winRound(before);
      before = { ...before, round: 5 };
      expect(before.lives).toBe(1);

      const preview = previewRoundResult(before, 0, true, balance);

      // Both sources triggered but capped at startingLives
      expect(preview.afterRunState.lives).toBe(3);
      expect(preview.streakJustTriggered).toBe(true);
      expect(preview.milestoneJustHit).toBe(true);
    });

    it('discovery-threshold + streak + milestone does not multi-recover past cap', () => {
      let before = createRunState({
        startingLives: 3,
        lifeRecovery: { winStreak: 3, milestoneRounds: [5], discoveryThreshold: 5 },
      });
      // Drop to 1 life
      before = loseLife(before);
      before = loseLife(before);
      // Build 2-win streak → this win makes 3
      before = winRound(before);
      before = winRound(before);
      before = { ...before, round: 5 };

      const preview = previewRoundResult(before, 5, true, balance);

      // All three sources would trigger, but cap holds
      expect(preview.afterRunState.lives).toBeLessThanOrEqual(before.startingLives);
      expect(preview.afterRunState.lives).toBe(3);
    });

    it('does not mutate input RunState', () => {
      const before = createRunState({
        startingLives: 3,
        lifeRecovery: { winStreak: 3, milestoneRounds: [5], discoveryThreshold: 5 },
      });
      const snapshot = JSON.parse(JSON.stringify(before));

      previewRoundResult(before, 10, true, balance);
      previewRoundResult(before, 0, false, balance);

      expect(before).toEqual(snapshot);
    });

    it('milestoneJustHit=false when lives already at cap', () => {
      const before = createRunState({
        startingLives: 3,
        lifeRecovery: { winStreak: 999, milestoneRounds: [5], discoveryThreshold: 999 },
      });
      // At cap (3/3), finishing round 5 — life recovery caps, no life granted.
      const onMilestone = { ...before, round: 5 };

      const preview = previewRoundResult(onMilestone, 0, true, balance);

      expect(preview.afterRunState.lives).toBe(3);
      // Life was NOT actually granted (already at cap), so flag should be false
      expect(preview.milestoneJustHit).toBe(false);
    });

    it('milestone flux is awarded independently of life gain (post-advance round)', () => {
      const before = {
        ...createRunState({
          startingLives: 3,
          lifeRecovery: { winStreak: 999, milestoneRounds: [5], discoveryThreshold: 999 },
        }),
        round: 4,
      };
      // At cap (3/3), finishing round 4 → advancing to milestone round 5.
      // Flux fires regardless of whether a life would be granted.
      const preview = previewRoundResult(before, 0, true, balance);

      expect(preview.fluxEarned.milestone).toBe(balance.gem.flux.rewards.milestone);
    });

    it('milestone flux aligns with match-controller.ts handleDuelContinue (awarded on post-advance round)', () => {
      // Contract: the preview MUST match the engine's real path. Engine
      // (match-controller.ts:466-471) awards milestone flux keyed on the
      // post-advance round. This test pins that alignment.
      const makeState = (round: number) => ({
        ...createRunState({
          startingLives: 3,
          lifeRecovery: { winStreak: 999, milestoneRounds: [5], discoveryThreshold: 999 },
        }),
        round,
      });

      // Finishing round 4 → post-advance round 5 is in milestoneRounds → flux.
      const preview4 = previewRoundResult(makeState(4), 0, true, balance);
      expect(preview4.fluxEarned.milestone).toBeGreaterThan(0);

      // Finishing round 5 → post-advance round 6 is NOT in milestoneRounds → no flux.
      const preview5 = previewRoundResult(makeState(5), 0, true, balance);
      expect(preview5.fluxEarned.milestone).toBe(0);
    });

    it('milestone flux is awarded on a losing round that still advances', () => {
      // Engine: advanceRound runs after checkLifeRecovery, regardless of
      // win/loss, as long as the run is not over. So a loss on round 4 that
      // leaves lives > 0 still advances to round 5 and earns milestone flux.
      const before = {
        ...createRunState({
          startingLives: 3,
          lifeRecovery: { winStreak: 999, milestoneRounds: [5], discoveryThreshold: 999 },
        }),
        round: 4,
      };
      const preview = previewRoundResult(before, 0, false, balance);
      expect(preview.afterRunState.lives).toBe(2);
      expect(preview.fluxEarned.win).toBe(0);
      expect(preview.fluxEarned.milestone).toBe(balance.gem.flux.rewards.milestone);
    });

    it('milestone flux is NOT awarded when the run ends (lives hit 0)', () => {
      // Engine: if isRunOver, handleDuelContinue returns before advanceRound,
      // so no milestone flux. Mirror that here.
      const before = {
        ...createRunState({
          startingLives: 1,
          lifeRecovery: { winStreak: 999, milestoneRounds: [5], discoveryThreshold: 999 },
        }),
        round: 4,
      };
      const preview = previewRoundResult(before, 0, false, balance);
      expect(preview.afterRunState.lives).toBe(0);
      expect(preview.fluxEarned.milestone).toBe(0);
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
