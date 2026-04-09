import { describe, it, expect } from 'vitest';
import {
  computeAverageQuality,
  determineOutputTierRarity,
  applyMatchingRarityBonus,
} from '../src/combine/combine-quality.js';
import { createGem } from '../src/types/gem.js';

describe('combine-quality', () => {
  describe('computeAverageQuality', () => {
    it('averages two gem effective values', () => {
      const a = createGem('a', 'fire_damage', 1, 'common'); // EV: 1.0
      const b = createGem('b', 'cold_damage', 3, 'rare'); // EV: 4.5
      expect(computeAverageQuality(a, b)).toBe(2.75);
    });

    it('same gems produce their own value', () => {
      const a = createGem('a', 'fire_damage', 2, 'magic'); // EV: 2.5
      const b = createGem('b', 'cold_damage', 2, 'magic'); // EV: 2.5
      expect(computeAverageQuality(a, b)).toBe(2.5);
    });
  });

  describe('applyMatchingRarityBonus', () => {
    it('adds 15% when rarities match', () => {
      expect(applyMatchingRarityBonus(4.0, true, 0.15)).toBeCloseTo(4.6);
    });

    it('no bonus when rarities differ', () => {
      expect(applyMatchingRarityBonus(4.0, false, 0.15)).toBe(4.0);
    });

    it('works with zero bonus', () => {
      expect(applyMatchingRarityBonus(4.0, true, 0)).toBe(4.0);
    });
  });

  describe('determineOutputTierRarity', () => {
    it('low quality produces low tier common', () => {
      const result = determineOutputTierRarity(1.0);
      expect(result.tier).toBe(1);
      expect(result.rarity).toBe('common');
    });

    it('medium quality produces mid results', () => {
      const result = determineOutputTierRarity(3.5);
      expect(result.tier).toBe(2);
      expect(result.rarity).toBe('rare');
    });

    it('high quality produces high tier epic', () => {
      const result = determineOutputTierRarity(7.5);
      expect(result.tier).toBe(4);
      expect(result.rarity).toBe('epic');
    });

    it('very high quality can produce legendary', () => {
      const result = determineOutputTierRarity(10.0);
      expect(result.tier).toBe(5);
      expect(result.rarity).toBe('legendary');
    });

    it('tier is clamped to [1, 5]', () => {
      const low = determineOutputTierRarity(0.1);
      expect(low.tier).toBe(1);
      const high = determineOutputTierRarity(20.0);
      expect(high.tier).toBe(5);
    });

    it('accepts custom thresholds', () => {
      const custom = { common: 0, magic: 1, rare: 2, epic: 3, legendary: 4 };
      const result = determineOutputTierRarity(3.5, custom);
      expect(result.rarity).toBe('epic');
    });
  });
});
