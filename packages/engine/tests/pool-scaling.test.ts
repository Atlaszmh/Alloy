import { describe, it, expect } from 'vitest';
import {
  getPoolConfigForRound,
  DEFAULT_SCALING,
  type PoolScalingEntry,
} from '../src/run/pool-scaling.js';

describe('Pool Scaling', () => {
  describe('getPoolConfigForRound with default scaling', () => {
    it('round 1 → poolSize 20, tiers [1,2], rarities [common, magic]', () => {
      const config = getPoolConfigForRound(1);
      expect(config.poolSize).toBe(20);
      expect(config.tiers).toEqual([1, 2]);
      expect(config.rarities).toEqual(['common', 'magic']);
      expect(config.rarities).not.toContain('rare');
    });

    it('round 3 → still in first bracket', () => {
      const config = getPoolConfigForRound(3);
      expect(config.poolSize).toBe(20);
      expect(config.tiers).toEqual([1, 2]);
    });

    it('round 4 → poolSize 16, tiers [1,3], rarities includes rare', () => {
      const config = getPoolConfigForRound(4);
      expect(config.poolSize).toBe(16);
      expect(config.tiers).toEqual([1, 3]);
      expect(config.rarities).toContain('rare');
    });

    it('round 5 → poolSize 16, rarities includes rare', () => {
      const config = getPoolConfigForRound(5);
      expect(config.poolSize).toBe(16);
      expect(config.rarities).toContain('rare');
      expect(config.rarities).not.toContain('epic');
    });

    it('round 7 → poolSize 14, tiers [2,4], rarities includes epic', () => {
      const config = getPoolConfigForRound(7);
      expect(config.poolSize).toBe(14);
      expect(config.tiers).toEqual([2, 4]);
      expect(config.rarities).toContain('epic');
    });

    it('round 10 → poolSize 12, tiers [2,5], all rarities', () => {
      const config = getPoolConfigForRound(10);
      expect(config.poolSize).toBe(12);
      expect(config.tiers).toEqual([2, 5]);
      expect(config.rarities).toContain('legendary');
    });

    it('round 15 → poolSize 10, tiers [3,5] (endless bracket)', () => {
      const config = getPoolConfigForRound(15);
      expect(config.poolSize).toBe(10);
      expect(config.tiers).toEqual([3, 5]);
    });

    it('round 100 → falls into endless bracket (15+)', () => {
      const config = getPoolConfigForRound(100);
      expect(config.poolSize).toBe(10);
      expect(config.tiers).toEqual([3, 5]);
      expect(config.rarities).toContain('legendary');
    });
  });

  describe('fallback behavior', () => {
    it('falls back to last entry for out-of-range rounds', () => {
      const custom: PoolScalingEntry[] = [
        {
          roundRange: [1, 5],
          tiers: [1, 2],
          rarities: ['common'],
          poolSize: 20,
        },
        {
          roundRange: [6, 10],
          tiers: [2, 3],
          rarities: ['common', 'magic'],
          poolSize: 15,
        },
      ];

      // Round 12 is out of range, should fallback to last entry
      const config = getPoolConfigForRound(12, custom);
      expect(config.poolSize).toBe(15);
      expect(config.tiers).toEqual([2, 3]);
    });

    it('returns first matching entry when ranges are checked in order', () => {
      const config = getPoolConfigForRound(1);
      expect(config.roundRange).toEqual([1, 3]);
    });
  });

  describe('DEFAULT_SCALING table integrity', () => {
    it('covers rounds 1 through Infinity without gaps', () => {
      // Verify ranges are contiguous
      for (let i = 1; i < DEFAULT_SCALING.length; i++) {
        const prev = DEFAULT_SCALING[i - 1];
        const curr = DEFAULT_SCALING[i];
        expect(curr.roundRange[0]).toBe(prev.roundRange[1] + 1);
      }
      // First entry starts at 1
      expect(DEFAULT_SCALING[0].roundRange[0]).toBe(1);
      // Last entry extends to Infinity
      expect(DEFAULT_SCALING[DEFAULT_SCALING.length - 1].roundRange[1]).toBe(Infinity);
    });

    it('pool sizes decrease as rounds increase', () => {
      for (let i = 1; i < DEFAULT_SCALING.length; i++) {
        expect(DEFAULT_SCALING[i].poolSize).toBeLessThanOrEqual(
          DEFAULT_SCALING[i - 1].poolSize,
        );
      }
    });

    it('tier ranges generally increase with progression', () => {
      const firstMin = DEFAULT_SCALING[0].tiers[0];
      const lastMin = DEFAULT_SCALING[DEFAULT_SCALING.length - 1].tiers[0];
      expect(lastMin).toBeGreaterThanOrEqual(firstMin);

      const firstMax = DEFAULT_SCALING[0].tiers[1];
      const lastMax = DEFAULT_SCALING[DEFAULT_SCALING.length - 1].tiers[1];
      expect(lastMax).toBeGreaterThanOrEqual(firstMax);
    });

    it('rarity options expand with progression', () => {
      const firstRarityCount = DEFAULT_SCALING[0].rarities.length;
      const lastRarityCount =
        DEFAULT_SCALING[DEFAULT_SCALING.length - 1].rarities.length;
      expect(lastRarityCount).toBeGreaterThanOrEqual(firstRarityCount);
    });
  });
});
