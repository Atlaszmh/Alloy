import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import { bal } from './fixtures/arena.js';

// See the elemental stacks spec. The fixture arena's hero stands at (13, 36); `dummy(x, y)` is
// a sturdy Fire foe (it resists fire) that doesn't fight back.

describe('balance: delve.stacks', () => {
  it('loads the stack numbers', () => {
    expect(bal.stacks).toEqual({
      cap: 5,
      duration: { fire: 3, frost: 3, storm: 4, earth: 2, shadow: 6, nature: 4 },
      byWeight: [1, 1, 2, 3, 3],
      basicBlow: 1,
      basicFinisher: 2,
      tick: 1,
      curve: [1, 1.8, 2.45, 3, 3.5],
      freezeAt: 3,
      firePerStack: 0.35,
      frostSlowPerStack: 0.2,
      frostSlowCap: 0.6,
      shockPerStack: 0.08,
      hexPerStack: 0.06,
      poisonPerStack: 1.7,
      reactionLockout: 1,
    });
  });

  it('refuses a cap under 1, a weight list not five long, a one-step curve and a slow cap over 1', () => {
    const parses = (stacks: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: { ...balanceData.delve, stacks: { ...balanceData.delve.stacks, ...stacks } },
      }).success;
    expect(parses({})).toBe(true);
    expect(parses({ cap: 0 })).toBe(false);
    expect(parses({ byWeight: [1, 2, 3] })).toBe(false);
    expect(parses({ curve: [1] })).toBe(false);
    expect(parses({ frostSlowCap: 1.5 })).toBe(false);
  });
});
