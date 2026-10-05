import { describe, it, expect } from 'vitest';
import { damageShift } from '../chain-text';

describe('damageShift', () => {
  it("says what an option does to the chain's damage a second, rounded to a percent", () => {
    expect(damageShift(100, 108.4)).toBe('+8% chain damage a second');
    expect(damageShift(100, 96.6)).toBe('−3% chain damage a second');
    expect(damageShift(100, 100.3)).toBe('Chain damage a second unchanged');
  });
  it('says nothing when either side is unknown or the chain deals none', () => {
    expect(damageShift(null, 5)).toBeNull();
    expect(damageShift(5, null)).toBeNull();
    expect(damageShift(0, 5)).toBeNull();
  });
});
