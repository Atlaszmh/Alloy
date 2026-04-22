import { describe, it, expect } from 'vitest';
import { CombinationEngine } from '../src/combine/combination-engine.js';
import { RecipeRegistry, type RecipeDefinition } from '../src/combine/recipe-registry.js';
import { DiscoveryState } from '../src/combine/discovery-state.js';
import { createGem, type SecondarySlot } from '../src/types/gem.js';
import { applyPlanAction, createForgePlan } from '../src/forge/forge-plan.js';
import { createForgeState } from '../src/forge/forge-state.js';
import { DataRegistry } from '../src/data/registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { liveSlots } from '../src/types/slot-array.js';

// --- Fixtures (mirroring combination-engine.test.ts) ---

const signatureRecipes: RecipeDefinition[] = [
  {
    id: 'ignite',
    name: 'Ignite',
    type: 'signature',
    components: [
      { kind: 'affix', id: 'chance_on_hit' },
      { kind: 'affix', id: 'fire_damage' },
    ],
    outputAffixId: 'ignite',
    outputBonusEffects: [],
    maxDepthContribution: 1,
    tags: ['compound', 'fire', 'trigger'],
  },
];

const categoryRecipes: RecipeDefinition[] = [
  {
    id: 'cat_off_off',
    name: 'Offensive Fusion',
    type: 'category',
    categoryRule: { inputA: 'offensive', inputB: 'offensive' },
    outputAffixId: '__offensive_fusion__',
    outputBonusEffects: [],
    maxDepthContribution: 1,
    tags: [],
  },
];

const allRecipes = [...signatureRecipes, ...categoryRecipes];

const categoryMap: Record<string, string> = {
  fire_damage: 'offensive',
  crit_chance: 'offensive',
  chance_on_hit: 'trigger',
  attack_speed: 'offensive',
  armor_rating: 'defensive',
  flat_physical: 'offensive',
  flat_armor: 'defensive',
  flat_life: 'sustain',
  flat_lightning: 'offensive',
};

function makeEngine(): CombinationEngine {
  const registry = new RecipeRegistry(allRecipes);
  const discovery = new DiscoveryState();
  return new CombinationEngine(registry, discovery, categoryMap);
}

// Signature pair: chance_on_hit + fire_damage → ignite
const SIG_AFFIX_A = 'chance_on_hit';
const SIG_AFFIX_B = 'fire_damage';

// Category pair: fire_damage + crit_chance → cat_off_off (both offensive, no signature)
const CAT_AFFIX_A = 'fire_damage';
const CAT_AFFIX_B = 'crit_chance';

describe('combine with filled-secondary inputs', () => {
  it('rejects signature recipe match when either input has filled secondary', () => {
    const sec: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const g1 = { ...createGem('a', SIG_AFFIX_A, 2, 'rare'), secondary: sec };
    const g2 = createGem('b', SIG_AFFIX_B, 2, 'rare');
    const engine = makeEngine();
    expect(() => engine.combine(g1, g2, 'out')).toThrow(/filled-secondary.*generic/i);
  });

  it('rejects category combo match when either input has filled secondary', () => {
    const sec: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const g1 = { ...createGem('a', CAT_AFFIX_A, 2, 'rare'), secondary: sec };
    const g2 = createGem('b', CAT_AFFIX_B, 2, 'rare');
    const engine = makeEngine();
    expect(() => engine.combine(g1, g2, 'out')).toThrow(/filled-secondary.*generic/i);
  });

  it('succeeds on generic upgrade when both inputs share affix; keeps kept gem secondary', () => {
    const sec: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const g1 = { ...createGem('a', 'flat_physical', 3, 'rare'), secondary: sec };
    const g2 = createGem('b', 'flat_physical', 3, 'rare');
    const engine = makeEngine();
    const result = engine.combine(g1, g2, 'out', 'a');
    expect(result.layer).toBe('generic');
    expect(result.gem.secondary?.affixId).toBe('flat_armor');
  });

  it('when keepGemUid selects the non-filled gem, no secondary on output', () => {
    const sec: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const g1 = { ...createGem('a', 'flat_physical', 3, 'rare'), secondary: sec };
    const g2 = createGem('b', 'flat_physical', 3, 'rare');
    const engine = makeEngine();
    const result = engine.combine(g1, g2, 'out', 'b');
    expect(result.gem.secondary).toBeUndefined();
  });

  it('deterministic fallback when both filled and no keepGemUid: higher rarity wins', () => {
    const secA: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const secB: SecondarySlot = { affixId: 'flat_life', tier: 2, rarity: 'magic', sourceGemUid: 'y' };
    const g1 = { ...createGem('a', 'flat_physical', 3, 'rare'), secondary: secA };
    const g2 = { ...createGem('b', 'flat_physical', 3, 'epic'), secondary: secB };
    const engine = makeEngine();
    const result = engine.combine(g1, g2, 'out');
    expect(result.gem.secondary?.affixId).toBe('flat_life'); // g2 wins by rarity (epic > rare)
  });

  it('tie-break: same rarity → higher tier wins', () => {
    const secA: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const secB: SecondarySlot = { affixId: 'flat_life', tier: 2, rarity: 'magic', sourceGemUid: 'y' };
    const g1 = { ...createGem('a', 'flat_physical', 2, 'rare'), secondary: secA };
    const g2 = { ...createGem('b', 'flat_physical', 4, 'rare'), secondary: secB }; // higher tier
    const engine = makeEngine();
    const result = engine.combine(g1, g2, 'out');
    expect(result.gem.secondary?.affixId).toBe('flat_life'); // g2 wins by tier
  });

  it('tie-break: same tier+rarity → lower uid wins', () => {
    const secA: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const secB: SecondarySlot = { affixId: 'flat_life', tier: 2, rarity: 'magic', sourceGemUid: 'y' };
    const g1 = { ...createGem('a', 'flat_physical', 3, 'rare'), secondary: secA }; // uid 'a'
    const g2 = { ...createGem('b', 'flat_physical', 3, 'rare'), secondary: secB }; // uid 'b'
    const engine = makeEngine();
    const result = engine.combine(g1, g2, 'out');
    expect(result.gem.secondary?.affixId).toBe('flat_armor'); // 'a' < 'b'
  });
});

describe('plan-level combine rejection for filled-secondary inputs', () => {
  const data = loadAndValidateData();
  const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance, data.recipes);

  it('applyPlanAction returns ok:false with filled-secondary error when signature match blocked', () => {
    // Build a ForgePlan with two gems where one has a filled secondary
    // AND the pair would normally match a signature recipe (chance_on_hit + fire_damage)
    const sec: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const sigGem1 = { ...createGem('sig1', 'chance_on_hit', 2, 'rare'), secondary: sec };
    const sigGem2 = createGem('sig2', 'fire_damage', 2, 'rare');

    const state = createForgeState(
      [sigGem1, sigGem2],
      'iron_sword',
      'iron_armor',
      1,
      data.balance,
      false
    );
    const plan = createForgePlan(state, registry, new SeededRNG(0));

    // Try to combine the signature pair
    const result = applyPlanAction(plan, {
      kind: 'combine',
      gemUid1: 'sig1',
      gemUid2: 'sig2',
    }, registry);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/filled-secondary.*generic/i);
  });

  it('applyPlanAction returns ok:true for same-affix generic upgrade with filled-secondary input', () => {
    // Two same-affix gems, one with filled secondary
    const sec: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const g1 = { ...createGem('gen1', 'flat_physical', 3, 'rare'), secondary: sec };
    const g2 = createGem('gen2', 'flat_physical', 3, 'rare');

    const state = createForgeState(
      [g1, g2],
      'iron_sword',
      'iron_armor',
      1,
      data.balance,
      false
    );
    const plan = createForgePlan(state, registry, new SeededRNG(0));

    // Combine the generic upgrade pair
    const result = applyPlanAction(plan, {
      kind: 'combine',
      gemUid1: 'gen1',
      gemUid2: 'gen2',
      keepGemUid: 'gen1', // Keep the one with secondary
    }, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Verify the combined gem landed in the stockpile
    const combinedGem = liveSlots(result.plan.stockpile).find(g => g.uid.startsWith('combined_'));
    expect(combinedGem).toBeDefined();

    // Verify secondary was preserved on the output
    expect(combinedGem?.secondary?.affixId).toBe('flat_armor');
  });
});
