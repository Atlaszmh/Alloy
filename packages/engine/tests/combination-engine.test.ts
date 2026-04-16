import { describe, it, expect, beforeEach } from 'vitest';
import {
  CombinationEngine,
  type CombineConfig,
} from '../src/combine/combination-engine.js';
import { RecipeRegistry, type RecipeDefinition } from '../src/combine/recipe-registry.js';
import { DiscoveryState } from '../src/combine/discovery-state.js';
import { createGem, type GemInstance } from '../src/types/gem.js';

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

// Category map: affixId -> category
const categoryMap: Record<string, string> = {
  fire_damage: 'offensive',
  cold_damage: 'offensive',
  chance_on_hit: 'trigger',
  crit_chance: 'offensive',
  armor_rating: 'defensive',
  hp_regen: 'sustain',
  ignite: 'offensive',
  advanced_burn: 'offensive',
  attack_speed: 'offensive',
  dodge_rating: 'defensive',
  block_chance: 'defensive',
};

describe('CombinationEngine', () => {
  let registry: RecipeRegistry;
  let discovery: DiscoveryState;
  let engine: CombinationEngine;

  beforeEach(() => {
    registry = new RecipeRegistry(allRecipes);
    discovery = new DiscoveryState();
    engine = new CombinationEngine(registry, discovery, categoryMap);
  });

  describe('Layer 1 -- Signature recipes', () => {
    it('produces a signature recipe result', () => {
      const gemA = createGem('a', 'chance_on_hit', 2, 'common');
      const gemB = createGem('b', 'fire_damage', 2, 'common');

      const result = engine.combine(gemA, gemB, 'out-1');

      expect(result.layer).toBe('signature');
      expect(result.recipeId).toBe('ignite');
      expect(result.gem.affixId).toBe('ignite');
      expect(result.gem.sourceRecipe).toBe('ignite');
      expect(result.gem.uid).toBe('out-1');
    });

    it('records discovery', () => {
      const gemA = createGem('a', 'chance_on_hit', 2, 'common');
      const gemB = createGem('b', 'fire_damage', 2, 'common');

      engine.combine(gemA, gemB, 'out-1');

      expect(discovery.isDiscovered('ignite')).toBe(true);
    });

    it('marks isNewDiscovery correctly', () => {
      const gemA = createGem('a', 'chance_on_hit', 2, 'common');
      const gemB = createGem('b', 'fire_damage', 2, 'common');

      const result1 = engine.combine(gemA, gemB, 'out-1');
      expect(result1.isNewDiscovery).toBe(true);

      // Combine again -- should not be new discovery
      const gemC = createGem('c', 'chance_on_hit', 2, 'common');
      const gemD = createGem('d', 'fire_damage', 2, 'common');
      const result2 = engine.combine(gemC, gemD, 'out-2');
      expect(result2.isNewDiscovery).toBe(false);
    });

    it('scales output by input quality', () => {
      // Low quality inputs
      const lowA = createGem('a', 'chance_on_hit', 1, 'common'); // EV: 1.0
      const lowB = createGem('b', 'fire_damage', 1, 'common'); // EV: 1.0
      const lowResult = engine.combine(lowA, lowB, 'out-low');

      // High quality inputs
      const highA = createGem('c', 'chance_on_hit', 4, 'epic'); // EV: 8.0
      const highB = createGem('d', 'fire_damage', 4, 'epic'); // EV: 8.0
      const highResult = engine.combine(highA, highB, 'out-high');

      // Higher quality inputs should produce higher tier/rarity output
      const lowEV =
        lowResult.gem.tier * (lowResult.gem.rarity === 'legendary' ? 3 : 1);
      const highEV =
        highResult.gem.tier * (highResult.gem.rarity === 'legendary' ? 3 : 1);
      expect(highEV).toBeGreaterThan(lowEV);
    });

    it('propagates tags from both inputs + recipe', () => {
      const gemA = createGem('a', 'chance_on_hit', 2, 'common', {
        tags: ['chance_on_hit', 'proc'],
      });
      const gemB = createGem('b', 'fire_damage', 2, 'common', {
        tags: ['fire_damage', 'elemental'],
      });

      const result = engine.combine(gemA, gemB, 'out-1');

      // Should contain recipe tags + both input tags (deduplicated)
      expect(result.gem.tags).toContain('compound');
      expect(result.gem.tags).toContain('fire');
      expect(result.gem.tags).toContain('trigger');
      expect(result.gem.tags).toContain('chance_on_hit');
      expect(result.gem.tags).toContain('proc');
      expect(result.gem.tags).toContain('fire_damage');
      expect(result.gem.tags).toContain('elemental');
      // No duplicates
      const unique = [...new Set(result.gem.tags)];
      expect(result.gem.tags).toHaveLength(unique.length);
    });

    it('stores outputBonusEffects from recipe', () => {
      const gemA = createGem('a', 'chance_on_hit', 2, 'common');
      const gemB = createGem('b', 'fire_damage', 2, 'common');

      const result = engine.combine(gemA, gemB, 'out-1');

      expect(result.gem.outputBonusEffects).toEqual([
        { stat: 'compound.ignite.chance', op: 'flat', value: 0.15 },
      ]);
    });
  });

  describe('Layer 2 -- Category combos', () => {
    it('produces a category combo for same-category gems', () => {
      // Both offensive, no signature match
      const gemA = createGem('a', 'fire_damage', 2, 'magic');
      const gemB = createGem('b', 'crit_chance', 2, 'magic');

      const result = engine.combine(gemA, gemB, 'out-1');

      expect(result.layer).toBe('category');
      expect(result.recipeId).toBe('cat_off_off');
    });

    it('survivor is higher effective value gem', () => {
      // fire_damage tier 3 rare (EV: 4.5) > crit_chance tier 1 common (EV: 1.0)
      const gemA = createGem('a', 'fire_damage', 3, 'rare');
      const gemB = createGem('b', 'crit_chance', 1, 'common');

      const result = engine.combine(gemA, gemB, 'out-1');

      expect(result.layer).toBe('category');
      // Survivor is gemA (higher EV), so output carries its affixId
      expect(result.gem.affixId).toBe('fire_damage');
      expect(result.gem.tier).toBe(gemA.tier);
      expect(result.gem.rarity).toBe(gemA.rarity);
    });

    it('preserves tags from both inputs', () => {
      const gemA = createGem('a', 'fire_damage', 2, 'magic', {
        tags: ['fire_damage', 'elemental'],
      });
      const gemB = createGem('b', 'crit_chance', 2, 'magic', {
        tags: ['crit_chance', 'physical'],
      });

      const result = engine.combine(gemA, gemB, 'out-1');

      expect(result.gem.tags).toContain('fire_damage');
      expect(result.gem.tags).toContain('elemental');
      expect(result.gem.tags).toContain('crit_chance');
      expect(result.gem.tags).toContain('physical');
    });

    it('stores category recipe bonus effects', () => {
      const gemA = createGem('a', 'fire_damage', 2, 'magic');
      const gemB = createGem('b', 'crit_chance', 2, 'magic');

      const result = engine.combine(gemA, gemB, 'out-1');

      expect(result.gem.outputBonusEffects).toEqual([
        { stat: 'damage', op: 'percent', value: 0.05 },
      ]);
    });
  });

  describe('Layer 3 -- Generic upgrade', () => {
    it('same-type combine upgrades rarity', () => {
      // Use a plain registry to ensure no signature/category recipes interfere
      const plainRegistry = new RecipeRegistry([]);
      const plainEngine = new CombinationEngine(plainRegistry, discovery, categoryMap);

      const gemA = createGem('a', 'attack_speed', 2, 'common');
      const gemB = createGem('b', 'attack_speed', 2, 'common');

      const result = plainEngine.combine(gemA, gemB, 'out-1');

      expect(result.layer).toBe('generic');
      expect(result.gem.affixId).toBe('attack_speed');
      expect(result.gem.rarity).toBe('uncommon'); // common + common -> uncommon
    });

    it('same-type legendary rarity -> tier upgrade instead', () => {
      const plainRegistry = new RecipeRegistry([]);
      const plainEngine = new CombinationEngine(plainRegistry, discovery, categoryMap);

      const gemA = createGem('a', 'attack_speed', 2, 'legendary');
      const gemB = createGem('b', 'attack_speed', 2, 'legendary');

      const result = plainEngine.combine(gemA, gemB, 'out-1');

      expect(result.layer).toBe('generic');
      expect(result.gem.affixId).toBe('attack_speed');
      // Both legendary -> tier upgrade: max(2,2) + 1 = 3
      expect(result.gem.tier).toBe(3);
      expect(result.gem.rarity).toBe('legendary');
    });

    it('mismatched-type combine upgrades tier of kept gem', () => {
      // Different affixes, no matching recipes
      // attack_speed is offensive, but we need categories that won't match any category recipe
      // Use affix IDs not in any category recipe match
      const gemA = createGem('a', 'attack_speed', 2, 'rare');
      const gemB = createGem('b', 'hp_regen', 1, 'common');

      // No category recipe for offensive + sustain (not defined in our test fixtures)
      // Actually cat_sustain_any IS defined... Let me use trigger + trigger which has no recipe
      // Actually let me just remove the problematic fixture. Instead, let me use
      // an engine without category recipes to isolate Layer 3 testing.
      const plainRegistry = new RecipeRegistry([]);
      const plainEngine = new CombinationEngine(plainRegistry, discovery, categoryMap);

      const result = plainEngine.combine(gemA, gemB, 'out-1');

      expect(result.layer).toBe('generic');
      // gemA has higher quality (EV: 3.0 vs 1.0), so it's kept by default
      expect(result.gem.affixId).toBe('attack_speed');
      // Kept gem tier: 2 + 1 = 3
      expect(result.gem.tier).toBe(3);
      expect(result.gem.rarity).toBe('rare');
    });

    it('defaults to keeping higher-quality gem when keepGemUid omitted', () => {
      const plainRegistry = new RecipeRegistry([]);
      const plainEngine = new CombinationEngine(plainRegistry, discovery, categoryMap);

      const gemA = createGem('a', 'attack_speed', 1, 'common'); // EV: 1.0
      const gemB = createGem('b', 'hp_regen', 3, 'rare'); // EV: 4.5

      const result = plainEngine.combine(gemA, gemB, 'out-1');

      expect(result.layer).toBe('generic');
      // gemB has higher quality, so its affix is kept
      expect(result.gem.affixId).toBe('hp_regen');
    });

    it('respects keepGemUid when provided', () => {
      const plainRegistry = new RecipeRegistry([]);
      const plainEngine = new CombinationEngine(plainRegistry, discovery, categoryMap);

      const gemA = createGem('a', 'attack_speed', 1, 'common'); // EV: 1.0
      const gemB = createGem('b', 'hp_regen', 3, 'rare'); // EV: 4.5

      // Force keep gemA even though gemB is higher quality
      const result = plainEngine.combine(gemA, gemB, 'out-1', 'a');

      expect(result.layer).toBe('generic');
      expect(result.gem.affixId).toBe('attack_speed');
      // gemA tier: 1 + 1 = 2
      expect(result.gem.tier).toBe(2);
      expect(result.gem.rarity).toBe('common');
    });

    it('mismatched-type at max tier -> rarity upgrade instead', () => {
      const plainRegistry = new RecipeRegistry([]);
      const plainEngine = new CombinationEngine(plainRegistry, discovery, categoryMap);

      const gemA = createGem('a', 'attack_speed', 5, 'rare'); // Max tier
      const gemB = createGem('b', 'hp_regen', 1, 'common');

      const result = plainEngine.combine(gemA, gemB, 'out-1');

      expect(result.layer).toBe('generic');
      expect(result.gem.affixId).toBe('attack_speed');
      // Already max tier, so rarity upgrade instead
      expect(result.gem.tier).toBe(5);
      expect(result.gem.rarity).toBe('epic'); // rare -> epic
    });
  });

  describe('Multi-depth chaining', () => {
    it('increments recipe depth on signature combines', () => {
      const gemA = createGem('a', 'chance_on_hit', 2, 'common', { recipeDepth: 0 });
      const gemB = createGem('b', 'fire_damage', 2, 'common', { recipeDepth: 1 });

      const result = engine.combine(gemA, gemB, 'out-1');

      expect(result.layer).toBe('signature');
      // recipeDepth = max(0, 1) + recipe.maxDepthContribution(1) = 2
      expect(result.gem.recipeDepth).toBe(2);
    });

    it('increments depth on category combines', () => {
      const gemA = createGem('a', 'fire_damage', 2, 'magic', { recipeDepth: 0 });
      const gemB = createGem('b', 'crit_chance', 2, 'magic', { recipeDepth: 1 });

      const result = engine.combine(gemA, gemB, 'out-1');

      expect(result.layer).toBe('category');
      // recipeDepth = max(0, 1) + 1 = 2
      expect(result.gem.recipeDepth).toBe(2);
    });
  });

  describe('Non-combinable gems', () => {
    it('rejects combine when gem is at ceiling', () => {
      // A gem at max tier + legendary + max depth is not combinable
      const gemA = createGem('a', 'fire_damage', 5, 'legendary', { recipeDepth: 3 });
      const gemB = createGem('b', 'cold_damage', 1, 'common');

      expect(gemA.combinable).toBe(false);
      expect(() => engine.combine(gemA, gemB, 'out-1')).toThrow();
    });
  });

  describe('Attempt tracking', () => {
    it('records attempted combo in discovery state', () => {
      const gemA = createGem('a', 'fire_damage', 2, 'magic');
      const gemB = createGem('b', 'crit_chance', 2, 'magic');

      engine.combine(gemA, gemB, 'out-1');

      expect(discovery.hasAttempted('fire_damage', 'crit_chance')).toBe(true);
    });
  });

  describe('previewCombine', () => {
    it('returns known=false with no gem for never-attempted combos', () => {
      const freshDiscovery = new DiscoveryState();
      const previewEngine = new CombinationEngine(registry, freshDiscovery, categoryMap);

      const gemA = createGem('a', 'fire_damage', 2, 'common');
      const gemB = createGem('b', 'cold_damage', 2, 'common');

      const preview = previewEngine.previewCombine(gemA, gemB);
      expect(preview).not.toBeNull();
      expect(preview!.known).toBe(false);
      expect(preview!.gem).toBeNull();
      expect(preview!.layer).toBeDefined();

      // Discovery state should NOT be mutated
      expect(freshDiscovery.totalDiscoveryCount()).toBe(0);
      expect(freshDiscovery.hasAttempted('fire_damage', 'cold_damage')).toBe(false);
    });

    it('returns known=true with gem after combo has been attempted', () => {
      const freshDiscovery = new DiscoveryState();
      const previewEngine = new CombinationEngine(registry, freshDiscovery, categoryMap);

      const gemA = createGem('a', 'fire_damage', 2, 'common');
      const gemB = createGem('b', 'cold_damage', 2, 'common');

      // First: actually combine to record the attempt
      const actual = previewEngine.combine(gemA, gemB, 'out');
      expect(freshDiscovery.hasAttempted('fire_damage', 'cold_damage')).toBe(true);

      // Now preview should return known=true with the gem
      const gemA2 = createGem('a2', 'fire_damage', 2, 'common');
      const gemB2 = createGem('b2', 'cold_damage', 2, 'common');
      const preview = previewEngine.previewCombine(gemA2, gemB2);

      expect(preview).not.toBeNull();
      expect(preview!.known).toBe(true);
      expect(preview!.gem).not.toBeNull();
      expect(preview!.gem!.affixId).toBe(actual.gem.affixId);
      expect(preview!.gem!.tier).toBe(actual.gem.tier);
      expect(preview!.gem!.rarity).toBe(actual.gem.rarity);
      expect(preview!.layer).toBe(actual.layer);
    });

    it('returns null for non-combinable gems', () => {
      const freshDiscovery = new DiscoveryState();
      const previewEngine = new CombinationEngine(registry, freshDiscovery, categoryMap);

      const gem = createGem('a', 'fire_damage', 5, 'legendary');
      expect(gem.combinable).toBe(false);

      const other = createGem('b', 'cold_damage', 1, 'common');
      const preview = previewEngine.previewCombine(gem, other);
      expect(preview).toBeNull();
    });
  });
});
