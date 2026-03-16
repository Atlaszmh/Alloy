import { createDraftState, makePick, autoPickRandom } from '../src/draft/draft-state.js';
import type { DraftState } from '../src/draft/draft-state.js';
import type { OrbInstance } from '../src/types/orb.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';

/** Helper: create a pool of N dummy orbs. */
function makePool(n: number): OrbInstance[] {
  return Array.from({ length: n }, (_, i) => ({
    uid: `orb-${i}`,
    affixId: `affix-${i % 5}`,
    tier: (((i % 3) + 1) as 1 | 2 | 3),
  }));
}

describe('Draft System', () => {
  // --- createDraftState ---

  it('createDraftState initializes correctly', () => {
    const pool = makePool(6);
    const state = createDraftState(pool);

    expect(state.pool).toHaveLength(6);
    expect(state.stockpiles[0]).toHaveLength(0);
    expect(state.stockpiles[1]).toHaveLength(0);
    expect(state.pickIndex).toBe(0);
    expect(state.activePlayer).toBe(0);
    expect(state.maxPicks).toBe(6);
    expect(state.isComplete).toBe(false);
  });

  it('createDraftState copies the pool (no shared references)', () => {
    const pool = makePool(4);
    const state = createDraftState(pool);

    pool.push({ uid: 'extra', affixId: 'affix-0', tier: 1 });
    expect(state.pool).toHaveLength(4);
  });

  // --- Valid pick ---

  it('valid pick removes orb from pool and adds to correct stockpile', () => {
    const state = createDraftState(makePool(4));
    const result = makePick(state, 'orb-0', 0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.pool).toHaveLength(3);
    expect(result.state.pool.find((o) => o.uid === 'orb-0')).toBeUndefined();
    expect(result.state.stockpiles[0]).toHaveLength(1);
    expect(result.state.stockpiles[0][0]!.uid).toBe('orb-0');
    expect(result.state.stockpiles[1]).toHaveLength(0);
  });

  // --- Invalid picks ---

  it('rejects pick when it is not the player\'s turn', () => {
    const state = createDraftState(makePool(4));
    const result = makePick(state, 'orb-0', 1);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Not player 1');
  });

  it('rejects pick when orb is not in pool', () => {
    const state = createDraftState(makePool(4));
    const result = makePick(state, 'orb-999', 0);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('not in the draft pool');
  });

  it('rejects pick when draft is already complete', () => {
    // Create a draft with 2 orbs, pick them both, then try one more
    let state = createDraftState(makePool(2));

    const r1 = makePick(state, 'orb-0', 0);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    state = r1.state;

    const r2 = makePick(state, 'orb-1', 1);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    state = r2.state;

    expect(state.isComplete).toBe(true);

    const r3 = makePick(state, 'orb-0', 0);
    expect(r3.ok).toBe(false);
    if (r3.ok) return;
    expect(r3.error).toContain('already complete');
  });

  // --- Turn alternation ---

  it('players alternate turns correctly', () => {
    let state = createDraftState(makePool(6));
    const expectedPlayers: Array<0 | 1> = [0, 1, 0, 1, 0, 1];

    for (let i = 0; i < 6; i++) {
      expect(state.activePlayer).toBe(expectedPlayers[i]);
      const result = makePick(state, `orb-${i}`, expectedPlayers[i]!);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.state;
    }
  });

  // --- Draft completion ---

  it('draft completes when all orbs are picked', () => {
    let state = createDraftState(makePool(4));

    for (let i = 0; i < 4; i++) {
      const player = (i % 2) as 0 | 1;
      const result = makePick(state, `orb-${i}`, player);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.state;
    }

    expect(state.isComplete).toBe(true);
    expect(state.pool).toHaveLength(0);
    expect(state.pickIndex).toBe(4);
  });

  // --- autoPickRandom ---

  it('autoPickRandom picks a valid orb', () => {
    const state = createDraftState(makePool(6));
    const rng = new SeededRNG(42);

    const result = autoPickRandom(state, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.pool).toHaveLength(5);
    expect(result.state.stockpiles[0]).toHaveLength(1);
    // The picked orb should no longer be in the pool
    const pickedUid = result.state.stockpiles[0][0]!.uid;
    expect(result.state.pool.find((o) => o.uid === pickedUid)).toBeUndefined();
  });

  it('autoPickRandom is deterministic with same RNG seed', () => {
    const pool = makePool(10);
    const state = createDraftState(pool);

    const rng1 = new SeededRNG(123);
    const rng2 = new SeededRNG(123);

    const result1 = autoPickRandom(state, rng1);
    const result2 = autoPickRandom(state, rng2);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (!result1.ok || !result2.ok) return;

    expect(result1.state.stockpiles[0][0]!.uid).toBe(
      result2.state.stockpiles[0][0]!.uid,
    );
  });

  // --- Full draft simulation ---

  it('full draft: alternate picks until complete, all orbs distributed', () => {
    const poolSize = 20;
    const pool = makePool(poolSize);
    let state = createDraftState(pool);

    for (let i = 0; i < poolSize; i++) {
      expect(state.isComplete).toBe(false);
      const player = (i % 2) as 0 | 1;
      const orbUid = state.pool[0]!.uid; // always pick the first remaining orb
      const result = makePick(state, orbUid, player);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.state;
    }

    expect(state.isComplete).toBe(true);
    expect(state.pool).toHaveLength(0);
    expect(state.stockpiles[0]).toHaveLength(poolSize / 2);
    expect(state.stockpiles[1]).toHaveLength(poolSize / 2);

    // Every original orb should appear exactly once across both stockpiles
    const allDrafted = [...state.stockpiles[0], ...state.stockpiles[1]];
    const draftedUids = allDrafted.map((o) => o.uid).sort();
    const originalUids = pool.map((o) => o.uid).sort();
    expect(draftedUids).toEqual(originalUids);
  });

  // --- Immutability ---

  it('makePick does not mutate the original state', () => {
    const state = createDraftState(makePool(4));
    const originalPool = [...state.pool];

    const result = makePick(state, 'orb-0', 0);
    expect(result.ok).toBe(true);

    // Original state should be unchanged
    expect(state.pool).toEqual(originalPool);
    expect(state.stockpiles[0]).toHaveLength(0);
    expect(state.pickIndex).toBe(0);
  });
});
