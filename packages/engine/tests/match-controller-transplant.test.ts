import { describe, it, expect } from 'vitest';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { createMatch, applyAction } from '../src/match/match-controller.js';
import { createGem } from '../src/types/gem.js';
import { liveSlots, liveCount } from '../src/types/slot-array.js';
import type { MatchState } from '../src/types/match.js';

const data = loadAndValidateData();
const registry = new DataRegistry(
  data.affixes,
  data.combinations,
  data.synergies,
  data.baseItems,
  data.balance,
  data.recipes,
);

const SEED = 42;
const BASE_WEAPON = 'sword';
const BASE_ARMOR = 'chainmail';

function makeRunMatch(): MatchState {
  return createMatch(
    'transplant-flux-test',
    SEED,
    'run_async',
    ['player1', 'ai'],
    BASE_WEAPON,
    BASE_ARMOR,
    registry,
    { startingLives: 3, goalRound: 10 },
  );
}

function makeQuickMatch(): MatchState {
  return createMatch(
    'transplant-quick-test',
    SEED,
    'quick',
    ['player1', 'player2'],
    BASE_WEAPON,
    BASE_ARMOR,
    registry,
  );
}

/** Draft all available gems (run_async: only player 0 picks) */
function draftAll(state: MatchState): MatchState {
  const totalOrbs = liveCount(state.pool);
  for (let i = 0; i < totalOrbs; i++) {
    if (state.phase.kind !== 'draft') break;
    const nextOrb = liveSlots(state.pool)[0];
    if (!nextOrb) break;
    const player = state.phase.activePlayer;
    const result = applyAction(state, { kind: 'draft_pick', player, orbUid: nextOrb.uid }, registry);
    if (result.ok) state = result.state;
  }
  return state;
}

/**
 * Inject two gems directly into player 0's stockpile so we control their
 * uid/tier/rarity for transplant testing.
 *
 * T5 rare: tier(5) + rarityIndex(rare=3) = 8 >= 6 → has secondary slot (open)
 * T3 magic: source gem
 */
function injectTransplantGems(state: MatchState): {
  state: MatchState;
  targetUid: string;
  sourceUid: string;
} {
  const targetUid = 'transplant-target-uid';
  const sourceUid = 'transplant-source-uid';

  const target = createGem(targetUid, 'flat_physical', 5, 'rare');
  const source = createGem(sourceUid, 'flat_life', 3, 'magic');

  // Place them as the first two entries in player 0's stockpile
  const newStockpile = [...state.players[0].stockpile, target, source];
  const newState: MatchState = {
    ...state,
    players: [
      { ...state.players[0], stockpile: newStockpile },
      state.players[1],
    ],
  };

  return { state: newState, targetUid, sourceUid };
}

describe('match-controller transplant_gem flux handling', () => {
  it('no flux deducted when chosenAffix absent (random path)', () => {
    let state = makeRunMatch();
    state = draftAll(state);

    // Set flux to 10
    state = { ...state, runState: { ...state.runState!, flux: 10 } };

    const { state: withGems, targetUid, sourceUid } = injectTransplantGems(state);
    state = withGems;

    const result = applyAction(state, {
      kind: 'forge_action',
      player: 0,
      action: { kind: 'transplant_gem', targetGemUid: targetUid, sourceGemUid: sourceUid },
    }, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Flux must be unchanged — random path has no cost
    expect(result.state.runState!.flux).toBe(10);
  });

  it('deducts transplantChooseAffix cost when chosenAffix is set', () => {
    let state = makeRunMatch();
    state = draftAll(state);

    // transplantChooseAffix cost = 3 (from balance.json)
    state = { ...state, runState: { ...state.runState!, flux: 10 } };

    const { state: withGems, targetUid, sourceUid } = injectTransplantGems(state);
    state = withGems;

    const result = applyAction(state, {
      kind: 'forge_action',
      player: 0,
      action: {
        kind: 'transplant_gem',
        targetGemUid: targetUid,
        sourceGemUid: sourceUid,
        chosenAffix: 'primary',
      },
    }, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 10 - 3 = 7
    expect(result.state.runState!.flux).toBe(7);
  });

  it('rejects when chosenAffix set but insufficient flux', () => {
    let state = makeRunMatch();
    state = draftAll(state);

    // Only 2 flux, cost is 3
    state = { ...state, runState: { ...state.runState!, flux: 2 } };

    const { state: withGems, targetUid, sourceUid } = injectTransplantGems(state);
    state = withGems;

    const result = applyAction(state, {
      kind: 'forge_action',
      player: 0,
      action: {
        kind: 'transplant_gem',
        targetGemUid: targetUid,
        sourceGemUid: sourceUid,
        chosenAffix: 'primary',
      },
    }, registry);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/insufficient flux/i);
    // State must be unchanged (no flux consumed)
    expect(state.runState!.flux).toBe(2);
  });

  it('non-run modes skip flux deduction entirely even when chosenAffix set', () => {
    let state = makeQuickMatch();
    state = draftAll(state);

    // Quick match has no runState
    expect(state.runState).toBeUndefined();

    const { state: withGems, targetUid, sourceUid } = injectTransplantGems(state);
    state = withGems;

    const result = applyAction(state, {
      kind: 'forge_action',
      player: 0,
      action: {
        kind: 'transplant_gem',
        targetGemUid: targetUid,
        sourceGemUid: sourceUid,
        chosenAffix: 'primary',
      },
    }, registry);

    // Should succeed (no flux guard in non-run modes)
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.runState).toBeUndefined();
  });
});
