import { describe, it, expect } from 'vitest';
import type { SlotArray } from '../src/types/match.js';
import {
  clearSlot,
  emptySlots,
  findSlotIndex,
  firstEmptyIndex,
  liveCount,
  liveSlots,
  placeInFirstEmpty,
  setSlot,
} from '../src/types/slot-array.js';

interface Gem { uid: string }
const g = (uid: string): Gem => ({ uid });

describe('slot-array helpers', () => {
  describe('liveSlots / liveCount', () => {
    it('returns only non-null entries, preserving encounter order', () => {
      const slots: SlotArray<Gem> = [g('a'), null, g('b'), null, g('c')];
      expect(liveSlots(slots).map((x) => x.uid)).toEqual(['a', 'b', 'c']);
      expect(liveCount(slots)).toBe(3);
    });

    it('returns empty for all-null slots', () => {
      expect(liveSlots([null, null, null])).toEqual([]);
      expect(liveCount([null, null, null])).toBe(0);
    });
  });

  describe('firstEmptyIndex / placeInFirstEmpty', () => {
    it('finds the leftmost null slot', () => {
      expect(firstEmptyIndex([g('a'), null, g('b'), null])).toBe(1);
    });

    it('returns -1 when no slot is empty', () => {
      expect(firstEmptyIndex([g('a'), g('b')])).toBe(-1);
    });

    it('fills the first empty slot without shifting siblings', () => {
      const slots: SlotArray<Gem> = [g('a'), null, g('c'), null];
      const next = placeInFirstEmpty(slots, g('b'));
      expect(next[0]?.uid).toBe('a');
      expect(next[1]?.uid).toBe('b'); // landed in the first null
      expect(next[2]?.uid).toBe('c'); // slot 2 undisturbed
      expect(next[3]).toBeNull();
    });

    it('appends when every slot is full (array grows by exactly 1)', () => {
      const slots: SlotArray<Gem> = [g('a'), g('b')];
      const next = placeInFirstEmpty(slots, g('c'));
      expect(next).toHaveLength(3);
      expect(next[2]?.uid).toBe('c');
    });

    it('returns a new array (does not mutate input)', () => {
      const slots: SlotArray<Gem> = [g('a'), null];
      const next = placeInFirstEmpty(slots, g('b'));
      expect(next).not.toBe(slots);
      expect(slots[1]).toBeNull();
    });
  });

  describe('clearSlot', () => {
    it('sets only the target index to null', () => {
      const slots: SlotArray<Gem> = [g('a'), g('b'), g('c')];
      const next = clearSlot(slots, 1);
      expect(next[0]?.uid).toBe('a');
      expect(next[1]).toBeNull();
      expect(next[2]?.uid).toBe('c');
    });

    it('is a no-op for out-of-bounds indices', () => {
      const slots: SlotArray<Gem> = [g('a'), g('b')];
      expect(clearSlot(slots, -1)).toBe(slots);
      expect(clearSlot(slots, 5)).toBe(slots);
    });

    it('never collapses or re-packs the array (siblings stay in place)', () => {
      // This is the core behavioral guarantee of the fixed-slot refactor —
      // removing one gem must not shift the others.
      const slots: SlotArray<Gem> = [g('a'), g('b'), g('c'), g('d')];
      const next = clearSlot(slots, 0);
      expect(next).toHaveLength(4);
      expect(next[0]).toBeNull();
      expect(next[1]?.uid).toBe('b');
      expect(next[2]?.uid).toBe('c');
      expect(next[3]?.uid).toBe('d');
    });
  });

  describe('setSlot', () => {
    it('overwrites the slot at index', () => {
      const slots: SlotArray<Gem> = [g('a'), g('b')];
      expect(setSlot(slots, 1, g('B'))[1]?.uid).toBe('B');
    });

    it('grows the array with nulls if index exceeds length', () => {
      const slots: SlotArray<Gem> = [g('a')];
      const next = setSlot(slots, 3, g('z'));
      expect(next).toHaveLength(4);
      expect(next[1]).toBeNull();
      expect(next[2]).toBeNull();
      expect(next[3]?.uid).toBe('z');
    });
  });

  describe('findSlotIndex', () => {
    it('returns the index of the first matching live entry', () => {
      const slots: SlotArray<Gem> = [null, g('a'), g('b')];
      expect(findSlotIndex(slots, (x) => x.uid === 'b')).toBe(2);
    });

    it('skips null slots without invoking the predicate', () => {
      const slots: SlotArray<Gem> = [null, g('a')];
      let callCount = 0;
      findSlotIndex(slots, (x) => {
        callCount += 1;
        return x.uid === 'a';
      });
      // Predicate should only run once (for the live entry), never for null.
      expect(callCount).toBe(1);
    });

    it('returns -1 when nothing matches', () => {
      const slots: SlotArray<Gem> = [g('a'), null];
      expect(findSlotIndex(slots, (x) => x.uid === 'z')).toBe(-1);
    });
  });

  describe('emptySlots', () => {
    it('allocates a fixed-size array of nulls', () => {
      const slots = emptySlots<Gem>(3);
      expect(slots).toEqual([null, null, null]);
    });
  });
});
