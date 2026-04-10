import { describe, it, expect } from 'vitest';
import { createGem } from '../src/types/gem.js';
import { createEmptyLoadout } from '../src/types/item.js';
import {
  extractGemsFromLoadout,
  computeLoadoutQuality,
  computePowerBracket,
  serializePayload,
  isMatchable,
} from '../src/run/payload.js';

describe('payload', () => {
  function makeLoadoutWithGems() {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const gem1 = createGem('g1', 'fire_damage', 2, 'magic');  // EV: 2.5
    const gem2 = createGem('g2', 'cold_damage', 3, 'rare');   // EV: 4.5
    loadout.weapon.slots[0] = { gem: gem1 };
    loadout.armor.slots[0] = { gem: gem2 };
    return loadout;
  }

  describe('extractGemsFromLoadout', () => {
    it('extracts gems from filled slots, ignores nulls', () => {
      const loadout = makeLoadoutWithGems();
      const { weapon, armor } = extractGemsFromLoadout(loadout);
      expect(weapon).toHaveLength(1);
      expect(armor).toHaveLength(1);
      expect(weapon[0].affixId).toBe('fire_damage');
    });

    it('returns empty arrays for empty loadout', () => {
      const loadout = createEmptyLoadout('sword', 'chainmail');
      const { weapon, armor } = extractGemsFromLoadout(loadout);
      expect(weapon).toHaveLength(0);
      expect(armor).toHaveLength(0);
    });
  });

  describe('computeLoadoutQuality', () => {
    it('sums effective values of all socketed gems', () => {
      const loadout = makeLoadoutWithGems();
      expect(computeLoadoutQuality(loadout)).toBe(7.0); // 2.5 + 4.5
    });

    it('returns 0 for empty loadout', () => {
      const loadout = createEmptyLoadout('sword', 'chainmail');
      expect(computeLoadoutQuality(loadout)).toBe(0);
    });
  });

  describe('computePowerBracket', () => {
    it('floors quality / bracketSize', () => {
      const loadout = makeLoadoutWithGems(); // quality 7.0
      expect(computePowerBracket(loadout, 5.0)).toBe(1); // floor(7/5) = 1
    });

    it('uses default bracketSize of 5', () => {
      const loadout = makeLoadoutWithGems();
      expect(computePowerBracket(loadout)).toBe(1);
    });
  });

  describe('serializePayload', () => {
    it('produces correct payload shape', () => {
      const loadout = makeLoadoutWithGems();
      const payload = serializePayload(loadout, 3);
      expect(payload.runRound).toBe(3);
      expect(payload.powerBracket).toBe(1);
      expect(payload.loadout.weapon.gems).toHaveLength(1);
      expect(payload.loadout.armor.gems).toHaveLength(1);
      expect(payload.loadout.weapon.baseItemId).toBe('sword');
    });
  });

  describe('isMatchable', () => {
    it('matches within default deltas', () => {
      const a = serializePayload(makeLoadoutWithGems(), 3);
      const b = serializePayload(makeLoadoutWithGems(), 4);
      expect(isMatchable(a, b)).toBe(true);
    });

    it('rejects when round delta too large', () => {
      const a = serializePayload(makeLoadoutWithGems(), 1);
      const b = serializePayload(makeLoadoutWithGems(), 5);
      expect(isMatchable(a, b)).toBe(false);
    });

    it('accepts custom deltas', () => {
      const a = serializePayload(makeLoadoutWithGems(), 1);
      const b = serializePayload(makeLoadoutWithGems(), 5);
      expect(isMatchable(a, b, 4, 1)).toBe(true);
    });
  });
});
