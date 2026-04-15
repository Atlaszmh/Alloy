import { describe, it, expect } from 'vitest';
import { generatePool } from '../src/pool/pool-generator.js';
import { loadAndValidateData } from '../src/data/index.js';
import { DataRegistry } from '../src/data/registry.js';

describe('generatePool uses balance.json scaling in run mode', () => {
  const data = loadAndValidateData();
  const registry = new DataRegistry(
    data.affixes, data.combinations, data.synergies, data.baseItems, data.balance,
  );
  const balancePoolScaling = data.balance.gem.poolScaling;

  it('round 3 pool size matches balance.json bracket, not hardcoded default', () => {
    const pool = generatePool(42, 'run_async', registry, 3);
    const expected = balancePoolScaling.find(
      (e: { roundRange: [number, number] }) => 3 >= e.roundRange[0] && 3 <= e.roundRange[1],
    );
    expect(pool.length).toBe(expected!.poolSize);
  });

  it('round 9 pool size matches balance.json bracket', () => {
    const pool = generatePool(42, 'run_async', registry, 9);
    const expected = balancePoolScaling.find(
      (e: { roundRange: [number, number] }) => 9 >= e.roundRange[0] && 9 <= e.roundRange[1],
    );
    expect(pool.length).toBe(expected!.poolSize);
  });
});
