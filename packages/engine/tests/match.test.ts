import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { createMatch, applyAction } from '../src/match/match-controller.js';
import { getNextPhase, getNextPhaseQuick, isValidTransition } from '../src/match/phase-machine.js';
import { autoPickRandom } from '../src/draft/draft-state.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { MatchState, MatchPhase } from '../src/types/match.js';
import type { GameAction } from '../src/types/game-action.js';
import type { DuelResult } from '../src/types/combat.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);

describe('Phase Machine', () => {
  it('transitions draft(1) -> forge(1)', () => {
    const phase: MatchPhase = { kind: 'draft', round: 1, pickIndex: 0, activePlayer: 0 };
    const next = getNextPhase(phase, []);
    expect(next).toEqual({ kind: 'forge', round: 1 });
  });

  it('transitions forge(1) -> duel(1)', () => {
    const phase: MatchPhase = { kind: 'forge', round: 1 };
    const next = getNextPhase(phase, []);
    expect(next).toEqual({ kind: 'duel', round: 1 });
  });

  it('transitions duel(1) -> draft(2) when no winner yet', () => {
    const results: DuelResult[] = [
      { round: 1, winner: 0, finalHP: [50, 0], tickCount: 100, duration: 10, wasTiebreak: false },
    ];
    const phase: MatchPhase = { kind: 'duel', round: 1 };
    const next = getNextPhase(phase, results);
    expect(next).toEqual({ kind: 'draft', round: 2, pickIndex: 0, activePlayer: 0 });
  });

  it('transitions duel(2) -> draft(3) when tied 1-1', () => {
    const results: DuelResult[] = [
      { round: 1, winner: 0, finalHP: [50, 0], tickCount: 100, duration: 10, wasTiebreak: false },
      { round: 2, winner: 1, finalHP: [0, 50], tickCount: 100, duration: 10, wasTiebreak: false },
    ];
    const phase: MatchPhase = { kind: 'duel', round: 2 };
    const next = getNextPhase(phase, results);
    expect(next).toEqual({ kind: 'draft', round: 3, pickIndex: 0, activePlayer: 0 });
  });

  it('transitions duel(2) -> complete when 2-0', () => {
    const results: DuelResult[] = [
      { round: 1, winner: 0, finalHP: [50, 0], tickCount: 100, duration: 10, wasTiebreak: false },
      { round: 2, winner: 0, finalHP: [50, 0], tickCount: 100, duration: 10, wasTiebreak: false },
    ];
    const phase: MatchPhase = { kind: 'duel', round: 2 };
    const next = getNextPhase(phase, results);
    expect(next.kind).toBe('complete');
    if (next.kind === 'complete') {
      expect(next.winner).toBe(0);
      expect(next.scores).toEqual([2, 0]);
    }
  });

  it('transitions duel(3) -> complete', () => {
    const results: DuelResult[] = [
      { round: 1, winner: 0, finalHP: [50, 0], tickCount: 100, duration: 10, wasTiebreak: false },
      { round: 2, winner: 1, finalHP: [0, 50], tickCount: 100, duration: 10, wasTiebreak: false },
      { round: 3, winner: 1, finalHP: [0, 50], tickCount: 100, duration: 10, wasTiebreak: false },
    ];
    const phase: MatchPhase = { kind: 'duel', round: 3 };
    const next = getNextPhase(phase, results);
    expect(next.kind).toBe('complete');
    if (next.kind === 'complete') {
      expect(next.winner).toBe(1);
      expect(next.scores).toEqual([1, 2]);
    }
  });

  it('quick match: duel(1) -> complete', () => {
    const results: DuelResult[] = [
      { round: 1, winner: 0, finalHP: [50, 0], tickCount: 100, duration: 10, wasTiebreak: false },
    ];
    const phase: MatchPhase = { kind: 'duel', round: 1 };
    const next = getNextPhaseQuick(phase, results);
    expect(next.kind).toBe('complete');
    if (next.kind === 'complete') {
      expect(next.winner).toBe(0);
    }
  });

  it('validates transitions correctly', () => {
    expect(isValidTransition(
      { kind: 'draft', round: 1, pickIndex: 0, activePlayer: 0 },
      { kind: 'forge', round: 1 },
    )).toBe(true);

    expect(isValidTransition(
      { kind: 'forge', round: 1 },
      { kind: 'duel', round: 1 },
    )).toBe(true);

    expect(isValidTransition(
      { kind: 'duel', round: 1 },
      { kind: 'draft', round: 2, pickIndex: 0, activePlayer: 0 },
    )).toBe(true);

    expect(isValidTransition(
      { kind: 'forge', round: 1 },
      { kind: 'forge', round: 2 },
    )).toBe(false);

    expect(isValidTransition(
      { kind: 'draft', round: 1, pickIndex: 0, activePlayer: 0 },
      { kind: 'duel', round: 1 },
    )).toBe(false);

    expect(isValidTransition(
      { kind: 'complete', winner: 0, scores: [2, 0] },
      { kind: 'forge', round: 1 },
    )).toBe(false);
  });
});

describe('Match Controller', () => {
  const SEED = 42;
  const BASE_WEAPON = 'sword';
  const BASE_ARMOR = 'chainmail';

  function makeMatch(mode: 'quick' | 'unranked' | 'ranked' = 'unranked'): MatchState {
    return createMatch('test-match', SEED, mode, ['player1', 'player2'], BASE_WEAPON, BASE_ARMOR, registry);
  }

  // 1. createMatch initializes correctly
  it('createMatch initializes with draft phase, pool, and empty stockpiles', () => {
    const state = makeMatch();

    expect(state.phase.kind).toBe('draft');
    if (state.phase.kind === 'draft') {
      expect(state.phase.pickIndex).toBe(0);
      expect(state.phase.activePlayer).toBe(0);
    }
    expect(state.pool.length).toBeGreaterThan(0);
    expect(state.players[0].stockpile).toEqual([]);
    expect(state.players[1].stockpile).toEqual([]);
    expect(state.players[0].id).toBe('player1');
    expect(state.players[1].id).toBe('player2');
    expect(state.roundResults).toEqual([]);
    expect(state.duelLogs).toEqual([]);
    expect(state.matchId).toBe('test-match');
    expect(state.seed).toBe(SEED);
    expect(state.mode).toBe('unranked');
  });

  // 2. Draft pick works
  it('draft pick moves orb from pool to player stockpile', () => {
    const state = makeMatch();
    const orbUid = state.pool[0].uid;

    const result = applyAction(state, { kind: 'draft_pick', player: 0, orbUid }, registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.players[0].stockpile.length).toBe(1);
    expect(result.state.players[0].stockpile[0].uid).toBe(orbUid);
    expect(result.state.pool.length).toBe(state.pool.length - 1);
    expect(result.state.pool.find(o => o.uid === orbUid)).toBeUndefined();
  });

  // 3. Invalid draft pick returns error
  it('draft pick by wrong player returns error', () => {
    const state = makeMatch();
    const orbUid = state.pool[0].uid;

    // Player 0 is active first, so player 1 picking should fail
    const result = applyAction(state, { kind: 'draft_pick', player: 1, orbUid }, registry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  // 4. Full draft completes and transitions to forge
  it('full draft completes and transitions to forge phase', () => {
    let state = makeMatch();
    const totalOrbs = state.pool.length;

    // Draft all orbs using alternating picks
    for (let i = 0; i < totalOrbs; i++) {
      if (state.phase.kind !== 'draft') break;
      const orbUid = state.pool[0].uid;
      const player = state.phase.activePlayer;
      const result = applyAction(state, { kind: 'draft_pick', player, orbUid }, registry);
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    }

    expect(state.phase.kind).toBe('forge');
    if (state.phase.kind === 'forge') {
      expect(state.phase.round).toBe(1);
    }
    expect(state.pool.length).toBe(0);
    expect(state.players[0].stockpile.length + state.players[1].stockpile.length).toBe(totalOrbs);
    // Forge flux should be initialized
    expect(state.forgeFlux).toBeDefined();
    expect(state.forgeComplete).toEqual([false, false]);
  });

  // 5. Forge action works
  it('forge action applies correctly through match controller', () => {
    let state = draftAll(makeMatch());
    expect(state.phase.kind).toBe('forge');

    // Player 0 assigns an orb if they have any
    if (state.players[0].stockpile.length > 0) {
      const orb = state.players[0].stockpile[0];
      const result = applyAction(state, {
        kind: 'forge_action',
        player: 0,
        action: { kind: 'assign_orb', orbUid: orb.uid, target: 'weapon', slotIndex: 0 },
      }, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        state = result.state;
        // Orb should be removed from stockpile and placed in loadout
        expect(state.players[0].stockpile.find(o => o.uid === orb.uid)).toBeUndefined();
        expect(state.players[0].loadout.weapon.slots[0]).not.toBeNull();
      }
    }
  });

  // 6. Forge complete from both players advances to duel
  it('forge complete from both players advances to duel phase', () => {
    let state = draftAll(makeMatch());
    expect(state.phase.kind).toBe('forge');

    // Player 0 completes
    let result = applyAction(state, { kind: 'forge_complete', player: 0 }, registry);
    expect(result.ok).toBe(true);
    if (result.ok) state = result.state;
    expect(state.phase.kind).toBe('forge'); // Still forge, waiting for player 1

    // Player 1 completes
    result = applyAction(state, { kind: 'forge_complete', player: 1 }, registry);
    expect(result.ok).toBe(true);
    if (result.ok) state = result.state;
    expect(state.phase.kind).toBe('duel');
    if (state.phase.kind === 'duel') {
      expect(state.phase.round).toBe(1);
    }
  });

  // 7. Advance phase (duel) runs simulation and stores result
  it('advance_phase in duel runs simulation and stores result', () => {
    let state = draftAll(makeMatch());
    state = completeForgeBothPlayers(state);
    expect(state.phase.kind).toBe('duel');

    const result = applyAction(state, { kind: 'advance_phase' }, registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    state = result.state;
    expect(state.roundResults.length).toBe(1);
    expect(state.duelLogs.length).toBe(1);
    expect(state.roundResults[0].round).toBe(1);
    expect([0, 1]).toContain(state.roundResults[0].winner);
    // Should advance to draft round 2
    expect(state.phase.kind).toBe('draft');
    if (state.phase.kind === 'draft') {
      expect(state.phase.round).toBe(2);
    }
  });

  // 8. Full match integration
  it('full match runs through all phases to completion', () => {
    let state = makeMatch();

    // Draft
    state = draftAll(state);
    expect(state.phase.kind).toBe('forge');

    // Forge round 1: set base stats, assign a couple orbs, then complete
    state = doSimpleForge(state, 0);
    state = doSimpleForge(state, 1);
    state = completeForgeBothPlayers(state);
    expect(state.phase.kind).toBe('duel');

    // Duel round 1
    let result = applyAction(state, { kind: 'advance_phase' }, registry);
    expect(result.ok).toBe(true);
    if (result.ok) state = result.state;
    expect(state.roundResults.length).toBe(1);

    if (state.phase.kind === 'complete') {
      // Shouldn't happen after 1 round in non-quick mode, but handle edge case
      return;
    }

    // Draft round 2
    expect(state.phase.kind).toBe('draft');
    if (state.phase.kind === 'draft') {
      expect(state.phase.round).toBe(2);
    }
    state = draftAll(state);

    // Forge round 2
    expect(state.phase.kind).toBe('forge');
    state = completeForgeBothPlayers(state);
    expect(state.phase.kind).toBe('duel');

    // Duel round 2
    result = applyAction(state, { kind: 'advance_phase' }, registry);
    expect(result.ok).toBe(true);
    if (result.ok) state = result.state;
    expect(state.roundResults.length).toBe(2);

    // Check if match already concluded (2-0)
    if (state.phase.kind === 'complete') {
      expect(state.roundResults.length).toBe(2);
      if (state.phase.kind === 'complete') {
        expect([0, 1]).toContain(state.phase.winner);
        expect(state.phase.scores[0] + state.phase.scores[1]).toBe(2);
      }
      return;
    }

    // Draft round 3
    expect(state.phase.kind).toBe('draft');
    if (state.phase.kind === 'draft') {
      expect(state.phase.round).toBe(3);
    }
    state = draftAll(state);

    // Forge round 3
    expect(state.phase.kind).toBe('forge');
    state = completeForgeBothPlayers(state);
    expect(state.phase.kind).toBe('duel');

    // Duel round 3
    result = applyAction(state, { kind: 'advance_phase' }, registry);
    expect(result.ok).toBe(true);
    if (result.ok) state = result.state;
    expect(state.roundResults.length).toBe(3);
    expect(state.phase.kind).toBe('complete');
    if (state.phase.kind === 'complete') {
      expect([0, 1, 'draw']).toContain(state.phase.winner);
    }
  });

  // 9. Determinism: same seed + same actions = identical final state
  it('same seed and actions produce identical final state', () => {
    const state1 = runFullMatch(42);
    const state2 = runFullMatch(42);

    expect(state1.roundResults).toEqual(state2.roundResults);
    expect(state1.phase).toEqual(state2.phase);
    expect(state1.players[0].stockpile).toEqual(state2.players[0].stockpile);
    expect(state1.players[1].stockpile).toEqual(state2.players[1].stockpile);
    // Duel logs should match
    expect(state1.duelLogs.length).toBe(state2.duelLogs.length);
    for (let i = 0; i < state1.duelLogs.length; i++) {
      expect(state1.duelLogs[i].result).toEqual(state2.duelLogs[i].result);
    }
  });

  // 10. Quick match: single round flow
  it('quick match: draft -> forge -> duel -> complete', () => {
    let state = makeMatch('quick');

    // Draft
    state = draftAll(state);
    expect(state.phase.kind).toBe('forge');

    // Forge
    state = completeForgeBothPlayers(state);
    expect(state.phase.kind).toBe('duel');

    // Duel
    const result = applyAction(state, { kind: 'advance_phase' }, registry);
    expect(result.ok).toBe(true);
    if (result.ok) state = result.state;

    expect(state.phase.kind).toBe('complete');
    expect(state.roundResults.length).toBe(1);
    if (state.phase.kind === 'complete') {
      expect([0, 1]).toContain(state.phase.winner);
    }
  });

  // Error case tests
  it('forge_action during draft returns error', () => {
    const state = makeMatch();
    const result = applyAction(state, {
      kind: 'forge_action',
      player: 0,
      action: { kind: 'assign_orb', orbUid: 'fake', target: 'weapon', slotIndex: 0 },
    }, registry);
    expect(result.ok).toBe(false);
  });

  it('advance_phase during forge returns error', () => {
    let state = draftAll(makeMatch());
    const result = applyAction(state, { kind: 'advance_phase' }, registry);
    expect(result.ok).toBe(false);
  });

  it('forge_complete twice returns error', () => {
    let state = draftAll(makeMatch());

    let result = applyAction(state, { kind: 'forge_complete', player: 0 }, registry);
    expect(result.ok).toBe(true);
    if (result.ok) state = result.state;

    result = applyAction(state, { kind: 'forge_complete', player: 0 }, registry);
    expect(result.ok).toBe(false);
  });

  // --- Helper functions ---

  function draftAll(state: MatchState): MatchState {
    const totalOrbs = state.pool.length;
    for (let i = 0; i < totalOrbs; i++) {
      if (state.phase.kind !== 'draft') break;
      const orbUid = state.pool[0].uid;
      const player = state.phase.activePlayer;
      const result = applyAction(state, { kind: 'draft_pick', player, orbUid }, registry);
      if (result.ok) state = result.state;
    }
    return state;
  }

  function completeForgeBothPlayers(state: MatchState): MatchState {
    let result = applyAction(state, { kind: 'forge_complete', player: 0 }, registry);
    if (result.ok) state = result.state;
    result = applyAction(state, { kind: 'forge_complete', player: 1 }, registry);
    if (result.ok) state = result.state;
    return state;
  }

  function doSimpleForge(state: MatchState, player: 0 | 1): MatchState {
    // Set base stats for weapon and armor
    let result = applyAction(state, {
      kind: 'forge_action',
      player,
      action: { kind: 'set_base_stats', target: 'weapon', stat1: 'STR', stat2: 'DEX' },
    }, registry);
    if (result.ok) state = result.state;

    result = applyAction(state, {
      kind: 'forge_action',
      player,
      action: { kind: 'set_base_stats', target: 'armor', stat1: 'VIT', stat2: 'INT' },
    }, registry);
    if (result.ok) state = result.state;

    // Assign first orb to weapon slot 0 if available
    if (state.players[player].stockpile.length > 0) {
      const orb = state.players[player].stockpile[0];
      result = applyAction(state, {
        kind: 'forge_action',
        player,
        action: { kind: 'assign_orb', orbUid: orb.uid, target: 'weapon', slotIndex: 0 },
      }, registry);
      if (result.ok) state = result.state;
    }

    return state;
  }

  function runFullMatch(seed: number): MatchState {
    let state = createMatch('det-test', seed, 'unranked', ['p1', 'p2'], BASE_WEAPON, BASE_ARMOR, registry);

    // Draft/Forge/Duel rounds
    for (let round = 1; round <= 3; round++) {
      // Draft phase
      if (state.phase.kind === 'draft') {
        state = draftAll(state);
      }

      if (state.phase.kind !== 'forge') break;

      // Set base stats on round 1
      if (round === 1) {
        state = doSimpleForge(state, 0);
        state = doSimpleForge(state, 1);
      }

      state = completeForgeBothPlayers(state);
      if (state.phase.kind !== 'duel') break;

      const result = applyAction(state, { kind: 'advance_phase' }, registry);
      if (result.ok) state = result.state;

      if (state.phase.kind === 'complete') break;
    }

    return state;
  }
});
