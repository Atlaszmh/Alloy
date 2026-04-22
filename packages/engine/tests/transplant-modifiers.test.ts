import { describe, it, expect } from 'vitest';
import { chooseAffixModifier } from '../src/forge/transplant/modifiers/choose-affix.js';
import type { TransplantContext } from '../src/forge/transplant/types.js';
import { createGem } from '../src/types/gem.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';

function makeCtx(partial: Partial<TransplantContext> = {}): TransplantContext {
  const rng = new SeededRNG(7);
  return {
    target: createGem('tgt', 'flat_physical', 5, 'rare'),
    source: createGem('src', 'flat_life', 4, 'epic'),
    rng,
    ...partial,
  };
}

describe('chooseAffixModifier', () => {
  it('passes ctx through unchanged when chosenAffix is not set', () => {
    const ctx = makeCtx();
    const result = chooseAffixModifier.apply(ctx);
    expect(result).toBe(ctx);
  });

  it('passes ctx through unchanged when chosenAffix is set (resolver handles it)', () => {
    const ctx = makeCtx({ chosenAffix: 'primary' });
    const result = chooseAffixModifier.apply(ctx);
    expect(result).toBe(ctx);
  });
});
