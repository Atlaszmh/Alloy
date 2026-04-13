import { describe, it, expect, beforeEach } from 'vitest';
import { useRunStore, selectIsRunOver, selectIsGoalReached, selectIsEndless } from './runStore';

describe('runStore', () => {
  beforeEach(() => {
    useRunStore.getState().resetRun();
  });

  describe('initial state', () => {
    it('starts with default values', () => {
      const s = useRunStore.getState();
      expect(s.lives).toBe(3);
      expect(s.round).toBe(1);
      expect(s.goal).toBeNull();
      expect(s.status).toBe('active');
      expect(s.consecutiveWins).toBe(0);
    });
  });

  describe('startRun', () => {
    it('initializes run with given lives and goal', () => {
      useRunStore.getState().startRun(5, 10);
      const s = useRunStore.getState();
      expect(s.lives).toBe(5);
      expect(s.round).toBe(1);
      expect(s.goal).toBe(10);
      expect(s.status).toBe('active');
      expect(s.consecutiveWins).toBe(0);
    });

    it('supports endless mode with null goal', () => {
      useRunStore.getState().startRun(3, null);
      expect(useRunStore.getState().goal).toBeNull();
    });
  });

  describe('loseLife', () => {
    it('decrements lives', () => {
      useRunStore.getState().startRun(3, 10);
      useRunStore.getState().loseLife();
      expect(useRunStore.getState().lives).toBe(2);
      expect(useRunStore.getState().status).toBe('active');
    });

    it('sets status to lost when lives reach zero', () => {
      useRunStore.getState().startRun(1, 10);
      useRunStore.getState().loseLife();
      expect(useRunStore.getState().lives).toBe(0);
      expect(useRunStore.getState().status).toBe('lost');
    });

    it('resets consecutive wins on loss', () => {
      useRunStore.getState().startRun(3, 10);
      useRunStore.getState().winRound();
      useRunStore.getState().winRound();
      expect(useRunStore.getState().consecutiveWins).toBe(2);
      useRunStore.getState().loseLife();
      expect(useRunStore.getState().consecutiveWins).toBe(0);
    });
  });

  describe('winRound', () => {
    it('increments consecutive wins', () => {
      useRunStore.getState().startRun(3, 10);
      useRunStore.getState().winRound();
      expect(useRunStore.getState().consecutiveWins).toBe(1);
      useRunStore.getState().winRound();
      expect(useRunStore.getState().consecutiveWins).toBe(2);
    });

    it('sets status to won when goal is reached', () => {
      useRunStore.getState().startRun(3, 2);
      useRunStore.getState().advanceRound(); // round 2
      useRunStore.getState().winRound();
      expect(useRunStore.getState().status).toBe('won');
    });

    it('does not set won status in endless mode', () => {
      useRunStore.getState().startRun(3, null);
      useRunStore.getState().winRound();
      useRunStore.getState().advanceRound();
      useRunStore.getState().winRound();
      expect(useRunStore.getState().status).toBe('active');
    });
  });

  describe('advanceRound', () => {
    it('increments the round counter', () => {
      useRunStore.getState().startRun(3, 10);
      useRunStore.getState().advanceRound();
      expect(useRunStore.getState().round).toBe(2);
      useRunStore.getState().advanceRound();
      expect(useRunStore.getState().round).toBe(3);
    });
  });

  describe('resetRun', () => {
    it('resets all state to defaults', () => {
      useRunStore.getState().startRun(5, 10);
      useRunStore.getState().advanceRound();
      useRunStore.getState().winRound();
      useRunStore.getState().loseLife();
      useRunStore.getState().resetRun();

      const s = useRunStore.getState();
      expect(s.lives).toBe(3);
      expect(s.round).toBe(1);
      expect(s.goal).toBeNull();
      expect(s.status).toBe('active');
      expect(s.consecutiveWins).toBe(0);
    });
  });

  describe('selectors', () => {
    it('selectIsRunOver returns true when status is lost', () => {
      useRunStore.getState().startRun(1, 10);
      useRunStore.getState().loseLife();
      expect(selectIsRunOver(useRunStore.getState())).toBe(true);
    });

    it('selectIsRunOver returns false when active', () => {
      expect(selectIsRunOver(useRunStore.getState())).toBe(false);
    });

    it('selectIsGoalReached returns true when status is won', () => {
      useRunStore.getState().startRun(3, 1);
      useRunStore.getState().winRound();
      expect(selectIsGoalReached(useRunStore.getState())).toBe(true);
    });

    it('selectIsGoalReached returns false when active', () => {
      expect(selectIsGoalReached(useRunStore.getState())).toBe(false);
    });

    it('selectIsEndless returns true when goal is null', () => {
      expect(selectIsEndless(useRunStore.getState())).toBe(true);
    });

    it('selectIsEndless returns false when goal is set', () => {
      useRunStore.getState().startRun(3, 10);
      expect(selectIsEndless(useRunStore.getState())).toBe(false);
    });
  });
});
