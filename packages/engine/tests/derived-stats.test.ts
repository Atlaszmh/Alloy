import { describe, it, expect } from 'vitest';
import { createEmptyDerivedStats } from '../src/types/derived-stats.js';

describe('createEmptyDerivedStats', () => {
  it('returns integer-scale defaults', () => {
    const s = createEmptyDerivedStats();
    expect(s.armor).toBe(0);
    expect(s.critChance).toBe(0);
    expect(s.dodgeChance).toBe(0);
    expect(s.blockChance).toBe(0);
    expect(s.lifestealPercent).toBe(0);
    expect(s.armorPenetration).toBe(0);
    expect(s.elementalPenetration).toBe(0);
    expect(s.resistances.fire).toBe(0);
    expect(s.resistances.shadow).toBe(0);
    expect(s.resistances.chaos).toBe(0);
    expect(s.attackInterval).toBe(30);
    expect(s.critMultiplier).toBe(150); // 150 = 1.5x, integer scale
    expect(s.dotMultiplier).toBe(100); // 100 = 1.0x baseline
    expect(s.maxHP).toBe(0);
    expect(s.blockAmount).toBe(0);
  });
});
