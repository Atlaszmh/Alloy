import { describe, it, expect } from 'vitest';
import { earnFlux, spendFlux, canSpendFlux } from '../src/run/flux-state.js';

describe('Flux Economy', () => {
  describe('earnFlux', () => {
    it('adds flux to current balance', () => {
      const amount = earnFlux(5, 3);
      expect(amount).toBe(8);
    });

    it('handles earning flux on zero balance', () => {
      const amount = earnFlux(0, 2);
      expect(amount).toBe(2);
    });
  });

  describe('spendFlux', () => {
    it('deducts flux from balance', () => {
      const amount = spendFlux(10, 3);
      expect(amount).toBe(7);
    });

    it('prevents negative balance', () => {
      const amount = spendFlux(5, 10);
      expect(amount).toBe(5); // No change, balance stays at 5
    });

    it('allows exact balance spending', () => {
      const amount = spendFlux(5, 5);
      expect(amount).toBe(0);
    });
  });

  describe('canSpendFlux', () => {
    it('returns true when balance is sufficient', () => {
      expect(canSpendFlux(10, 3)).toBe(true);
    });

    it('returns true when balance equals cost', () => {
      expect(canSpendFlux(5, 5)).toBe(true);
    });

    it('returns false when balance is insufficient', () => {
      expect(canSpendFlux(2, 5)).toBe(false);
    });

    it('returns false for zero balance and non-zero cost', () => {
      expect(canSpendFlux(0, 1)).toBe(false);
    });

    it('returns true for zero cost regardless of balance', () => {
      expect(canSpendFlux(5, 0)).toBe(true);
    });
  });
});
