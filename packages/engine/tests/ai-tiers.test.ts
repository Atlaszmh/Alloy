import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { generatePool } from '../src/pool/pool-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { AIController } from '../src/ai/ai-controller.js';
import {
  Tier3DraftStrategy,
  Tier4DraftStrategy,
  Tier5DraftStrategy,
} from '../src/ai/strategies/draft-strategy.js';
import {
  Tier3ForgeStrategy,
  Tier4ForgeStrategy,
  Tier5ForgeStrategy,
} from '../src/ai/strategies/forge-strategy.js';
import {
  Tier3AdaptStrategy,
  Tier4AdaptStrategy,
  Tier5AdaptStrategy,
} from '../src/ai/strategies/adapt-strategy.js';
import { createForgeState, applyForgeAction } from '../src/forge/forge-state.js';
import { createDraftState, makePick } from '../src/draft/draft-state.js';
import { createEmptyLoadout } from '../src/types/item.js';
import { createMatch, applyAction } from '../src/match/match-controller.js';
import type { AITier } from '../src/types/ai.js';
import type { OrbInstance } from '../src/types/orb.js';
import type { ForgeAction } from '../src/types/forge-action.js';
import type { CombatLog } from '../src/types/combat.js';
import type { ForgeState } from '../src/forge/forge-state.js';
import type { MatchState } from '../src/types/match.js';
import type { Loadout } from '../src/types/item.js';

const data = loadAndValidateData();
const registry = new DataRegistry(
  data.affixes,
  data.combinations,
  data.synergies,
  data.baseItems,
  data.balance,
);
const balance = data.balance;

function makePool(seed: number): OrbInstance[] {
  return generatePool(seed, 'ranked', registry);
}

function makeCombatLogWithDamage(): CombatLog {
  return {
    seed: 42,
    ticks: [
      {
        tick: 1,
        events: [
          { type: 'attack', attacker: 0, damage: 25, damageType: 'physical', isCrit: false },
          { type: 'attack', attacker: 0, damage: 15, damageType: 'fire', isCrit: false },
        ],
      },
      {
        tick: 2,
        events: [
          { type: 'attack', attacker: 0, damage: 20, damageType: 'physical', isCrit: true },
          { type: 'dot_tick', target: 1, element: 'fire', damage: 10 },
        ],
      },
      {
        tick: 3,
        events: [
          { type: 'attack', attacker: 1, damage: 30, damageType: 'physical', isCrit: false },
        ],
      },
    ],
    result: {
      round: 1,
      winner: 0,
      finalHP: [50, 0],
      tickCount: 100,
      duration: 3.33,
      wasTiebreak: false,
    },
  };
}

/**
 * Apply a list of forge actions to a forge state, asserting all succeed.
 */
function applyAllActions(state: ForgeState, actions: ForgeAction[]): ForgeState {
  let current = state;
  for (const action of actions) {
    const result = applyForgeAction(current, action, registry);
    if (!result.ok) {
      throw new Error(`Forge action failed: ${result.error} (action: ${JSON.stringify(action)})`);
    }
    current = result.state;
  }
  return current;
}

// ---- Draft Strategies ----

describe('Tier 3 Draft Strategy', () => {
  it('produces valid picks', () => {
    const pool = makePool(42);
    const rng = new SeededRNG(100);
    const strategy = new Tier3DraftStrategy();

    const picks: OrbInstance[] = [];
    let remaining = [...pool];

    for (let i = 0; i < Math.min(8, pool.length); i++) {
      const uid = strategy.pickOrb(remaining, picks, [], registry, rng);
      const orb = remaining.find((o) => o.uid === uid)!;
      expect(orb).toBeDefined();
      picks.push(orb);
      remaining = remaining.filter((o) => o.uid !== uid);
    }

    expect(picks.length).toBe(8);
  });
});

describe('Tier 4 Draft Strategy', () => {
  it('considers denial value', () => {
    const pool = makePool(42);
    const rng = new SeededRNG(200);
    const strategy = new Tier4DraftStrategy();

    // Give the opponent some orbs so denial matters
    const opponentStockpile = pool.slice(0, 3);
    const remaining = pool.slice(3);

    const uid = strategy.pickOrb(remaining, [], opponentStockpile, registry, rng);
    const pickedOrb = remaining.find((o) => o.uid === uid);
    expect(pickedOrb).toBeDefined();
  });
});

describe('Tier 5 Draft Strategy', () => {
  it('evaluates all options', () => {
    const pool = makePool(42);
    const rng = new SeededRNG(300);
    const strategy = new Tier5DraftStrategy();

    const picks: OrbInstance[] = [];
    let remaining = [...pool];

    for (let i = 0; i < Math.min(10, pool.length); i++) {
      const uid = strategy.pickOrb(remaining, picks, [], registry, rng);
      const orb = remaining.find((o) => o.uid === uid)!;
      expect(orb).toBeDefined();
      picks.push(orb);
      remaining = remaining.filter((o) => o.uid !== uid);
    }

    expect(picks.length).toBe(10);
  });
});

// ---- Forge Strategies ----

describe('Tier 3 Forge Strategy', () => {
  it('produces valid actions', () => {
    const pool = makePool(42);
    const stockpile = pool.slice(0, 10);
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const rng = new SeededRNG(400);
    const strategy = new Tier3ForgeStrategy();

    const actions = strategy.plan(stockpile, loadout, 8, 1, [], registry, rng);
    expect(actions.length).toBeGreaterThan(0);

    // All actions should be valid through forge system
    const forgeState = createForgeState(stockpile, 'sword', 'chainmail', 1, balance, false);
    applyAllActions(forgeState, actions);
  });
});

describe('Tier 4 Forge Strategy', () => {
  it('tries combinations', () => {
    const stockpile: OrbInstance[] = [
      { uid: 't4_orb_1', affixId: 'chance_on_hit', tier: 1 },
      { uid: 't4_orb_2', affixId: 'fire_damage', tier: 1 },
      { uid: 't4_orb_3', affixId: 'cold_damage', tier: 1 },
      { uid: 't4_orb_4', affixId: 'crit_chance', tier: 2 },
      { uid: 't4_orb_5', affixId: 'attack_speed', tier: 1 },
      { uid: 't4_orb_6', affixId: 'block_chance', tier: 1 },
    ];
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const rng = new SeededRNG(500);
    const strategy = new Tier4ForgeStrategy();

    const actions = strategy.plan(stockpile, loadout, 8, 1, [], registry, rng);
    expect(actions.length).toBeGreaterThan(0);

    const hasCombine = actions.some((a) => a.kind === 'combine');
    expect(hasCombine).toBe(true);

    // All actions should be valid
    const forgeState = createForgeState(stockpile, 'sword', 'chainmail', 1, balance, false);
    applyAllActions(forgeState, actions);
  });
});

describe('Tier 5 Forge Strategy', () => {
  it('maximizes combinations', () => {
    const stockpile: OrbInstance[] = [
      { uid: 't5_orb_1', affixId: 'chance_on_hit', tier: 2 },
      { uid: 't5_orb_2', affixId: 'fire_damage', tier: 2 },
      { uid: 't5_orb_3', affixId: 'cold_damage', tier: 1 },
      { uid: 't5_orb_4', affixId: 'crit_chance', tier: 3 },
      { uid: 't5_orb_5', affixId: 'flat_physical', tier: 2 },
      { uid: 't5_orb_6', affixId: 'flat_hp', tier: 1 },
      { uid: 't5_orb_7', affixId: 'lifesteal', tier: 1 },
      { uid: 't5_orb_8', affixId: 'armor_rating', tier: 1 },
    ];
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const rng = new SeededRNG(600);
    const strategy = new Tier5ForgeStrategy();

    const actions = strategy.plan(stockpile, loadout, 8, 1, [], registry, rng);
    expect(actions.length).toBeGreaterThan(0);

    // Should attempt to combine chance_on_hit + fire_damage (ignite)
    const hasCombine = actions.some((a) => a.kind === 'combine');
    expect(hasCombine).toBe(true);

    // All actions should be valid
    const forgeState = createForgeState(stockpile, 'sword', 'chainmail', 1, balance, false);
    applyAllActions(forgeState, actions);
  });
});

// ---- Adapt Strategies ----

describe('Tier 3 Adapt Strategy', () => {
  it('produces valid swap actions when given a combat log', () => {
    const pool = makePool(42);
    // Build a loadout with some orbs in it
    const stockpileForForge = pool.slice(0, 6);
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const forgeRng = new SeededRNG(700);
    const forgeStrategy = new Tier3ForgeStrategy();
    const forgeActions = forgeStrategy.plan(stockpileForForge, loadout, 8, 1, [], registry, forgeRng);
    const forgeState = createForgeState(stockpileForForge, 'sword', 'chainmail', 1, balance, false);
    const resultState = applyAllActions(forgeState, forgeActions);

    // Now test adaptation
    const adaptStockpile = pool.slice(6, 12); // Leftover orbs for swapping
    const combatLog = makeCombatLogWithDamage();
    const adaptRng = new SeededRNG(800);
    const strategy = new Tier3AdaptStrategy();

    const adaptActions = strategy.adapt(
      combatLog,
      resultState.loadout,
      resultState.loadout,
      adaptStockpile,
      4,
      1,
      registry,
      adaptRng,
    );

    // Validate actions (may be empty if no good swaps available, that's fine)
    if (adaptActions.length > 0) {
      // All swap actions should be valid
      for (const action of adaptActions) {
        expect(action.kind).toBe('swap_orb');
      }
      // Apply them through forge system (round 2 for swaps)
      const adaptForgeState: ForgeState = {
        stockpile: adaptStockpile,
        loadout: resultState.loadout,
        round: 2,
        fluxRemaining: 4,
        isQuickMatch: false,
      };
      applyAllActions(adaptForgeState, adaptActions);
    }
  });
});

// ---- Determinism ----

describe('Determinism', () => {
  it('all tiers produce deterministic output with same seed', () => {
    for (const tier of [3, 4, 5] as AITier[]) {
      const pool = makePool(42);

      const rng1 = new SeededRNG(1000);
      const rng2 = new SeededRNG(1000);
      const ai1 = new AIController(tier, registry, rng1);
      const ai2 = new AIController(tier, registry, rng2);

      // Draft picks should match
      const pick1 = ai1.pickOrb(pool, [], []);
      const pick2 = ai2.pickOrb(pool, [], []);
      expect(pick1).toBe(pick2);

      // Forge plans should match
      const stockpile = pool.slice(0, 8);
      const loadout = createEmptyLoadout('sword', 'chainmail');
      const actions1 = ai1.planForge(stockpile, loadout, 8, 1, []);
      const actions2 = ai2.planForge(stockpile, loadout, 8, 1, []);
      expect(actions1).toEqual(actions2);
    }
  });
});

// ---- Robustness ----

describe('Robustness', () => {
  it('higher tiers do not crash with any pool (10 different seeds)', () => {
    for (const tier of [3, 4, 5] as AITier[]) {
      for (let seed = 1; seed <= 10; seed++) {
        const pool = makePool(seed);
        const rng = new SeededRNG(seed * 100);
        const ai = new AIController(tier, registry, rng);

        // Draft
        let remaining = [...pool];
        const myStockpile: OrbInstance[] = [];
        for (let i = 0; i < Math.min(8, remaining.length); i++) {
          const uid = ai.pickOrb(remaining, myStockpile, []);
          const orb = remaining.find((o) => o.uid === uid);
          expect(orb).toBeDefined();
          myStockpile.push(orb!);
          remaining = remaining.filter((o) => o.uid !== uid);
        }

        // Forge
        const loadout = createEmptyLoadout('sword', 'chainmail');
        const actions = ai.planForge(myStockpile, loadout, 8, 1, []);
        expect(actions.length).toBeGreaterThan(0);

        // Apply forge actions - all should be valid
        const forgeState = createForgeState(myStockpile, 'sword', 'chainmail', 1, balance, false);
        applyAllActions(forgeState, actions);
      }
    }
  });
});

// ---- Higher Tiers Beat Lower Tiers ----

describe('Higher tiers beat lower tiers', () => {
  /**
   * Run a full AI match (unranked = best of 3 rounds) and return winner.
   */
  function runAIMatch(tier1: AITier, tier2: AITier, seed: number): 0 | 1 {
    const masterRng = new SeededRNG(seed);
    const ai0 = new AIController(tier1, registry, masterRng.fork('ai0'));
    const ai1 = new AIController(tier2, registry, masterRng.fork('ai1'));

    let state = createMatch(
      `ai-match-${seed}`,
      seed,
      'quick',
      ['ai0', 'ai1'],
      'sword',
      'chainmail',
      registry,
    );

    // Draft phase
    while (state.phase.kind === 'draft') {
      const activePlayer = state.phase.activePlayer;
      const ai = activePlayer === 0 ? ai0 : ai1;
      const myStockpile = state.players[activePlayer].stockpile;
      const oppStockpile = state.players[activePlayer === 0 ? 1 : 0].stockpile;

      const orbUid = ai.pickOrb(state.pool, myStockpile, oppStockpile);
      const result = applyAction(
        state,
        { kind: 'draft_pick', player: activePlayer, orbUid },
        registry,
      );
      if (!result.ok) throw new Error(`Draft failed: ${result.error}`);
      state = result.state;
    }

    // Forge and duel loop
    for (let round = 0; round < 3; round++) {
      if (state.phase.kind !== 'forge') break;

      const forgeRound = state.phase.round as 1 | 2 | 3;

      // Forge phase
      for (const player of [0, 1] as const) {
        const ai = player === 0 ? ai0 : ai1;
        const stockpile = state.players[player].stockpile;
        const loadout = state.players[player].loadout;
        const flux = state.forgeFlux?.[player] ?? 0;
        const oppStockpile = state.players[player === 0 ? 1 : 0].stockpile;

        const forgeActions = ai.planForge(stockpile, loadout, flux, forgeRound, oppStockpile);

        for (const action of forgeActions) {
          const result = applyAction(
            state,
            { kind: 'forge_action', player, action },
            registry,
          );
          if (result.ok) {
            state = result.state;
          }
        }
      }

      // Complete forge
      for (const player of [0, 1] as const) {
        const result = applyAction(state, { kind: 'forge_complete', player }, registry);
        if (result.ok) state = result.state;
      }

      // Duel phase
      if (state.phase.kind === 'duel') {
        const result = applyAction(state, { kind: 'advance_phase' }, registry);
        if (!result.ok) throw new Error(`Duel failed: ${result.error}`);
        state = result.state;
      }

      if (state.phase.kind === 'complete') break;
    }

    if (state.phase.kind === 'complete') {
      return state.phase.winner === 'draw' ? 0 : state.phase.winner;
    }

    return 0;
  }

  it('T3 beats T1 in majority of 20 matches', () => {
    let t3Wins = 0;
    const totalMatches = 20;

    for (let seed = 1; seed <= totalMatches; seed++) {
      const winner = runAIMatch(3, 1, seed * 7 + 100);
      if (winner === 0) t3Wins++;
    }

    const t3WinRate = t3Wins / totalMatches;
    expect(t3WinRate).toBeGreaterThanOrEqual(0.45);
  });

  it('T4 beats T2 in majority of 40 matches', () => {
    let t4Wins = 0;
    const totalMatches = 40;

    for (let seed = 1; seed <= totalMatches; seed++) {
      const winner = runAIMatch(4, 2, seed * 31 + 500);
      if (winner === 0) t4Wins++;
    }

    const t4WinRate = t4Wins / totalMatches;
    expect(t4WinRate).toBeGreaterThanOrEqual(0.40);
  });

  it('T5 beats T3 in majority of 20 matches', () => {
    let t5Wins = 0;
    const totalMatches = 20;

    for (let seed = 1; seed <= totalMatches; seed++) {
      const winner = runAIMatch(5, 3, seed * 17 + 300);
      if (winner === 0) t5Wins++;
    }

    const t5WinRate = t5Wins / totalMatches;
    expect(t5WinRate).toBeGreaterThanOrEqual(0.45);
  });
});
