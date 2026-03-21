/**
 * Regression tests for Draft P0 acceptance criteria.
 * See: docs/superpowers/specs/2026-03-20-draft-screen-acceptance-criteria.md
 */
import { describe, it, expect } from 'vitest';
import { createDraftState, makePick, autoPickRandom } from '../src/draft/draft-state.js';
import type { OrbInstance } from '../src/types/orb.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { generatePool } from '../src/pool/pool-generator.js';
import { AI_CONFIGS, type AITier } from '../src/types/ai.js';

// --- Shared fixtures ---

const data = loadAndValidateData();
const registry = new DataRegistry(
  data.affixes,
  data.combinations,
  data.synergies,
  data.baseItems,
  data.balance,
);
const balance = registry.getBalance();

/** Helper: create a pool of N dummy orbs. */
function makePool(n: number): OrbInstance[] {
  return Array.from({ length: n }, (_, i) => ({
    uid: `orb-${i}`,
    affixId: `affix-${i % 5}`,
    tier: (((i % 3) + 1) as 1 | 2 | 3),
  }));
}

// ---------------------------------------------------------------------------
// AC-D06: Auto-pick uses random selection (not pool[0])
// ---------------------------------------------------------------------------
describe('AC-D06: autoPickRandom uses random selection', () => {
  it('different RNG seeds produce different picks from a large pool', () => {
    const pool = makePool(24);
    const state = createDraftState(pool);

    const pickedUids = new Set<string>();
    // Use 20 different seeds; with 24 orbs we should see more than one unique pick
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new SeededRNG(seed);
      const result = autoPickRandom(state, rng);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      pickedUids.add(result.state.stockpiles[0][0]!.uid);
    }

    // If it always picked pool[0], the set would have size 1
    expect(pickedUids.size).toBeGreaterThan(1);
  });

  it('picked orb is removed from pool and added to active player stockpile', () => {
    const state = createDraftState(makePool(10));
    const rng = new SeededRNG(77);

    const result = autoPickRandom(state, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Pool shrinks by 1
    expect(result.state.pool).toHaveLength(9);

    // Active player (0) gets the orb
    expect(result.state.stockpiles[0]).toHaveLength(1);
    const pickedUid = result.state.stockpiles[0][0]!.uid;

    // Orb no longer in pool
    expect(result.state.pool.find((o) => o.uid === pickedUid)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AC-D08: Pick validation rejects invalid picks
// ---------------------------------------------------------------------------
describe('AC-D08: pick validation rejects invalid picks', () => {
  it('rejects pick from wrong player', () => {
    const state = createDraftState(makePool(6));
    // Active player is 0; try to pick as player 1
    const result = makePick(state, 'orb-0', 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Not player 1');
  });

  it('rejects pick of orb not in pool', () => {
    const state = createDraftState(makePool(6));
    const result = makePick(state, 'orb-nonexistent', 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('not in the draft pool');
  });

  it('rejects pick when draft is already complete', () => {
    let state = createDraftState(makePool(2));

    // Exhaust the draft
    const r1 = makePick(state, 'orb-0', 0);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    state = r1.state;

    const r2 = makePick(state, 'orb-1', 1);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    state = r2.state;

    expect(state.isComplete).toBe(true);

    // Try another pick
    const r3 = makePick(state, 'orb-0', 0);
    expect(r3.ok).toBe(false);
    if (r3.ok) return;
    expect(r3.error).toContain('already complete');
  });

  it('accepts a valid pick', () => {
    const state = createDraftState(makePool(6));
    const result = makePick(state, 'orb-0', 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.pool).toHaveLength(5);
    expect(result.state.stockpiles[0]).toHaveLength(1);
    expect(result.state.stockpiles[0][0]!.uid).toBe('orb-0');
  });
});

// ---------------------------------------------------------------------------
// AC-D10: Pool sizes match [24, 12, 12] config
// ---------------------------------------------------------------------------
describe('AC-D10: pool sizes match config', () => {
  it('balance.json has draftPoolPerRound = [24, 12, 12]', () => {
    expect(balance.draftPoolPerRound).toEqual([24, 12, 12]);
  });

  it('balance.json has draftPicksPerPlayer = [8, 4, 4]', () => {
    expect(balance.draftPicksPerPlayer).toEqual([8, 4, 4]);
  });

  it('round 1 pool has 24 orbs', () => {
    const pool = generatePool(42, 'ranked', registry, 1);
    expect(pool).toHaveLength(24);
  });

  it('round 2 pool has 12 orbs', () => {
    const pool = generatePool(42, 'ranked', registry, 2);
    expect(pool).toHaveLength(12);
  });

  it('round 3 pool has 12 orbs', () => {
    const pool = generatePool(42, 'ranked', registry, 3);
    expect(pool).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// AC-D11: AI_CONFIGS has correct tier-based delays
// ---------------------------------------------------------------------------
describe('AC-D11: AI_CONFIGS tier-based delays', () => {
  const tiers: AITier[] = [1, 2, 3, 4, 5];

  it('has entries for all tiers 1-5', () => {
    for (const tier of tiers) {
      expect(AI_CONFIGS[tier]).toBeDefined();
      expect(AI_CONFIGS[tier].tier).toBe(tier);
    }
  });

  it('all delays are positive numbers', () => {
    for (const tier of tiers) {
      expect(AI_CONFIGS[tier].thinkingDelayMs).toBeGreaterThan(0);
    }
  });

  it('delays increase with tier (tier 5 > tier 4 > ... > tier 1)', () => {
    for (let i = 1; i < tiers.length; i++) {
      const lower = tiers[i - 1]!;
      const higher = tiers[i]!;
      expect(AI_CONFIGS[higher].thinkingDelayMs).toBeGreaterThan(
        AI_CONFIGS[lower].thinkingDelayMs,
      );
    }
  });
});
