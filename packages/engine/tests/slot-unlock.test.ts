import { describe, it, expect } from 'vitest';
import { createGem, hasSecondarySlot, RARITY_ORDER } from '../src/types/gem.js';

const THRESHOLD = 6;

describe('hasSecondarySlot', () => {
  it('returns true when tier + rarityIndex >= threshold', () => {
    expect(hasSecondarySlot(createGem('g', 'flat_physical', 2, 'legendary'), THRESHOLD)).toBe(true);
    expect(hasSecondarySlot(createGem('g', 'flat_physical', 3, 'rare'), THRESHOLD)).toBe(true);
    expect(hasSecondarySlot(createGem('g', 'flat_physical', 5, 'uncommon'), THRESHOLD)).toBe(true);
  });

  it('returns false when tier + rarityIndex < threshold', () => {
    expect(hasSecondarySlot(createGem('g', 'flat_physical', 5, 'common'), THRESHOLD)).toBe(false);
    expect(hasSecondarySlot(createGem('g', 'flat_physical', 3, 'magic'), THRESHOLD)).toBe(false);
  });

  it('Common gems can never unlock', () => {
    for (let t = 1; t <= 5; t++) {
      expect(hasSecondarySlot(createGem('g', 'flat_physical', t as 1|2|3|4|5, 'common'), THRESHOLD)).toBe(false);
    }
  });

  it('exhaustive table matches threshold 6', () => {
    const expected: Record<string, number[]> = {
      common: [],
      uncommon: [5],
      magic: [4, 5],
      rare: [3, 4, 5],
      epic: [2, 3, 4, 5],
      legendary: [1, 2, 3, 4, 5],
    };
    for (const rarity of RARITY_ORDER) {
      for (let t = 1; t <= 5; t++) {
        const unlocked = hasSecondarySlot(createGem('g', 'flat_physical', t as 1|2|3|4|5, rarity), THRESHOLD);
        expect(unlocked).toBe(expected[rarity].includes(t));
      }
    }
  });
});
