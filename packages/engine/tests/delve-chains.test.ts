import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import { CHAIN_SKILLS, MAX_CHAIN, MOVE_KINDS } from '../src/types/ability.js';
import { bal } from './fixtures/arena.js';

// See the moves and chains spec.

describe('balance: delve.chains', () => {
  it('loads the chain numbers', () => {
    expect(bal.chains).toEqual({
      cap: { basic: 5, primary: 5, defensive: 5, ultimate: 5 },
      kindWeight: { light: -1, medium: 0, heavy: 1 },
      holdStageWeight: [0, 1, 2],
      holdTime: 1,
      holdMax: 2,
      holdStages: [0.33, 0.66],
      stepBonus: 0.1,
    });
    expect(bal.stacks.basicByKind).toEqual({ light: 1, medium: 1, heavy: 2, hold: 2 });
    expect(MOVE_KINDS).toEqual(['light', 'medium', 'heavy', 'hold']);
    expect(CHAIN_SKILLS).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
    expect(MAX_CHAIN).toBe(5);
  });

  it('refuses a cap outside 1..MAX_CHAIN, a weight off the tables, stages out of order and a holdMax under holdTime', () => {
    const parses = (chains: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: { ...balanceData.delve, chains: { ...balanceData.delve.chains, ...chains } },
      }).success;
    const cap = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
    expect(parses({})).toBe(true);
    expect(parses({ cap: { ...cap, basic: 0 } })).toBe(false);
    expect(parses({ cap: { ...cap, ultimate: MAX_CHAIN + 1 } })).toBe(false);
    expect(parses({ kindWeight: { light: -3, medium: 0, heavy: 1 } })).toBe(false);
    expect(parses({ holdStageWeight: [0, 1] })).toBe(false);
    expect(parses({ holdStages: [0.66, 0.33] })).toBe(false);
    expect(parses({ holdMax: 0.5 })).toBe(false);
  });
});
