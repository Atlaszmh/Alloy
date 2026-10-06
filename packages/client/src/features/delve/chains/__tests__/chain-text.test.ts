import { describe, it, expect } from 'vitest';
import { damageShift } from '../chain-text';
import { KIND_HINT, kindHint } from '../MoveEditor';

describe('kindHint', () => {
  it("a hold's line follows the toggle", () => {
    expect(kindHint('hold', false)).toBe(KIND_HINT.hold);
    expect(kindHint('hold', true)).toBe(
      'Press the button to charge it, press it again to let go: a quick pair is a medium hit, a full charge beyond heavy.',
    );
    expect(kindHint('heavy', true)).toBe(KIND_HINT.heavy);
  });
});

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
