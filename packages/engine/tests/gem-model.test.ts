import { describe, it, expect } from 'vitest';
import {
  createGem,
  calculateEffectiveValue,
  isCombinable,
  getGemTags,
  nextRarity,
  rarityIndex,
  type GemInstance,
  type GemRarity,
  type SecondarySlot,
} from '../src/types/gem.js';

describe('GemInstance', () => {
  describe('createGem', () => {
    it('creates a base gem with defaults', () => {
      const gem = createGem('gem_1', 'fire_damage', 1, 'common');
      expect(gem.uid).toBe('gem_1');
      expect(gem.affixId).toBe('fire_damage');
      expect(gem.tier).toBe(1);
      expect(gem.rarity).toBe('common');
      expect(gem.recipeDepth).toBe(0);
      expect(gem.combinable).toBe(true);
      expect(gem.tags).toEqual(['fire_damage']);
      expect(gem.outputBonusEffects).toBeUndefined();
    });

    it('creates a recipe result gem', () => {
      const gem = createGem('gem_2', 'burn', 2, 'magic', {
        sourceRecipe: 'burn',
        recipeDepth: 1,
      });
      expect(gem.sourceRecipe).toBe('burn');
      expect(gem.recipeDepth).toBe(1);
      expect(gem.combinable).toBe(true);
    });

    it('creates a gem with custom tags and bonus effects', () => {
      const gem = createGem('gem_3', 'searing_strike', 3, 'rare', {
        sourceRecipe: 'searing_strike',
        recipeDepth: 2,
        tags: ['fire_damage', 'dot_multiplier', 'crit_chance'],
        outputBonusEffects: [{ stat: 'critBurnDamage', op: 'flat', value: 10 }],
      });
      expect(gem.tags).toEqual(['fire_damage', 'dot_multiplier', 'crit_chance']);
      expect(gem.outputBonusEffects).toEqual([{ stat: 'critBurnDamage', op: 'flat', value: 10 }]);
    });
  });

  describe('calculateEffectiveValue', () => {
    it('returns tier * rarity multiplier', () => {
      expect(calculateEffectiveValue(1, 'common')).toBe(1.0);
      expect(calculateEffectiveValue(3, 'rare')).toBe(4.5);
      expect(calculateEffectiveValue(5, 'legendary')).toBe(15.0);
    });

    it('Tier 3 Rare > Tier 4 Common', () => {
      expect(calculateEffectiveValue(3, 'rare'))
        .toBeGreaterThan(calculateEffectiveValue(4, 'common'));
    });

    it('all rarity multipliers', () => {
      expect(calculateEffectiveValue(1, 'common')).toBe(1.0);
      expect(calculateEffectiveValue(1, 'uncommon')).toBe(1.1);
      expect(calculateEffectiveValue(1, 'magic')).toBe(1.25);
      expect(calculateEffectiveValue(1, 'rare')).toBe(1.5);
      expect(calculateEffectiveValue(1, 'epic')).toBe(2.0);
      expect(calculateEffectiveValue(1, 'legendary')).toBe(3.0);
    });
  });

  describe('isCombinable', () => {
    it('returns true for base gem', () => {
      expect(isCombinable({ tier: 1, rarity: 'common', recipeDepth: 0 })).toBe(true);
    });

    it('returns false when both axes maxed', () => {
      expect(isCombinable({ tier: 5, rarity: 'legendary', recipeDepth: 0 })).toBe(false);
    });

    it('returns false when at max recipe depth', () => {
      expect(isCombinable({ tier: 1, rarity: 'common', recipeDepth: 3 })).toBe(false);
    });

    it('returns true for max tier but low rarity', () => {
      expect(isCombinable({ tier: 5, rarity: 'common', recipeDepth: 0 })).toBe(true);
    });

    it('returns true for legendary but low tier', () => {
      expect(isCombinable({ tier: 1, rarity: 'legendary', recipeDepth: 0 })).toBe(true);
    });
  });

  describe('getGemTags', () => {
    it('returns deduplicated tags', () => {
      const gem = createGem('g', 'fire_damage', 1, 'common', {
        tags: ['fire_damage', 'dot_multiplier', 'fire_damage'],
      });
      const tags = getGemTags(gem);
      expect(tags).toEqual(['fire_damage', 'dot_multiplier']);
    });
  });

  describe('nextRarity', () => {
    it('advances through rarity tiers', () => {
      expect(nextRarity('common')).toBe('uncommon');
      expect(nextRarity('uncommon')).toBe('magic');
      expect(nextRarity('magic')).toBe('rare');
      expect(nextRarity('rare')).toBe('epic');
      expect(nextRarity('epic')).toBe('legendary');
      expect(nextRarity('legendary')).toBeNull();
    });
  });

  describe('rarityIndex', () => {
    it('returns correct indices', () => {
      expect(rarityIndex('common')).toBe(0);
      expect(rarityIndex('uncommon')).toBe(1);
      expect(rarityIndex('magic')).toBe(2);
      expect(rarityIndex('rare')).toBe(3);
      expect(rarityIndex('epic')).toBe(4);
      expect(rarityIndex('legendary')).toBe(5);
    });
  });
});

describe('SecondarySlot', () => {
  it('GemInstance accepts an optional secondary slot', () => {
    const base = createGem('g1', 'flat_physical', 5, 'rare');
    const slot: SecondarySlot = {
      affixId: 'flat_life',
      tier: 3,
      rarity: 'magic',
      sourceGemUid: 'src-1',
    };
    const gem: GemInstance = { ...base, secondary: slot };
    expect(gem.secondary?.affixId).toBe('flat_life');
    expect(gem.secondary?.tier).toBe(3);
    expect(gem.secondary?.rarity).toBe('magic');
  });
});
