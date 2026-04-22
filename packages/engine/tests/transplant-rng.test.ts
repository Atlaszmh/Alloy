import { describe, it, expect } from 'vitest';
import { resolveTransplant } from '../src/forge/transplant/resolver.js';
import { createGem, type SecondarySlot } from '../src/types/gem.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';

describe('transplant RNG determinism', () => {
  it('same seed + same fork label = same random result', () => {
    const sourceSecondary: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const source = { ...createGem('s', 'flat_life', 3, 'epic'), secondary: sourceSecondary };
    const target = createGem('t', 'flat_physical', 5, 'rare');

    const r1 = resolveTransplant({ target, source, rng: new SeededRNG(1001).fork('transplant_t_s') });
    const r2 = resolveTransplant({ target, source, rng: new SeededRNG(1001).fork('transplant_t_s') });
    expect(r1.affixId).toBe(r2.affixId);
  });

  it('different seeds can produce different results over many trials', () => {
    const sourceSecondary: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const source = { ...createGem('s', 'flat_life', 3, 'epic'), secondary: sourceSecondary };
    const target = createGem('t', 'flat_physical', 5, 'rare');

    const results = new Set<string>();
    for (let seed = 1; seed <= 32; seed++) {
      const slot = resolveTransplant({ target, source, rng: new SeededRNG(seed).fork('transplant_t_s') });
      results.add(slot.affixId);
    }
    expect(results.size).toBeGreaterThan(1);
  });
});
