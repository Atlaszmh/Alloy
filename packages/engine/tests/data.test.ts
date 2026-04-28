import { describe, it, expect } from 'vitest';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { RecipesSchema } from '../src/data/schemas.js';
import { CombinationEngine } from '../src/combine/combination-engine.js';
import { DiscoveryState } from '../src/combine/discovery-state.js';
import { createGem } from '../src/types/gem.js';

describe('Data Loading & Validation', () => {
  it('should load and validate all data files without errors', () => {
    expect(() => loadAndValidateData()).not.toThrow();
  });

  it('should load the correct number of affixes', () => {
    const data = loadAndValidateData();
    expect(data.affixes.length).toBeGreaterThanOrEqual(32);
  });

  it('should load the correct number of combinations', () => {
    const data = loadAndValidateData();
    expect(data.combinations.length).toBeGreaterThanOrEqual(29);
  });

  it('should load the correct number of synergies', () => {
    const data = loadAndValidateData();
    expect(data.synergies.length).toBeGreaterThanOrEqual(14);
  });

  it('should load the correct number of base items', () => {
    const data = loadAndValidateData();
    const weapons = data.baseItems.filter((b) => b.type === 'weapon');
    const armors = data.baseItems.filter((b) => b.type === 'armor');
    expect(weapons.length).toBeGreaterThanOrEqual(7);
    expect(armors.length).toBeGreaterThanOrEqual(7);
  });

  it('should load balance config with correct base HP', () => {
    const data = loadAndValidateData();
    expect(data.balance.baseHP).toBe(200);
    expect(data.balance.fluxPerRound).toEqual([8, 4, 2]);
    expect(data.balance.maxDuelSeconds).toBe(100);
    expect(data.balance.minAttackSpeed).toBe(0.3);
  });
});

describe('DataRegistry', () => {
  const data = loadAndValidateData();
  const registry = new DataRegistry(
    data.affixes,
    data.combinations,
    data.synergies,
    data.baseItems,
    data.balance,
  );

  describe('Affix Lookups', () => {
    it('should find an affix by ID', () => {
      const fire = registry.getAffix('fire_damage');
      expect(fire.name).toBe('Fire Damage');
      expect(fire.category).toBe('offensive');
      expect(fire.tags).toContain('fire');
    });

    it('should throw for unknown affix ID', () => {
      expect(() => registry.getAffix('nonexistent')).toThrow('Affix not found');
    });

    it('should find affixes by tag', () => {
      const elemental = registry.getAffixesByTag('elemental');
      expect(elemental.length).toBeGreaterThan(0);
      for (const affix of elemental) {
        expect(affix.tags).toContain('elemental');
      }
    });

    it('should find affixes by category', () => {
      const triggers = registry.getAffixesByCategory('trigger');
      expect(triggers.length).toBeGreaterThanOrEqual(5);
      for (const t of triggers) {
        expect(t.category).toBe('trigger');
      }
    });

    it('should return all affixes', () => {
      expect(registry.getAllAffixes().length).toBeGreaterThanOrEqual(32);
    });

    it('should have description fields on all affixes', () => {
      for (const affix of registry.getAllAffixes()) {
        expect(typeof affix.description).toBe('string');
        expect(affix.description.length).toBeGreaterThan(0);
        expect(typeof affix.weaponFlavorText).toBe('string');
        expect(typeof affix.armorFlavorText).toBe('string');
        expect(
          affix.weaponFlavorText.length > 0 || affix.armorFlavorText.length > 0,
          `Affix "${affix.id}" has no flavor text on either side`
        ).toBe(true);
      }
    });

    it('should have 4 tiers per affix', () => {
      for (const affix of registry.getAllAffixes()) {
        const tiers = Object.keys(affix.tiers);
        expect(tiers.length).toBe(4);
        expect(tiers.sort()).toEqual(['1', '2', '3', '4']);
      }
    });
  });

  describe('Combination Lookups', () => {
    it('should find a combination by component pair', () => {
      const ignite = registry.getCombination('chance_on_hit', 'fire_damage');
      expect(ignite).not.toBeNull();
      expect(ignite!.id).toBe('ignite');
    });

    it('should be order-independent', () => {
      const a = registry.getCombination('chance_on_hit', 'fire_damage');
      const b = registry.getCombination('fire_damage', 'chance_on_hit');
      expect(a).toEqual(b);
    });

    it('should return null for invalid combination', () => {
      const result = registry.getCombination('flat_physical', 'flat_hp');
      expect(result).toBeNull();
    });

    it('should find a combination by ID', () => {
      const frostbite = registry.getCombinationById('frostbite');
      expect(frostbite).not.toBeNull();
      expect(frostbite!.name).toBe('Frostbite');
    });

    it('should return all combinations', () => {
      expect(registry.getAllCombinations().length).toBeGreaterThanOrEqual(29);
    });

    it('resolves Combustion via getCombination(chance_on_crit, fire_damage)', () => {
      const combo = registry.getCombination('chance_on_crit', 'fire_damage');
      expect(combo?.id).toBe('combustion');
    });

    it('resolves Thornfrost via getCombination(retribution_aura, cold_damage)', () => {
      const combo = registry.getCombination('retribution_aura', 'cold_damage');
      expect(combo?.id).toBe('thornfrost');
    });

    it('resolves Soul Eclipse via getCombination(soul_rend, soul_siphon)', () => {
      const combo = registry.getCombination('soul_rend', 'soul_siphon');
      expect(combo?.id).toBe('soul_eclipse');
    });

    it('should have description fields on all combinations', () => {
      for (const combo of registry.getAllCombinations()) {
        expect(typeof combo.description).toBe('string');
        expect(combo.description.length).toBeGreaterThan(0);
        expect(typeof combo.weaponFlavorText).toBe('string');
        expect(typeof combo.armorFlavorText).toBe('string');
        expect(
          combo.weaponFlavorText.length > 0 || combo.armorFlavorText.length > 0,
          `Combination "${combo.id}" has no flavor text on either side`
        ).toBe(true);
      }
    });
  });

  describe('Synergy Lookups', () => {
    it('should find a synergy by ID', () => {
      const assassin = registry.getSynergy('assassin');
      expect(assassin.name).toBe('Assassin');
      expect(assassin.requiredAffixes).toContain('crit_chance');
    });

    it('should throw for unknown synergy ID', () => {
      expect(() => registry.getSynergy('nonexistent')).toThrow('Synergy not found');
    });

    it('should return all synergies', () => {
      expect(registry.getAllSynergies().length).toBeGreaterThanOrEqual(14);
    });
  });

  describe('Base Item Lookups', () => {
    it('should find a base item by ID', () => {
      const sword = registry.getBaseItem('sword');
      expect(sword.type).toBe('weapon');
      expect(sword.name).toBe('Sword');
      expect(sword.baseStats.physicalDamage).toBe(10);
    });

    it('should throw for unknown base item ID', () => {
      expect(() => registry.getBaseItem('nonexistent')).toThrow('Base item not found');
    });

    it('should filter by type', () => {
      const weapons = registry.getBaseItemsByType('weapon');
      const armors = registry.getBaseItemsByType('armor');
      expect(weapons.length).toBeGreaterThanOrEqual(7);
      expect(armors.length).toBeGreaterThanOrEqual(7);
      for (const w of weapons) expect(w.type).toBe('weapon');
      for (const a of armors) expect(a.type).toBe('armor');
    });
  });

  describe('Balance Config', () => {
    it('should return balance config', () => {
      const balance = registry.getBalance();
      expect(balance.baseHP).toBe(200);
      expect(balance.fluxCosts.assignOrb).toBe(1);
      expect(balance.fluxCosts.combineOrbs).toBe(2);
    });
  });

  describe('RecipesSchema — signature3', () => {
    it('RecipesSchema accepts signature3 with 3 components', () => {
      const ternary = [{
        id: 'test_triple',
        name: 'Test Triple',
        type: 'signature3',
        components: [
          { kind: 'affix', id: 'fire_damage' },
          { kind: 'affix', id: 'cold_damage' },
          { kind: 'affix', id: 'lightning_damage' },
        ],
        outputAffixId: 'test_triple',
        outputBonusEffects: [],
        maxDepthContribution: 1,
        tags: [],
      }];
      expect(() => RecipesSchema.parse(ternary)).not.toThrow();
    });

    it('RecipesSchema rejects signature3 with only 2 components', () => {
      const bad = [{
        id: 'bad', name: 'Bad', type: 'signature3',
        components: [
          { kind: 'affix', id: 'fire_damage' },
          { kind: 'affix', id: 'cold_damage' },
        ],
        outputAffixId: 'bad', outputBonusEffects: [],
        maxDepthContribution: 1, tags: [],
      }];
      expect(() => RecipesSchema.parse(bad)).toThrow();
    });

    it('RecipesSchema rejects signature with 3 components', () => {
      const bad = [{
        id: 'bad', name: 'Bad', type: 'signature',
        components: [
          { kind: 'affix', id: 'a' },
          { kind: 'affix', id: 'b' },
          { kind: 'affix', id: 'c' },
        ],
        outputAffixId: 'bad', outputBonusEffects: [],
        maxDepthContribution: 1, tags: [],
      }];
      expect(() => RecipesSchema.parse(bad)).toThrow();
    });
  });

  describe('DataRegistry — ternary compound lookup', () => {
    const ternaryData = loadAndValidateData();
    const ternaryRegistry = new DataRegistry(
      ternaryData.affixes, ternaryData.combinations, ternaryData.synergies,
      ternaryData.baseItems, ternaryData.balance, ternaryData.recipes,
    );

    it('getTernaryCombination returns null when no matching 3-component compound exists', () => {
      expect(ternaryRegistry.getTernaryCombination('x', 'y', 'z')).toBeNull();
    });

    it('combine3 with live data resolves Meltdown', () => {
      const a = createGem('a', 'fire_damage', 2, 'rare');
      const b = createGem('b', 'cold_damage', 2, 'rare');
      const c = createGem('c', 'lightning_damage', 2, 'rare');
      const recipeRegistry = ternaryRegistry.getRecipeRegistry();
      const map: Record<string, string> = {};
      for (const affix of ternaryRegistry.getAllAffixes()) map[affix.id] = affix.category;
      const engine = new CombinationEngine(recipeRegistry, new DiscoveryState(), map);
      const result = engine.combine3(a, b, c, 'out', 'a');
      expect(result.recipeId).toBe('meltdown');
      expect(result.gem.affixId).toBe('meltdown');
    });

    it('getTernaryCombination resolves Meltdown metadata', () => {
      const combo = ternaryRegistry.getTernaryCombination('fire_damage', 'cold_damage', 'lightning_damage');
      expect(combo?.id).toBe('meltdown');
    });

    const EXPECTED_TERNARIES: Array<[string, string, string, string]> = [
      ['fire_damage', 'cold_damage', 'lightning_damage', 'meltdown'],
      ['crit_chance', 'crit_damage', 'attack_speed', 'warriors_edge'],
      ['armor_rating', 'block_chance', 'flat_hp', 'bastion'],
      ['lifesteal', 'hp_regen', 'flat_hp', 'blood_pact'],
      ['ignite', 'chance_on_crit', 'fire_damage', 'detonator'],
      ['frostbite', 'chance_on_block', 'cold_damage', 'frost_nova'],
      ['static_discharge', 'attack_speed', 'lightning_damage', 'thunderbrand'],
      ['envenom', 'poison_damage', 'chance_on_hit', 'plague_carrier'],
      ['desperation', 'blood_frenzy', 'attack_speed', 'oathbound_fury'],
      ['immolation', 'reactive_shield', 'fire_damage', 'phoenix_embers'],
      ['frostbite', 'fortress', 'cold_damage', 'crystal_aegis'],
      ['ignite', 'storm_of_flames', 'thermal_shock', 'worldfire'],
    ];

    describe.each(EXPECTED_TERNARIES)(
      'ternary combination %s + %s + %s → %s',
      (a, b, c, expectedId) => {
        it('resolves via getTernaryCombination', () => {
          expect(ternaryRegistry.getTernaryCombination(a, b, c)?.id).toBe(expectedId);
        });
      },
    );
  });

  describe('Referential Integrity', () => {
    it('all combination component IDs reference valid affix or compound IDs', () => {
      const affixIds = new Set(registry.getAllAffixes().map(a => a.id));
      // Compound outputs (e.g. retribution_aura, soul_rend) are valid component IDs
      // for higher-order recipes like Thornfrost and Soul Eclipse.
      const compoundIds = new Set(registry.getAllCombinations().map(c => c.id));
      const validIds = new Set([...affixIds, ...compoundIds]);
      const combinations = registry.getAllCombinations();
      for (const combo of combinations) {
        for (const componentId of combo.components) {
          expect(
            validIds.has(componentId),
            `Combination "${combo.id}" references unknown affix or compound "${componentId}"`
          ).toBe(true);
        }
      }
    });

    it('all recipe components reference valid affix or recipe IDs', () => {
      // recipes.json uses typed components ({kind:"affix"|"recipe", id}). This test
      // guards the kind:"recipe" path that combinations.json referential test can't see.
      const affixIds = new Set(registry.getAllAffixes().map(a => a.id));
      const recipeRegistry = registry.getRecipeRegistry();
      const recipeIds = new Set(recipeRegistry.getAll().map(r => r.id));
      for (const recipe of recipeRegistry.getAll()) {
        if (!recipe.components) continue;
        for (const comp of recipe.components) {
          const validSet = comp.kind === 'affix' ? affixIds : recipeIds;
          expect(
            validSet.has(comp.id),
            `Recipe "${recipe.id}" references unknown ${comp.kind} component "${comp.id}"`
          ).toBe(true);
        }
      }
    });

    it('all synergy required affixes reference valid affix IDs', () => {
      const affixIds = new Set(registry.getAllAffixes().map(a => a.id));
      const synergies = registry.getAllSynergies();
      for (const syn of synergies) {
        for (const reqId of syn.requiredAffixes) {
          expect(
            affixIds.has(reqId),
            `Synergy "${syn.id}" references unknown affix "${reqId}"`
          ).toBe(true);
        }
      }
    });
  });
});
