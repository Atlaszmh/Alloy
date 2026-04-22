import type { SlotArray } from './match.js';

/**
 * Sparse-slot helpers for stockpile and pool arrays.
 *
 * The draft pool and player stockpile are fixed-slot arrays: removing an
 * entry sets its index to `null` rather than compacting the array, so a
 * player's arrangement never shuffles when one gem is picked, socketed, or
 * combined. These helpers centralise the "find, set, remove, count"
 * operations so individual call sites don't have to hand-roll null guards.
 */

/**
 * Strip nulls. Use at display boundaries or when you specifically want to
 * iterate the live (non-empty) entries. Mutating operations should stay on
 * the sparse array so slot positions are preserved.
 */
export function liveSlots<T>(slots: SlotArray<T>): T[] {
  const out: T[] = [];
  for (const entry of slots) {
    if (entry !== null) out.push(entry);
  }
  return out;
}

/** Count of non-null entries. Prefer this over `slots.length` when you want
 *  "how many gems are present" rather than "how wide is the array". */
export function liveCount<T>(slots: SlotArray<T>): number {
  let n = 0;
  for (const entry of slots) {
    if (entry !== null) n += 1;
  }
  return n;
}

/** Index of the first null slot, or `-1` if the array is full. */
export function firstEmptyIndex<T>(slots: SlotArray<T>): number {
  for (let i = 0; i < slots.length; i += 1) {
    if (slots[i] === null) return i;
  }
  return -1;
}

/**
 * Place an entry at the first empty slot, growing the array by one if every
 * slot is occupied. Returns a new array (immutable — callers should replace
 * their stored reference). Use for "pick to stockpile", "unsocket return",
 * or "recipe output".
 */
export function placeInFirstEmpty<T>(slots: SlotArray<T>, value: T): SlotArray<T> {
  const idx = firstEmptyIndex(slots);
  const copy = slots.slice();
  if (idx === -1) copy.push(value);
  else copy[idx] = value;
  return copy;
}

/** Set a specific slot to `null` without touching neighbours. Returns a new
 *  array. Use for "gem picked", "gem socketed", "gem combined away". */
export function clearSlot<T>(slots: SlotArray<T>, index: number): SlotArray<T> {
  if (index < 0 || index >= slots.length) return slots;
  const copy = slots.slice();
  copy[index] = null;
  return copy;
}

/** Set a specific slot to a value (overwriting whatever was there). Returns a
 *  new array. Use when the caller already knows which slot the gem belongs
 *  in — e.g. placing a combine output into the keep-gem's old slot. */
export function setSlot<T>(slots: SlotArray<T>, index: number, value: T | null): SlotArray<T> {
  if (index < 0) return slots;
  const copy = slots.slice();
  while (copy.length <= index) copy.push(null);
  copy[index] = value;
  return copy;
}

/** Find the slot index holding the entry matching `predicate`, or `-1`. */
export function findSlotIndex<T>(slots: SlotArray<T>, predicate: (entry: T) => boolean): number {
  for (let i = 0; i < slots.length; i += 1) {
    const entry = slots[i];
    if (entry !== null && predicate(entry)) return i;
  }
  return -1;
}

/** Build a fresh fixed-size slot array, nulls throughout. */
export function emptySlots<T>(size: number): SlotArray<T> {
  return new Array<T | null>(size).fill(null);
}
