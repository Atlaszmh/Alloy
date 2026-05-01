import { describe, it, expect } from 'vitest';
import { applyAction, createDebugMatch } from '../src/match/match-controller.js';
import { extractMatchReport } from '../src/match/match-report.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { createGem } from '../src/types/gem.js';
import { placeInFirstEmpty } from '../src/types/slot-array.js';
import type { GemInstance } from '../src/types/gem.js';
import type { Loadout, EquippedSlot } from '../src/types/item.js';
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

/**
 * Phase B regression: prior to plumbing CombinationEngine into match-controller's
 * applyForge call, signature combines silently fell through a stub fallback
 * branch that produced a gem with `affixId === gem1.affixId` (e.g. 'chance_on_hit')
 * instead of the recipe's `outputAffixId` (e.g. 'ignite'). All compound triggers
 * therefore never fired in simulated runs, and `combinationIds` was always [].
 *
 * This test pins the fix: AI/sim combines now produce real compound gems whose
 * affixId matches the recipe output, and match-report's collectCompoundIds
 * picks them up.
 */
describe('Simulation forge → compound integration', () => {
  function gemFor(affixId: string, tier: 1 | 2 | 3 | 4 | 5 = 2): GemInstance {
    return createGem(`${affixId}_uid`, affixId, tier, 'common');
  }

  it('applyAction(forge_action: combine) produces a gem with the recipe outputAffixId', () => {
    // Seed a debug match in forge phase, hijack the player's stockpile with
    // exactly the two ingredients for the Ignite recipe (chance_on_hit + fire_damage).
    let state = createDebugMatch(
      'compound_sim_test',
      42,
      'run_async',
      ['p0', 'p1'],
      'sword',
      'chainmail',
      registry,
      'forge',
      1,
    );

    const ingredients = [gemFor('chance_on_hit'), gemFor('fire_damage')];
    state = {
      ...state,
      players: [
        {
          ...state.players[0],
          stockpile: [...ingredients, ...state.players[0].stockpile.slice(2)],
        },
        state.players[1],
      ],
    };

    const result = applyAction(
      state,
      {
        kind: 'forge_action',
        player: 0,
        action: {
          kind: 'combine',
          gemUid1: ingredients[0].uid,
          gemUid2: ingredients[1].uid,
          keepGemUid: ingredients[0].uid,
        },
      },
      registry,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = result.state;

    // The output should be a compound gem with affixId === 'ignite' (the recipe
    // output), NOT 'chance_on_hit' (the input affixId, which was the old stub
    // fallback behavior).
    const outputs = next.players[0].stockpile.filter(
      (g): g is GemInstance => g !== null && g.uid.startsWith('combined_'),
    );
    expect(outputs).toHaveLength(1);
    const compoundGem = outputs[0];
    expect(compoundGem.affixId).toBe('ignite');
    expect(compoundGem.sourceRecipe).toBe('ignite');
  });

  it('extractMatchReport.collectCompoundIds picks up socketed compound gems', () => {
    // Build a minimal loadout with an ignite gem socketed and verify the
    // match report surfaces it. Locks Phase B2 (collectCompoundIds impl).
    const igniteGem = createGem('ignite_uid', 'ignite', 1, 'common', {
      sourceRecipe: 'ignite',
      recipeDepth: 1,
    });
    const slot: EquippedSlot = { gem: igniteGem };
    const loadout: Loadout = {
      weapon: {
        baseItemId: 'sword',
        baseStats: null,
        slots: [slot, ...Array(5).fill(null)],
      },
      armor: { baseItemId: 'chainmail', baseStats: null, slots: Array(6).fill(null) },
    };

    // Stand up a tiny synthetic completed MatchState carrying this loadout.
    const base = createDebugMatch(
      'report_test',
      42,
      'run_async',
      ['p0', 'p1'],
      'sword',
      'chainmail',
      registry,
      'forge',
      1,
    );
    const synth: MatchState = {
      ...base,
      phase: { kind: 'complete', winner: 0, scores: [1, 0] },
      players: [
        { ...base.players[0], loadout },
        base.players[1],
      ],
    };

    const report = extractMatchReport(synth, 'simulation', 42, registry);
    expect(report.players[0].combinationIds).toContain('ignite');
  });

  it('collectCompoundIds returns [] for a loadout with no compound gems (regression for old stub)', () => {
    const baseGem = createGem('base_uid', 'fire_damage', 1, 'common');
    const slot: EquippedSlot = { gem: baseGem };
    const loadout: Loadout = {
      weapon: {
        baseItemId: 'sword',
        baseStats: null,
        slots: [slot, ...Array(5).fill(null)],
      },
      armor: { baseItemId: 'chainmail', baseStats: null, slots: Array(6).fill(null) },
    };

    const base = createDebugMatch(
      'no_compounds_test',
      42,
      'run_async',
      ['p0', 'p1'],
      'sword',
      'chainmail',
      registry,
      'forge',
      1,
    );
    const synth: MatchState = {
      ...base,
      phase: { kind: 'complete', winner: 0, scores: [1, 0] },
      players: [
        { ...base.players[0], loadout },
        base.players[1],
      ],
    };

    const report = extractMatchReport(synth, 'simulation', 42, registry);
    expect(report.players[0].combinationIds).toEqual([]);
  });
});
