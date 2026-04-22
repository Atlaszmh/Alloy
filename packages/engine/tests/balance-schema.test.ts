import { describe, it, expect } from 'vitest';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import balanceData from '../src/data/balance.json';

describe('balance schema — transplant section', () => {
  it('parses balance.json including new transplant section', () => {
    const parsed = BalanceConfigSchema.parse(balanceData);
    expect(parsed.transplant.unlockThreshold).toBe(6);
    expect(parsed.transplant.secondaryValueScalar).toBe(1.0);
  });

  it('includes new gem.flux.costs entries for transplant', () => {
    const parsed = BalanceConfigSchema.parse(balanceData);
    expect(parsed.gem.flux.costs.transplantGem).toBe(0);
    expect(parsed.gem.flux.costs.transplantChooseAffix).toBe(3);
  });
});
