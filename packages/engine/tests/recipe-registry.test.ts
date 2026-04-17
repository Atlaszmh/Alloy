import { describe, it, expect } from 'vitest';
import {
  RecipeRegistry,
  type RecipeDefinition,
} from '../src/combine/recipe-registry.js';

// --- Test fixtures ---

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
    outputBonusEffects: [
      { stat: 'compound.ignite.chance', op: 'flat', value: 0.15 },
    ],
    maxDepthContribution: 1,
    tags: ['compound', 'fire', 'trigger'],
  },
  {
    id: 'frostbite',
    name: 'Frostbite',
    type: 'signature',
    components: [
      { kind: 'affix', id: 'chance_on_hit' },
      { kind: 'affix', id: 'cold_damage' },
    ],
    outputAffixId: 'frostbite',
    outputBonusEffects: [
      { stat: 'compound.frostbite.chance', op: 'flat', value: 0.15 },
    ],
    maxDepthContribution: 1,
    tags: ['compound', 'cold', 'trigger'],
  },
  {
    id: 'advanced_burn',
    name: 'Advanced Burn',
    type: 'signature',
    components: [
      { kind: 'recipe', id: 'ignite' },
      { kind: 'affix', id: 'crit_chance' },
    ],
    outputAffixId: 'advanced_burn',
    outputBonusEffects: [
      { stat: 'compound.advanced_burn.critBurnDamage', op: 'flat', value: 10 },
    ],
    maxDepthContribution: 1,
    tags: ['compound', 'fire', 'crit'],
  },
];

const categoryRecipes: RecipeDefinition[] = [
  {
    id: 'cat_off_off',
    name: 'Offensive Fusion',
    type: 'category',
    categoryRule: { inputA: 'offensive', inputB: 'offensive' },
    outputAffixId: '__offensive_fusion__',
    outputBonusEffects: [
      { stat: 'damage', op: 'percent', value: 0.05 },
    ],
    maxDepthContribution: 1,
    tags: [],
  },
  {
    id: 'cat_sustain_any',
    name: 'Sustain Fusion',
    type: 'category',
    categoryRule: { inputA: 'sustain', inputB: 'any' },
    outputAffixId: '__sustain_fusion__',
    outputBonusEffects: [
      { stat: 'hp_regen', op: 'flat', value: 1 },
    ],
    maxDepthContribution: 1,
    tags: [],
  },
  {
    id: 'cat_off_def',
    name: 'Balanced Fusion',
    type: 'category',
    categoryRule: { inputA: 'offensive', inputB: 'defensive' },
    outputAffixId: '__balanced_fusion__',
    outputBonusEffects: [
      { stat: 'armor', op: 'flat', value: 2 },
    ],
    maxDepthContribution: 1,
    tags: [],
  },
];

const allRecipes = [...signatureRecipes, ...categoryRecipes];

describe('RecipeRegistry', () => {
  it('finds a signature recipe by component affixes', () => {
    const registry = new RecipeRegistry(allRecipes);
    const result = registry.findSignatureRecipe(
      { affixId: 'chance_on_hit' },
      { affixId: 'fire_damage' },
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe('ignite');
  });

  it('matches components in either order', () => {
    const registry = new RecipeRegistry(allRecipes);

    // Reversed order from the recipe definition
    const result = registry.findSignatureRecipe(
      { affixId: 'fire_damage' },
      { affixId: 'chance_on_hit' },
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe('ignite');
  });

  it('matches recipe-result components (kind: recipe)', () => {
    const registry = new RecipeRegistry(allRecipes);

    // advanced_burn requires recipe:ignite + affix:crit_chance
    const result = registry.findSignatureRecipe(
      { affixId: 'ignite_output', sourceRecipe: 'ignite' },
      { affixId: 'crit_chance' },
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe('advanced_burn');
  });

  it('returns null when no recipe matches', () => {
    const registry = new RecipeRegistry(allRecipes);
    const result = registry.findSignatureRecipe(
      { affixId: 'fire_damage' },
      { affixId: 'nonexistent_affix' },
    );
    expect(result).toBeNull();
  });

  it('gets recipe by id', () => {
    const registry = new RecipeRegistry(allRecipes);
    const ignite = registry.get('ignite');
    expect(ignite).toBeDefined();
    expect(ignite!.name).toBe('Ignite');

    const missing = registry.get('nonexistent');
    expect(missing).toBeUndefined();
  });

  it('finds category recipe by categories', () => {
    const registry = new RecipeRegistry(allRecipes);
    const result = registry.findCategoryRecipe('offensive', 'offensive');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('cat_off_off');
  });

  it('finds category recipe with "any" wildcard', () => {
    const registry = new RecipeRegistry(allRecipes);

    // sustain + any should match anything with sustain
    const result1 = registry.findCategoryRecipe('sustain', 'offensive');
    expect(result1).not.toBeNull();
    expect(result1!.id).toBe('cat_sustain_any');

    // Order reversed — should still match
    const result2 = registry.findCategoryRecipe('defensive', 'sustain');
    expect(result2).not.toBeNull();
    expect(result2!.id).toBe('cat_sustain_any');

    // sustain + sustain also matches "sustain + any"
    const result3 = registry.findCategoryRecipe('sustain', 'sustain');
    expect(result3).not.toBeNull();
    expect(result3!.id).toBe('cat_sustain_any');
  });

  it('returns null for unmatched categories', () => {
    const registry = new RecipeRegistry(allRecipes);
    // No rule for trigger + trigger
    const result = registry.findCategoryRecipe('trigger', 'trigger');
    expect(result).toBeNull();
  });

  it('getAll returns all recipes', () => {
    const registry = new RecipeRegistry(allRecipes);
    expect(registry.getAll()).toHaveLength(allRecipes.length);
  });

  it('category recipe matches in either order', () => {
    const registry = new RecipeRegistry(allRecipes);

    // cat_off_def is defined as offensive + defensive
    const result1 = registry.findCategoryRecipe('offensive', 'defensive');
    expect(result1).not.toBeNull();
    expect(result1!.id).toBe('cat_off_def');

    // Reversed
    const result2 = registry.findCategoryRecipe('defensive', 'offensive');
    expect(result2).not.toBeNull();
    expect(result2!.id).toBe('cat_off_def');
  });

  describe('findTernaryRecipe', () => {
    const ternaryRecipes: RecipeDefinition[] = [
      {
        id: 'meltdown', name: 'Meltdown', type: 'signature3',
        components: [
          { kind: 'affix', id: 'fire_damage' },
          { kind: 'affix', id: 'cold_damage' },
          { kind: 'affix', id: 'lightning_damage' },
        ],
        outputAffixId: 'meltdown', outputBonusEffects: [],
        maxDepthContribution: 2, tags: [],
      },
      {
        id: 'mixed', name: 'Mixed', type: 'signature3',
        components: [
          { kind: 'recipe', id: 'ignite' },
          { kind: 'affix', id: 'chance_on_crit' },
          { kind: 'affix', id: 'fire_damage' },
        ],
        outputAffixId: 'mixed', outputBonusEffects: [],
        maxDepthContribution: 1, tags: [],
      },
    ];

    const registry = new RecipeRegistry(ternaryRecipes);

    it('resolves all-basic ternary by affixId', () => {
      const result = registry.findTernaryRecipe(
        { affixId: 'fire_damage' },
        { affixId: 'cold_damage' },
        { affixId: 'lightning_damage' },
      );
      expect(result?.id).toBe('meltdown');
    });

    it('is order-invariant (all 6 permutations hit)', () => {
      const gems = [
        { affixId: 'fire_damage' },
        { affixId: 'cold_damage' },
        { affixId: 'lightning_damage' },
      ];
      const perms = [
        [0,1,2], [0,2,1], [1,0,2], [1,2,0], [2,0,1], [2,1,0],
      ];
      for (const [i,j,k] of perms) {
        expect(registry.findTernaryRecipe(gems[i], gems[j], gems[k])?.id).toBe('meltdown');
      }
    });

    it('resolves mixed-kind ternary using sourceRecipe', () => {
      const result = registry.findTernaryRecipe(
        { affixId: 'ignite', sourceRecipe: 'ignite' },
        { affixId: 'chance_on_crit' },
        { affixId: 'fire_damage' },
      );
      expect(result?.id).toBe('mixed');
    });

    it('returns null when no recipe matches', () => {
      const result = registry.findTernaryRecipe(
        { affixId: 'fire_damage' },
        { affixId: 'cold_damage' },
        { affixId: 'thorns' },
      );
      expect(result).toBeNull();
    });

    it('does not match binary signature recipes', () => {
      const binary: RecipeDefinition[] = [{
        id: 'ignite', name: 'Ignite', type: 'signature',
        components: [
          { kind: 'affix', id: 'chance_on_hit' },
          { kind: 'affix', id: 'fire_damage' },
        ],
        outputAffixId: 'ignite', outputBonusEffects: [],
        maxDepthContribution: 1, tags: [],
      }];
      const r = new RecipeRegistry(binary);
      expect(r.findTernaryRecipe(
        { affixId: 'chance_on_hit' },
        { affixId: 'fire_damage' },
        { affixId: 'anything' },
      )).toBeNull();
    });
  });
});
