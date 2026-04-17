import { describe, it, expect, beforeEach } from 'vitest';
import { CombinationEngine } from '../src/combine/combination-engine.js';
import { RecipeRegistry, type RecipeDefinition } from '../src/combine/recipe-registry.js';
import { DiscoveryState } from '../src/combine/discovery-state.js';
import { createGem, calculateEffectiveValue } from '../src/types/gem.js';

const ternaryRecipes: RecipeDefinition[] = [
  {
    id: 'meltdown', name: 'Meltdown', type: 'signature3',
    components: [
      { kind: 'affix', id: 'fire_damage' },
      { kind: 'affix', id: 'cold_damage' },
      { kind: 'affix', id: 'lightning_damage' },
    ],
    outputAffixId: 'meltdown',
    outputBonusEffects: [
      { stat: 'compound.meltdown.active', op: 'flat', value: 1 },
    ],
    maxDepthContribution: 2,
    tags: ['compound', 'elemental'],
  },
];

const categoryMap: Record<string, string> = {
  fire_damage: 'offensive',
  cold_damage: 'offensive',
  lightning_damage: 'offensive',
  chance_on_hit: 'trigger',
};

describe('combine3 — ternary signature match', () => {
  let engine: CombinationEngine;
  let discovery: DiscoveryState;

  beforeEach(() => {
    const registry = new RecipeRegistry(ternaryRecipes);
    discovery = new DiscoveryState();
    engine = new CombinationEngine(registry, discovery, categoryMap);
  });

  it('builds the expected output gem', () => {
    const a = createGem('a', 'fire_damage', 2, 'rare');
    const b = createGem('b', 'cold_damage', 2, 'rare');
    const c = createGem('c', 'lightning_damage', 2, 'rare');

    const result = engine.combine3(a, b, c, 'out', 'a');

    expect(result.layer).toBe('signature');
    expect(result.recipeId).toBe('meltdown');
    expect(result.gem.affixId).toBe('meltdown');
    expect(result.gem.outputBonusEffects).toEqual([
      { stat: 'compound.meltdown.active', op: 'flat', value: 1 },
    ]);
    expect(result.consumedUids).toEqual(['a', 'b', 'c']);
    expect(result.ejectedUid).toBeUndefined();
    expect(result.isNewDiscovery).toBe(true);
  });

  it('recipeDepth = max(parents) + maxDepthContribution', () => {
    const a = createGem('a', 'fire_damage', 1, 'common', { recipeDepth: 0 });
    const b = createGem('b', 'cold_damage', 1, 'common', { recipeDepth: 1 });
    const c = createGem('c', 'lightning_damage', 1, 'common', { recipeDepth: 0 });
    const result = engine.combine3(a, b, c, 'out');
    expect(result.gem.recipeDepth).toBe(1 + 2); // max(0,1,0) + maxDepthContribution(2)
  });

  it('records ternary attempt on discovery state', () => {
    const a = createGem('a', 'fire_damage', 1, 'common');
    const b = createGem('b', 'cold_damage', 1, 'common');
    const c = createGem('c', 'lightning_damage', 1, 'common');
    engine.combine3(a, b, c, 'out');
    expect(discovery.hasAttempted3('fire_damage', 'cold_damage', 'lightning_damage')).toBe(true);
  });

  it('second combine is not a new discovery', () => {
    const a = createGem('a', 'fire_damage', 1, 'common');
    const b = createGem('b', 'cold_damage', 1, 'common');
    const c = createGem('c', 'lightning_damage', 1, 'common');
    engine.combine3(a, b, c, 'out1');
    const second = engine.combine3(a, b, c, 'out2');
    expect(second.isNewDiscovery).toBe(false);
  });

  it('unanimous rarity → bonus; mixed → no bonus', () => {
    const a1 = createGem('a', 'fire_damage', 2, 'rare');
    const b1 = createGem('b', 'cold_damage', 2, 'rare');
    const c1 = createGem('c', 'lightning_damage', 2, 'rare');
    const r1 = engine.combine3(a1, b1, c1, 'out1');

    const registry2 = new RecipeRegistry(ternaryRecipes);
    const engine2 = new CombinationEngine(registry2, new DiscoveryState(), categoryMap);
    const a2 = createGem('a', 'fire_damage', 2, 'rare');
    const b2 = createGem('b', 'cold_damage', 2, 'rare');
    const c2 = createGem('c', 'lightning_damage', 2, 'magic');
    const r2 = engine2.combine3(a2, b2, c2, 'out2');

    const ev1 = calculateEffectiveValue(r1.gem.tier, r1.gem.rarity);
    const ev2 = calculateEffectiveValue(r2.gem.tier, r2.gem.rarity);
    expect(ev1).toBeGreaterThanOrEqual(ev2);
  });

  it('non-combinable gem throws', () => {
    const a = createGem('a', 'fire_damage', 1, 'common', { recipeDepth: 3 }); // at MAX_RECIPE_DEPTH → not combinable
    const b = createGem('b', 'cold_damage', 1, 'common');
    const c = createGem('c', 'lightning_damage', 1, 'common');
    expect(() => engine.combine3(a, b, c, 'out')).toThrow();
  });

  it('is order-invariant', () => {
    const a = createGem('a', 'fire_damage', 2, 'rare');
    const b = createGem('b', 'cold_damage', 2, 'rare');
    const c = createGem('c', 'lightning_damage', 2, 'rare');
    const perms = [
      [a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a],
    ];
    const registry3 = new RecipeRegistry(ternaryRecipes);
    for (const [x, y, z] of perms) {
      const eng = new CombinationEngine(registry3, new DiscoveryState(), categoryMap);
      const r = eng.combine3(x, y, z, 'out', x.uid);
      expect(r.recipeId).toBe('meltdown');
    }
  });
});

describe('combine3 — KEEP-anchored fallback', () => {
  const binarySignatures: RecipeDefinition[] = [
    {
      id: 'ignite', name: 'Ignite', type: 'signature',
      components: [
        { kind: 'affix', id: 'chance_on_hit' },
        { kind: 'affix', id: 'fire_damage' },
      ],
      outputAffixId: 'ignite',
      outputBonusEffects: [{ stat: 'compound.ignite.chance', op: 'flat', value: 0.15 }],
      maxDepthContribution: 1,
      tags: ['compound', 'fire', 'trigger'],
    },
  ];

  function makeEngine(recipes: RecipeDefinition[], catMap: Record<string, string> = categoryMap) {
    const registry = new RecipeRegistry(recipes);
    const discovery = new DiscoveryState();
    const engine = new CombinationEngine(registry, discovery, catMap);
    return { engine, discovery };
  }

  it('falls back to a KEEP-anchored binary signature; ejects third gem', () => {
    const { engine, discovery } = makeEngine(binarySignatures);
    const keep = createGem('keep', 'chance_on_hit', 1, 'common');
    const other1 = createGem('o1', 'fire_damage', 1, 'common');
    const other2 = createGem('o2', 'lightning_damage', 1, 'common');

    const result = engine.combine3(keep, other1, other2, 'out', 'keep');

    expect(result.layer).toBe('signature');
    expect(result.recipeId).toBe('ignite');
    expect(result.consumedUids.sort()).toEqual(['keep', 'o1'].sort());
    expect(result.ejectedUid).toBe('o2');
    expect(discovery.hasAttempted3('chance_on_hit', 'fire_damage', 'lightning_damage')).toBe(true);
    expect(discovery.hasAttempted('chance_on_hit', 'fire_damage')).toBe(true);
  });

  it('non-KEEP pair is NOT chosen even if it would produce a signature', () => {
    const { engine } = makeEngine(binarySignatures);
    const keep = createGem('keep', 'flat_hp', 1, 'common');
    const other1 = createGem('o1', 'chance_on_hit', 1, 'common');
    const other2 = createGem('o2', 'fire_damage', 1, 'common');

    const result = engine.combine3(keep, other1, other2, 'out', 'keep');

    expect(result.recipeId).toBeUndefined();
    expect(result.consumedUids).toContain('keep');
  });

  it('higher-layer KEEP pair wins over lower-layer KEEP pair', () => {
    const signatures: RecipeDefinition[] = [
      ...binarySignatures,
      {
        id: 'cat_trigger_any', name: 'Trigger Fusion', type: 'category',
        categoryRule: { inputA: 'trigger', inputB: 'defensive' },
        outputAffixId: '__trigger_def__',
        outputBonusEffects: [{ stat: 'armor', op: 'flat', value: 1 }],
        maxDepthContribution: 1, tags: [],
      },
    ];
    const mapExt = { ...categoryMap, fire_damage: 'offensive', armor_rating: 'defensive' };
    const { engine } = makeEngine(signatures, mapExt);

    const keep = createGem('keep', 'chance_on_hit', 1, 'common');
    const other1 = createGem('o1', 'fire_damage', 1, 'common');
    const other2 = createGem('o2', 'armor_rating', 1, 'common');

    const result = engine.combine3(keep, other1, other2, 'out', 'keep');

    expect(result.recipeId).toBe('ignite');
    expect(result.ejectedUid).toBe('o2');
  });

  it('ternary match short-circuits: binary discovery is NOT recorded', () => {
    const recipes = [...ternaryRecipes, ...binarySignatures];
    const { engine, discovery } = makeEngine(recipes);
    const a = createGem('a', 'fire_damage', 1, 'common');
    const b = createGem('b', 'cold_damage', 1, 'common');
    const c = createGem('c', 'lightning_damage', 1, 'common');

    engine.combine3(a, b, c, 'out');

    expect(discovery.hasAttempted3('fire_damage', 'cold_damage', 'lightning_damage')).toBe(true);
    expect(discovery.hasAttempted('fire_damage', 'cold_damage')).toBe(false);
    expect(discovery.hasAttempted('fire_damage', 'lightning_damage')).toBe(false);
    expect(discovery.hasAttempted('cold_damage', 'lightning_damage')).toBe(false);
  });
});
