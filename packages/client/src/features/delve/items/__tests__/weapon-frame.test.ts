import { describe, it, expect } from 'vitest';
import { CHAIN_SKILLS, generateItem, SeededRNG, slotRange } from '@alloy/engine';
import { classText, frameText, slotPairs, slotsText } from '../weapon-frame';
import { getDelveRegistry } from '../../registry';

const registry = getDelveRegistry();
const weapon = (baseId: string, rarity: 'common' | 'rare') =>
  generateItem(
    registry,
    { uid: 'w1', ilvl: 3, rarity, slot: 'weapon', baseId, mana: 'fire' },
    new SeededRNG(4),
  );

describe('weapon-frame', () => {
  it("names a weapon's class and its style: the frame line", () => {
    expect(frameText(registry, weapon('sword', 'common'))).toBe('Melee · Balanced');
    expect(frameText(registry, weapon('bow', 'rare'))).toBe('Ranged · Marksman');
    expect(classText('melee')).toBe('Melee');
    expect(classText(null)).toBe('Unarmed');
  });

  it("lists each skill's slots held against its ceiling, in skill order", () => {
    const w = weapon('sword', 'common');
    const pairs = slotPairs(registry, w);
    expect(pairs.map(([s]) => s)).toEqual(CHAIN_SKILLS);
    for (const [s, held, ceiling] of pairs) {
      expect(held).toBe(w.moveset!.slots[s] ?? 0);
      expect(ceiling).toBe(slotRange(registry, w, s)[1]);
    }
    // A common sword: the Basic's string, two Primary, no Defensive yet, no Ultimate ever.
    expect(slotsText(pairs)).toBe('Basic 3 / 3 · Primary 2 / 3 · Defensive 0 / 1 · Ultimate —');
  });

  it('formats pairs from anywhere (the forge preview hands its own)', () => {
    expect(
      slotsText([
        ['basic', 3, 4],
        ['primary', 3, 4],
        ['defensive', 2, 3],
        ['ultimate', 1, 2],
      ]),
    ).toBe('Basic 3 / 4 · Primary 3 / 4 · Defensive 2 / 3 · Ultimate 1 / 2');
  });
});
