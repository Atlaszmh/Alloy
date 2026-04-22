import { describe, it, expect } from 'vitest';
import { CombinationEngine } from '../src/combine/combination-engine.js';
import { RecipeRegistry, type RecipeDefinition } from '../src/combine/recipe-registry.js';
import { DiscoveryState } from '../src/combine/discovery-state.js';
import { createGem, type SecondarySlot } from '../src/types/gem.js';

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
