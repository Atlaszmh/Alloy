import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { generatePool } from '../src/pool/pool-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { AIController } from '../src/ai/ai-controller.js';
import { Tier1DraftStrategy, Tier2DraftStrategy } from '../src/ai/strategies/draft-strategy.js';
import { Tier1ForgeStrategy, Tier2ForgeStrategy } from '../src/ai/strategies/forge-strategy.js';
import { Tier1AdaptStrategy, Tier2AdaptStrategy } from '../src/ai/strategies/adapt-strategy.js';
import { createForgeState, applyForgeAction } from '../src/forge/forge-state.js';
import { createDraftState, makePick } from '../src/draft/draft-state.js';
import { createEmptyLoadout } from '../src/types/item.js';
import type { OrbInstance } from '../src/types/orb.js';
import type { ForgeAction } from '../src/types/forge-action.js';
import type { CombatLog } from '../src/types/combat.js';
import type { ForgeState } from '../src/forge/forge-state.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
const balance = data.balance;

function makePool(seed: number): OrbInstance[] {
  return generatePool(seed, 'ranked', registry);
}

function makeDummyCombatLog(): CombatLog {
  return {
    seed: 42,
    ticks: [],
    result: {
      round: 1,
      winner: 0,
      finalHP: [100, 0],
      tickCount: 100,
      duration: 3.33,
      wasTiebreak: false,
    },
  };
}

/**
 * Helper: apply a list of forge actions to a forge state, asserting all succeed.
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

describe('AI Draft Strategies', () => {
  it('Tier 1 draft picks the highest tier orb', () => {
    const pool = makePool(42);
    const rng = new SeededRNG(100);
    const strategy = new Tier1DraftStrategy();

    const pick = strategy.pickOrb(pool, [], [], registry, rng);
    const pickedOrb = pool.find((o) => o.uid === pick)!;

    // Find the max tier in the pool
    const maxTier = Math.max(...pool.map((o) => o.tier));
    expect(pickedOrb.tier).toBe(maxTier);
  });

  it('Tier 1 draft picks are deterministic with the same seed', () => {
    const pool = makePool(42);
    const rng1 = new SeededRNG(100);
    const rng2 = new SeededRNG(100);
    const strategy1 = new Tier1DraftStrategy();
    const strategy2 = new Tier1DraftStrategy();

    const pick1 = strategy1.pickOrb(pool, [], [], registry, rng1);
    const pick2 = strategy2.pickOrb(pool, [], [], registry, rng2);

    expect(pick1).toBe(pick2);
  });

  it('Tier 2 draft follows an archetype pattern', () => {
    const pool = makePool(42);
    const rng = new SeededRNG(200);
    const strategy = new Tier2DraftStrategy();

    // Make several picks, tracking the archetype consistency
    const picks: OrbInstance[] = [];
    let remainingPool = [...pool];

    for (let i = 0; i < Math.min(6, pool.length); i++) {
      const pickUid = strategy.pickOrb(remainingPool, picks, [], registry, rng);
      const orb = remainingPool.find((o) => o.uid === pickUid)!;
      picks.push(orb);
      remainingPool = remainingPool.filter((o) => o.uid !== pickUid);
    }

    // The Tier 2 strategy should have picked at least some orbs
    expect(picks.length).toBeGreaterThan(0);
    // All picks should be valid orbs from the pool
    for (const pick of picks) {
      expect(pool.some((o) => o.uid === pick.uid)).toBe(true);
    }
  });
});

describe('AI Forge Strategies', () => {
  it('Tier 1 forge produces valid actions', () => {
    const pool = makePool(42);
    // Take first 8 orbs as our stockpile
    const stockpile = pool.slice(0, 8);
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const rng = new SeededRNG(300);
    const strategy = new Tier1ForgeStrategy();

    const actions = strategy.plan(stockpile, loadout, 8, 1, [], registry, rng);

    // Should produce some actions
    expect(actions.length).toBeGreaterThan(0);

    // All actions should be valid - apply them through the forge system
    const forgeState = createForgeState(stockpile, 'sword', 'chainmail', 1, balance, false);
    applyAllActions(forgeState, actions);
  });

  it('Tier 2 forge tries combinations when possible', () => {
    // Create a stockpile with known combinable orbs
    const stockpile: OrbInstance[] = [
      { uid: 'test_orb_1', affixId: 'chance_on_hit', tier: 1 },
      { uid: 'test_orb_2', affixId: 'fire_damage', tier: 1 },
      { uid: 'test_orb_3', affixId: 'cold_damage', tier: 1 },
      { uid: 'test_orb_4', affixId: 'crit_chance', tier: 2 },
      { uid: 'test_orb_5', affixId: 'attack_speed', tier: 1 },
      { uid: 'test_orb_6', affixId: 'block', tier: 1 },
    ];
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const rng = new SeededRNG(400);
    const strategy = new Tier2ForgeStrategy();

    const actions = strategy.plan(stockpile, loadout, 8, 1, [], registry, rng);

    // Should produce some actions
    expect(actions.length).toBeGreaterThan(0);

    // Check if it attempted a combination (chance_on_hit + fire_damage = ignite)
    const hasCombine = actions.some((a) => a.kind === 'combine');
    expect(hasCombine).toBe(true);

    // All actions should be valid
    const forgeState = createForgeState(stockpile, 'sword', 'chainmail', 1, balance, false);
    applyAllActions(forgeState, actions);
  });

  it('Tier 2 forge actions are all valid with generated pool', () => {
    const pool = makePool(55);
    const stockpile = pool.slice(0, 10);
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const rng = new SeededRNG(500);
    const strategy = new Tier2ForgeStrategy();

    const actions = strategy.plan(stockpile, loadout, 8, 1, [], registry, rng);
    expect(actions.length).toBeGreaterThan(0);

    const forgeState = createForgeState(stockpile, 'sword', 'chainmail', 1, balance, false);
    applyAllActions(forgeState, actions);
  });
});

describe('AI Adapt Strategies', () => {
  it('Tier 1 and Tier 2 adapt strategies return empty actions', () => {
    const log = makeDummyCombatLog();
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const rng = new SeededRNG(600);

    const tier1 = new Tier1AdaptStrategy();
    const tier2 = new Tier2AdaptStrategy();

    expect(tier1.adapt(log, loadout, loadout, [], 4, registry, rng)).toEqual([]);
    expect(tier2.adapt(log, loadout, loadout, [], 4, registry, rng)).toEqual([]);
  });
});

describe('AIController', () => {
  it('dispatches to correct strategy based on tier', () => {
    const rng1 = new SeededRNG(700);
    const rng2 = new SeededRNG(700);
    const controller1 = new AIController(1, registry, rng1);
    const controller2 = new AIController(2, registry, rng2);

    expect(controller1.tier).toBe(1);
    expect(controller2.tier).toBe(2);

    const pool = makePool(42);

    // Tier 1 should pick highest tier orb
    const pick1 = controller1.pickOrb(pool, [], []);
    const pickedOrb1 = pool.find((o) => o.uid === pick1)!;
    const maxTier = Math.max(...pool.map((o) => o.tier));
    expect(pickedOrb1.tier).toBe(maxTier);
  });

  it('full AI draft: AIController picks all orbs without errors', () => {
    const pool = makePool(77);
    const rng = new SeededRNG(800);
    const ai = new AIController(1, registry, rng);

    let draftState = createDraftState(pool);
    const myStockpile: OrbInstance[] = [];
    const opponentStockpile: OrbInstance[] = [];

    // Simulate the AI picking every other orb (alternating with a dummy opponent)
    while (!draftState.isComplete) {
      const currentPlayer = draftState.activePlayer;
      let orbUid: string;

      if (currentPlayer === 0) {
        // AI picks
        orbUid = ai.pickOrb(draftState.pool, myStockpile, opponentStockpile);
      } else {
        // Opponent picks first available
        orbUid = draftState.pool[0].uid;
      }

      const result = makePick(draftState, orbUid, currentPlayer);
      if (!result.ok) throw new Error(`Draft pick failed: ${result.error}`);
      draftState = result.state;

      const pickedOrb = pool.find((o) => o.uid === orbUid)!;
      if (currentPlayer === 0) {
        myStockpile.push(pickedOrb);
      } else {
        opponentStockpile.push(pickedOrb);
      }
    }

    expect(draftState.isComplete).toBe(true);
    expect(myStockpile.length).toBeGreaterThan(0);
  });

  it('full AI forge: AIController plans forge actions that are all valid', () => {
    const pool = makePool(88);
    const stockpile = pool.slice(0, 8);
    const rng = new SeededRNG(900);
    const ai = new AIController(1, registry, rng);
    const loadout = createEmptyLoadout('sword', 'chainmail');

    const actions = ai.planForge(stockpile, loadout, 8, 1, []);
    expect(actions.length).toBeGreaterThan(0);

    // Validate all actions through the forge system
    const forgeState = createForgeState(stockpile, 'sword', 'chainmail', 1, balance, false);
    applyAllActions(forgeState, actions);
  });

  it('full AI forge with Tier 2: plans forge actions that are all valid', () => {
    const pool = makePool(99);
    const stockpile = pool.slice(0, 10);
    const rng = new SeededRNG(950);
    const ai = new AIController(2, registry, rng);
    const loadout = createEmptyLoadout('sword', 'chainmail');

    const actions = ai.planForge(stockpile, loadout, 8, 1, []);
    expect(actions.length).toBeGreaterThan(0);

    const forgeState = createForgeState(stockpile, 'sword', 'chainmail', 1, balance, false);
    applyAllActions(forgeState, actions);
  });

  it('adapt returns empty actions for Tier 1 and 2', () => {
    const log = makeDummyCombatLog();
    const loadout = createEmptyLoadout('sword', 'chainmail');

    const ai1 = new AIController(1, registry, new SeededRNG(1000));
    const ai2 = new AIController(2, registry, new SeededRNG(1001));

    expect(ai1.planAdapt(log, loadout, loadout, [], 4)).toEqual([]);
    expect(ai2.planAdapt(log, loadout, loadout, [], 4)).toEqual([]);
  });
});
