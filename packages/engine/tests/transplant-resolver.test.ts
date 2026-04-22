import { describe, it, expect } from 'vitest';
import { resolveTransplant } from '../src/forge/transplant/resolver.js';
import { createGem, type SecondarySlot } from '../src/types/gem.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';

const makeRng = (seed = 42) => new SeededRNG(seed);

describe('resolveTransplant', () => {
  it('source with no secondary → primary transplants; slot records source tier/rarity', () => {
    const target = createGem('t', 'flat_physical', 5, 'rare');
    const source = createGem('s', 'flat_life', 3, 'magic');
    const slot = resolveTransplant({ target, source, rng: makeRng() });
    expect(slot.affixId).toBe('flat_life');
    expect(slot.tier).toBe(3);
    expect(slot.rarity).toBe('magic');
    expect(slot.sourceGemUid).toBe('s');
  });

  it('source with filled secondary + chosenAffix=primary → primary transplants', () => {
    const sourceSecondary: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const source = { ...createGem('s', 'flat_life', 4, 'epic'), secondary: sourceSecondary };
    const target = createGem('t', 'flat_physical', 5, 'rare');
    const slot = resolveTransplant({ target, source, chosenAffix: 'primary', rng: makeRng() });
    expect(slot.affixId).toBe('flat_life');
    expect(slot.tier).toBe(4);
    expect(slot.rarity).toBe('epic');
  });

  it('source with filled secondary + chosenAffix=secondary → secondary transplants', () => {
    const sourceSecondary: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const source = { ...createGem('s', 'flat_life', 4, 'epic'), secondary: sourceSecondary };
    const target = createGem('t', 'flat_physical', 5, 'rare');
    const slot = resolveTransplant({ target, source, chosenAffix: 'secondary', rng: makeRng() });
    expect(slot.affixId).toBe('flat_armor');
    expect(slot.tier).toBe(2);
    expect(slot.rarity).toBe('magic');
  });

  it('source with filled secondary + no chosenAffix → RNG picks between primary/secondary', () => {
    const sourceSecondary: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const source = { ...createGem('s', 'flat_life', 4, 'epic'), secondary: sourceSecondary };
    const target = createGem('t', 'flat_physical', 5, 'rare');
    const slot = resolveTransplant({ target, source, rng: makeRng() });
    expect(['flat_life', 'flat_armor']).toContain(slot.affixId);
  });
});
