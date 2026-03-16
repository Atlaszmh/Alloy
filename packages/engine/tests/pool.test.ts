import { describe, it, expect } from 'vitest';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { generatePool } from '../src/pool/pool-generator.js';
import {
  validateArchetypes,
  countArchetypeOrbs,
  ARCHETYPE_TAGS,
} from '../src/pool/archetype-validator.js';

const data = loadAndValidateData();
const registry = new DataRegistry(
  data.affixes,
  data.combinations,
  data.synergies,
  data.baseItems,
  data.balance,
);
const balance = registry.getBalance();

describe('Pool Generator', () => {
  it('should be deterministic (same seed produces same pool)', () => {
    const pool1 = generatePool(42, 'ranked', registry);
    const pool2 = generatePool(42, 'ranked', registry);
    expect(pool1).toEqual(pool2);
  });

  it('should produce round 1 pool matching draftPoolPerRound[0]', () => {
    const pool = generatePool(123, 'ranked', registry, 1);
    expect(pool.length).toBe(balance.draftPoolPerRound[0]);
  });

  it('should produce pool within configured range for quick mode', () => {
    const pool = generatePool(123, 'quick', registry);
    expect(pool.length).toBeGreaterThanOrEqual(balance.draftPoolSizeQuick.min);
    expect(pool.length).toBeLessThanOrEqual(balance.draftPoolSizeQuick.max);
  });

  it('should produce round 2 pool matching draftPoolPerRound[1]', () => {
    const pool = generatePool(123, 'ranked', registry, 2);
    expect(pool.length).toBe(balance.draftPoolPerRound[1]);
  });

  it('should produce round 3 pool matching draftPoolPerRound[2]', () => {
    const pool = generatePool(123, 'ranked', registry, 3);
    expect(pool.length).toBe(balance.draftPoolPerRound[2]);
  });

  it('should produce different pools for different rounds from same seed', () => {
    const pool1 = generatePool(42, 'ranked', registry, 1);
    const pool2 = generatePool(42, 'ranked', registry, 2);
    // Different RNG forks should produce different pools
    const uids1 = pool1.map(o => o.affixId).join(',');
    const uids2 = pool2.map(o => o.affixId).join(',');
    expect(uids1).not.toBe(uids2);
  });

  it('should have tier distribution roughly matching targets', () => {
    // Use a large pool (ranked) for better statistical accuracy
    const pool = generatePool(999, 'ranked', registry);
    const tierCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const orb of pool) {
      tierCounts[orb.tier]++;
    }

    const total = pool.length;
    // Allow generous tolerance (within 20 percentage points of target)
    const tolerance = 0.20;
    for (const tier of [1, 2, 3, 4] as const) {
      const actual = tierCounts[tier] / total;
      const target = balance.tierDistribution[tier];
      expect(Math.abs(actual - target)).toBeLessThan(tolerance);
    }
  });

  it('should have at least 3 viable archetypes', () => {
    const pool = generatePool(42, 'ranked', registry);
    const valid = validateArchetypes(pool, registry, balance.archetypeMinOrbs, 3);
    expect(valid).toBe(true);
  });

  it('should have at least 2 trigger orbs', () => {
    const pool = generatePool(42, 'ranked', registry);
    let triggerCount = 0;
    for (const orb of pool) {
      const affix = registry.findAffix(orb.affixId);
      if (affix && affix.category === 'trigger') {
        triggerCount++;
      }
    }
    expect(triggerCount).toBeGreaterThanOrEqual(2);
  });

  it('should produce different pools for different seeds', () => {
    const pool1 = generatePool(1, 'ranked', registry, 1);
    const pool2 = generatePool(100, 'ranked', registry, 1);
    // R1 pools (16 orbs) with very different seeds should differ
    const ids1 = pool1.map((o) => o.affixId).join(',');
    const ids2 = pool2.map((o) => o.affixId).join(',');
    expect(ids1).not.toBe(ids2);
  });

  it('should produce valid pools for 100 random seeds', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const pool = generatePool(seed, 'ranked', registry, 1);

      // Pool size matches round 1 config
      expect(pool.length).toBe(balance.draftPoolPerRound[0]);

      // All UIDs unique
      const uids = new Set(pool.map((o) => o.uid));
      expect(uids.size).toBe(pool.length);

      // All orbs have valid affix IDs
      for (const orb of pool) {
        expect(registry.findAffix(orb.affixId)).toBeDefined();
      }
    }
  });

  it('should produce valid R1 pool with archetypes and triggers for seed 42', () => {
    const pool = generatePool(42, 'ranked', registry, 1);

    // R1 pool should have archetype validation and trigger guarantees
    const valid = validateArchetypes(pool, registry, balance.archetypeMinOrbs, 3);
    expect(valid).toBe(true);

    let triggerCount = 0;
    for (const orb of pool) {
      const affix = registry.findAffix(orb.affixId);
      if (affix && affix.category === 'trigger') triggerCount++;
    }
    expect(triggerCount).toBeGreaterThanOrEqual(2);
  });
});

describe('Archetype Validator', () => {
  it('should count archetype orbs correctly', () => {
    const pool = generatePool(42, 'ranked', registry);
    const counts = countArchetypeOrbs(pool, registry);

    // All archetypes should have non-negative counts
    for (const arch of Object.keys(ARCHETYPE_TAGS)) {
      expect(counts[arch as keyof typeof counts]).toBeGreaterThanOrEqual(0);
    }
  });

  it('should reject a pool with no orbs', () => {
    const valid = validateArchetypes([], registry, balance.archetypeMinOrbs, 3);
    expect(valid).toBe(false);
  });
});
