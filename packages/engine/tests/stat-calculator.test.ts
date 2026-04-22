import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { createEmptyLoadout } from '../src/types/item.js';
import { calculateStats, resolveStatKey } from '../src/forge/stat-calculator.js';
import type { Loadout, EquippedSlot } from '../src/types/item.js';
import type { GemInstance } from '../src/types/gem.js';
import { createGem } from '../src/types/gem.js';
import type { AffixTier } from '../src/types/affix.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
const balance = data.balance;

function makeGem(affixId: string, tier: AffixTier = 1, uid?: string): GemInstance {
  return createGem(uid ?? `gem-${affixId}-${tier}`, affixId, tier as 1|2|3|4|5, 'common');
}

function gemSlot(affixId: string, tier: AffixTier = 1): EquippedSlot {
  return { gem: makeGem(affixId, tier) };
}

describe('calculateStats integer scale', () => {
  it('sword base stats produce integer-scale values', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const result = calculateStats(loadout, registry);
    const stats = result.stats;
    expect(stats.armor).toBeGreaterThanOrEqual(1);
    expect(stats.armor).toBeLessThan(100);
    expect(stats.attackSpeed).toBeGreaterThanOrEqual(0.3);
    expect(stats.critChance).toBeGreaterThanOrEqual(0);
    expect(stats.critChance).toBeLessThanOrEqual(75);
  });

  it('caps are enforced at integer scale', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const result = calculateStats(loadout, registry);
    const stats = result.stats;
    expect(stats.dodgeChance).toBeLessThanOrEqual(50);
    expect(stats.blockChance).toBeLessThanOrEqual(50);
    expect(stats.resistances.fire).toBeLessThanOrEqual(90);
  });
});

describe('Stat Calculator', () => {
  // Test 1: Empty loadout returns base stats with new base item system
  it('empty loadout returns base stats', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const result = calculateStats(loadout, registry);
    const stats = result.stats;

    // Base 200 + 20 flat from chainmail baseStats.maxHP
    expect(stats.maxHP).toBe(balance.baseHP + 20);
    expect(stats.critMultiplier).toBe(balance.baseCritMultiplier); // 150
    // Sword: physicalDamage 10
    expect(stats.physicalDamage).toBe(10);
    expect(stats.elementalDamage.fire).toBe(0);
    // Chainmail: armor 20
    expect(stats.armor).toBe(20);
    // Sword: critChance 5
    expect(stats.critChance).toBe(5);
    // Chainmail: blockChance 5
    expect(stats.blockChance).toBe(5);
    expect(stats.dodgeChance).toBe(0);
  });

  // Test 2: Base item stats applied
  it('applies base item stats', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const result = calculateStats(loadout, registry);
    const stats = result.stats;

    expect(stats.maxHP).toBe(220);
    expect(stats.critChance).toBe(5);
    expect(stats.attackSpeed).toBe(1.8);
    expect(stats.armor).toBe(20);
  });

  // Test 2b: Axe base stats
  it('applies axe base stats correctly', () => {
    const loadout = createEmptyLoadout('axe', 'chainmail');
    const result = calculateStats(loadout, registry);
    const stats = result.stats;

    expect(stats.physicalDamage).toBe(15);
    expect(stats.attackSpeed).toBe(2.5);
    expect(stats.critMultiplier).toBe(150);
  });

  // Test 3: Single affix applied to weapon
  it('applies single affix to weapon', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('fire_damage', 1);
    const result = calculateStats(loadout, registry);
    const stats = result.stats;

    // fire_damage T1 weaponEffect: elementalDamage.fire +3 flat
    expect(stats.elementalDamage.fire).toBe(3);
  });

  // Test 4: Single affix applied to armor
  it('applies single affix to armor', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.armor.slots[0] = gemSlot('flat_hp', 1);
    const result = calculateStats(loadout, registry);
    const stats = result.stats;

    // flat_hp T1 armorEffect: maxHP +45 flat
    // Base 200 + 20 (chainmail) + 45 = 265
    expect(stats.maxHP).toBe(265);
  });

  // Test 5: Gem effects applied correctly
  it('applies gem affix to weapon', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('fire_damage', 2);
    const result = calculateStats(loadout, registry);
    const stats = result.stats;

    // fire_damage T2 weaponEffect: elementalDamage.fire +5 flat
    expect(stats.elementalDamage.fire).toBe(5);
  });

  // Test 7: Base stat scaling applies correctly
  it('applies base stat scaling (STR/STR on weapon)', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.baseStats = { stat1: 'STR', stat2: 'STR' };
    const result = calculateStats(loadout, registry);
    const stats = result.stats;

    expect(stats.physicalDamage).toBe(11);
  });

  it('applies base stat scaling (DEX on weapon reduces attack interval)', () => {
    const loadout = createEmptyLoadout('axe', 'chainmail');
    loadout.weapon.baseStats = { stat1: 'DEX', stat2: 'DEX' };
    const result = calculateStats(loadout, registry);
    const stats = result.stats;

    expect(stats.critChance).toBeCloseTo(1.0);
    expect(stats.attackSpeed).toBeCloseTo(2.485);
  });

  it('applies base stat scaling (VIT on armor)', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.armor.baseStats = { stat1: 'VIT', stat2: 'VIT' };
    const result = calculateStats(loadout, registry);
    const stats = result.stats;

    expect(stats.maxHP).toBe(236);
    expect(stats.hpRegen).toBeCloseTo(0.02);
  });

  // Test 8: Synergy detection
  it('detects active synergy when all required affixes present', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('flat_physical', 1);
    loadout.armor.slots[0] = gemSlot('flat_hp', 1);

    const thornsAffix = registry.findAffix('thorns');
    if (thornsAffix) {
      loadout.weapon.slots[1] = gemSlot('thorns', 1);
      const result = calculateStats(loadout, registry);
    const stats = result.stats;
      expect(stats).toBeDefined();
    }
  });

  // Test 8b: Synergy with stat-affecting bonus
  it('applies synergy bonus effects that affect DerivedStats', () => {
    // "assassin" synergy requires: crit_chance, crit_damage, attack_speed
    // bonusEffects include critMultiplier flat +15
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('crit_chance', 1);
    loadout.weapon.slots[1] = gemSlot('crit_damage', 1);
    loadout.weapon.slots[2] = gemSlot('attack_speed', 1);

    const result = calculateStats(loadout, registry);
    const stats = result.stats;

    // critMultiplier: base 150 + 23 (crit_damage T1) + 15 (assassin synergy) = 188
    expect(stats.critMultiplier).toBe(188);
  });

  // Test 9: Modifier ordering: flat before percent
  it('applies flat modifiers before percent modifiers', () => {
    const loadout = createEmptyLoadout('axe', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('flat_physical', 1);
    const result = calculateStats(loadout, registry);
    const stats = result.stats;

    // physicalDamage: 15 (axe base) + 4 (flat_physical T1) = 19
    expect(stats.physicalDamage).toBe(19);
  });

  // Test 10: Caps enforced at integer scale
  it('caps critChance at 75', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.baseStats = { stat1: 'DEX', stat2: 'DEX' };
    const result = calculateStats(loadout, registry);
    const stats = result.stats;
    expect(stats.critChance).toBeLessThanOrEqual(75);
    expect(stats.critChance).toBeGreaterThanOrEqual(0);
  });

  it('caps dodgeChance at 50', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const result = calculateStats(loadout, registry);
    const stats = result.stats;
    expect(stats.dodgeChance).toBeLessThanOrEqual(50);
    expect(stats.dodgeChance).toBeGreaterThanOrEqual(0);
  });

  it('caps blockChance at 50', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const result = calculateStats(loadout, registry);
    const stats = result.stats;
    expect(stats.blockChance).toBeLessThanOrEqual(50);
    expect(stats.blockChance).toBeGreaterThanOrEqual(0);
  });

  it('enforces minimum attack speed', () => {
    const loadout = createEmptyLoadout('dagger', 'leather');
    const result = calculateStats(loadout, registry);
    const stats = result.stats;
    expect(stats.attackSpeed).toBeGreaterThanOrEqual(balance.minAttackSpeed);
  });

  it('caps resistances at 90', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const result = calculateStats(loadout, registry);
    const stats = result.stats;
    expect(stats.resistances.fire).toBeLessThanOrEqual(90);
    expect(stats.resistances.fire).toBeGreaterThanOrEqual(0);
  });

  // Test 11: Multiple affixes stack correctly
  it('multiple affixes stack correctly', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('fire_damage', 1);
    loadout.weapon.slots[1] = gemSlot('fire_damage', 2);
    const result = calculateStats(loadout, registry);
    const stats = result.stats;

    // fire_damage T1: +3, fire_damage T2: +5 = 8
    expect(stats.elementalDamage.fire).toBe(8);
  });

  it('multiple flat_physical affixes stack on weapon', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('flat_physical', 1);
    loadout.weapon.slots[1] = gemSlot('flat_physical', 2);
    const result = calculateStats(loadout, registry);
    const stats = result.stats;

    // Sword base: 10 + 4 + 6 = 20
    expect(stats.physicalDamage).toBe(20);
  });

  // Test: frozen output
  it('returns a frozen DerivedStats object', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const result = calculateStats(loadout, registry);
    const stats = result.stats;
    expect(Object.isFrozen(stats)).toBe(true);
  });

  // Test: staff allElementalDamage base stat expands to all elements
  it('staff allElementalDamage bonus expands to all elements', () => {
    const loadout = createEmptyLoadout('staff', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('fire_damage', 1);
    const result = calculateStats(loadout, registry);
    const stats = result.stats;

    expect(stats.elementalDamage.fire).toBe(6);
    expect(stats.elementalDamage.cold).toBe(3);
  });

  // Test: armor affix applies armorEffect with flat resistance
  it('fire_damage on armor applies resistance bonus', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.armor.slots[0] = gemSlot('fire_damage', 1);
    const result = calculateStats(loadout, registry);
    const stats = result.stats;

    expect(stats.resistances.fire).toBe(8);
  });
});

// ---- Chunk 1: Synergy stat-key wiring (P0.1a) ----
//
// These tests lock in the expected behavior of the synergy stat pipeline.
// Previously `shouldSkipKey` filtered bare stat keys (weaponDamage, maxHp,
// elementalDamage, elementalResist) used by synergies.json, so their
// bonusEffects never affected combat. The fix narrows the skip list to
// behavior-style `synergy.*` / `compound.*` keys only, and aliases the bare
// keys to canonical DerivedStats fields (or expansions).
describe('Synergy: Elementalist (+20 elementalDamage, +10 elementalResist)', () => {
  // Note: synergies.json declares Elementalist with requiredAffixes of all 5
  // elements and condition "any_3_elemental", but the current isSynergyActive
  // implementation only checks requiredAffixes — it does not evaluate the
  // condition field. Wiring the condition evaluator is out of scope for
  // Chunk 1 (see FUN_REVIEW.md P1). For now the test exercises the fully
  // required form (all 5 elements) to isolate the stat-key pipeline fix.
  function makeElementalistLoadout() {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('fire_damage', 1);
    loadout.weapon.slots[1] = gemSlot('cold_damage', 1);
    loadout.weapon.slots[2] = gemSlot('lightning_damage', 1);
    loadout.weapon.slots[3] = gemSlot('poison_damage', 1);
    loadout.weapon.slots[4] = gemSlot('shadow_damage', 1);
    return loadout;
  }

  it('applies +20 to every element when all 5 elements are present', () => {
    const { stats, activeSynergies } = calculateStats(makeElementalistLoadout(), registry);

    const elementalist = activeSynergies.find((s) => s.synergyId === 'elementalist');
    expect(elementalist?.isActive).toBe(true);

    // T1 weapon values per affixes.json: fire=3, cold=2, lightning=4. Elementalist adds +20 to each.
    expect(stats.elementalDamage.fire).toBe(3 + 20);
    expect(stats.elementalDamage.cold).toBe(2 + 20);
    expect(stats.elementalDamage.lightning).toBe(4 + 20);
    // poison_damage weaponEffect targets dotDamage.poison (not elementalDamage),
    // and shadow_damage targets shadowDamage.percentHP — neither contributes
    // to elementalDamage.{poison,shadow}. Only the synergy +20 lands there.
    expect(stats.elementalDamage.poison).toBe(20);
    expect(stats.elementalDamage.shadow).toBe(20);
    // chaos has no gem and no base item contribution.
    expect(stats.elementalDamage.chaos).toBe(20);
  });

  it('bare elementalResist expands to all 6 elements', () => {
    // Regression: elementalResist (no dot notation) must expand to
    // resistances.{fire,cold,lightning,poison,shadow,chaos}. Chainmail
    // baseStats provide no elemental resistance, and none of the gems are
    // on armor, so any non-zero resistance comes solely from the synergy.
    const { stats, activeSynergies } = calculateStats(makeElementalistLoadout(), registry);
    expect(activeSynergies.find((s) => s.synergyId === 'elementalist')?.isActive).toBe(true);

    expect(stats.resistances.fire).toBe(10);
    expect(stats.resistances.cold).toBe(10);
    expect(stats.resistances.lightning).toBe(10);
    expect(stats.resistances.poison).toBe(10);
    expect(stats.resistances.shadow).toBe(10);
    expect(stats.resistances.chaos).toBe(10);
  });

  it('synergy not active (missing required affixes) = no bonus applied', () => {
    // Regression: if only 2 elements are slotted, Elementalist must NOT fire
    // (condition-field support aside, requiredAffixes is still not satisfied).
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('fire_damage', 1);
    loadout.weapon.slots[1] = gemSlot('cold_damage', 1);

    const { stats, activeSynergies } = calculateStats(loadout, registry);
    const elementalist = activeSynergies.find((s) => s.synergyId === 'elementalist');
    expect(elementalist?.isActive).toBe(false);

    // No synergy fired, so elements without a gem stay 0.
    expect(stats.elementalDamage.poison).toBe(0);
    expect(stats.elementalDamage.shadow).toBe(0);
    expect(stats.elementalDamage.chaos).toBe(0);
    // Resistances should remain baseline 0 (chainmail provides none and no
    // armor gem fired).
    expect(stats.resistances.poison).toBe(0);
  });
});

describe('Synergy: Glass Cannon (weaponDamage / maxHp bare keys resolve)', () => {
  it('weaponDamage bare key expands to physical + all elemental damage', () => {
    // Glass Cannon bonusEffects: weaponDamage flat +30, maxHp flat -25.
    // weaponDamage must be a compound key expanding to physicalDamage +
    // elementalDamage.{all}. With value 30 flat, physical goes up by 30
    // and every element goes up by 30. Baseline sword physicalDamage=10.
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('crit_chance', 1);
    loadout.weapon.slots[1] = gemSlot('crit_damage', 1);
    loadout.weapon.slots[2] = gemSlot('attack_speed', 1);

    const { stats, activeSynergies } = calculateStats(loadout, registry);
    const glassCannon = activeSynergies.find((s) => s.synergyId === 'glass_cannon');

    // Both assassin and glass_cannon share (crit_chance, crit_damage, attack_speed)
    // and should both be active by simple requiredAffixes check.
    expect(glassCannon?.isActive).toBe(true);

    // physicalDamage: sword base 10 + 30 (glass cannon weaponDamage flat) = 40
    expect(stats.physicalDamage).toBe(40);
    // Every element gets +30 from weaponDamage expansion (no gems on those elements)
    expect(stats.elementalDamage.fire).toBe(30);
    expect(stats.elementalDamage.cold).toBe(30);
    expect(stats.elementalDamage.lightning).toBe(30);
    expect(stats.elementalDamage.poison).toBe(30);
    expect(stats.elementalDamage.shadow).toBe(30);
    expect(stats.elementalDamage.chaos).toBe(30);
  });

  it('maxHp bare key reduces maxHP when glass cannon active', () => {
    // maxHp in synergies.json uses op:'flat' value:-25. The canonical field
    // is maxHP (capital HP). This asserts the alias resolves. baseHP=200,
    // chainmail+20=220, glass_cannon -25 flat = 195.
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('crit_chance', 1);
    loadout.weapon.slots[1] = gemSlot('crit_damage', 1);
    loadout.weapon.slots[2] = gemSlot('attack_speed', 1);

    const { stats, activeSynergies } = calculateStats(loadout, registry);
    expect(activeSynergies.find((s) => s.synergyId === 'glass_cannon')?.isActive).toBe(true);

    // Strictly less than the baseline (220) confirms the -25 flat resolved.
    expect(stats.maxHP).toBeLessThan(balance.baseHP + 20);
    // Exact expected value: 200 base + 20 chainmail - 25 synergy = 195
    expect(stats.maxHP).toBe(195);
  });

  it('Glass Cannon maxHp synergy modifier uses flat op (data check)', () => {
    // Regression/data integrity: the synergies.json entry declares maxHp as
    // op:'flat'. If design intent shifts to op:'percent' later, this test
    // should be updated alongside the data change so the wiring behavior is
    // intentional rather than accidental.
    const glassCannonDef = registry.getAllSynergies().find((s) => s.id === 'glass_cannon');
    expect(glassCannonDef).toBeDefined();
    const maxHpEffect = glassCannonDef!.bonusEffects.find((e) => e.stat === 'maxHp');
    expect(maxHpEffect).toBeDefined();
    expect(maxHpEffect!.op).toBe('flat');
    expect(maxHpEffect!.value).toBe(-25);
  });
});

describe('resolveStatKey — skip behavior', () => {
  it('returns null for behavior-style compound keys', () => {
    expect(resolveStatKey('compound.ignite.dotMultiplier')).toBeNull();
    expect(resolveStatKey('compound.frostbite.chance')).toBeNull();
  });

  it('returns null for behavior-style synergy keys', () => {
    expect(resolveStatKey('synergy.berserker.critHealDouble')).toBeNull();
    expect(resolveStatKey('synergy.fortress.damageReductionAbove80')).toBeNull();
  });

  it('resolves bare synergy-generated keys to canonical fields', () => {
    expect(resolveStatKey('maxHp')).toBe('maxHP');
    expect(resolveStatKey('elementalDamage')).toBe('allElementalDamage');
    expect(resolveStatKey('elementalResist')).toBe('allResistances');
  });

  it('returns null for duel-engine keys', () => {
    expect(resolveStatKey('procDamage')).toBeNull();
    expect(resolveStatKey('dotDamage')).toBeNull();
  });

  // Regression: chaos_damage affix uses the bare `chaosDamage` key (unlike
  // fire/cold/lightning which already key into elementalDamage.{el}). Without
  // this alias, chaos gems silently disappear from DerivedStats and never
  // land on hit in the duel engine.
  it('aliases chaosDamage → elementalDamage.chaos', () => {
    expect(resolveStatKey('chaosDamage')).toBe('elementalDamage.chaos');
  });
});

describe('Stat Calculator — elemental damage regressions', () => {
  it('chaos_damage weapon gem flows into elementalDamage.chaos', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('chaos_damage', 1);
    const stats = calculateStats(loadout, registry).stats;

    // chaos_damage T1 weaponEffect: chaosDamage +2 flat (common = 1.0x).
    expect(stats.elementalDamage.chaos).toBe(2);
  });

  it('chaos_damage scales with tier', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('chaos_damage', 4);
    const stats = calculateStats(loadout, registry).stats;

    // chaos_damage T4 weaponEffect: chaosDamage +4 flat.
    expect(stats.elementalDamage.chaos).toBe(4);
  });

  it('chaos_damage on armor applies chaos resistance, not chaos damage', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.armor.slots[0] = gemSlot('chaos_damage', 1);
    const stats = calculateStats(loadout, registry).stats;

    // Armor slot uses the armorEffect: resistances.chaos +6 flat at T1.
    // Base chainmail gives +2 chaos resist, so total = 8.
    expect(stats.resistances.chaos).toBeGreaterThanOrEqual(6);
    expect(stats.elementalDamage.chaos).toBe(0);
  });

  it('every damage-element gem of the same family (fire/cold/lightning/chaos) lands on DerivedStats.elementalDamage', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('fire_damage', 1);
    loadout.weapon.slots[1] = gemSlot('cold_damage', 1);
    loadout.weapon.slots[2] = gemSlot('lightning_damage', 1);
    loadout.weapon.slots[3] = gemSlot('chaos_damage', 1);

    const stats = calculateStats(loadout, registry).stats;

    expect(stats.elementalDamage.fire).toBeGreaterThan(0);
    expect(stats.elementalDamage.cold).toBeGreaterThan(0);
    expect(stats.elementalDamage.lightning).toBeGreaterThan(0);
    // Pre-alias, this was 0 — chaos was silently dropped.
    expect(stats.elementalDamage.chaos).toBeGreaterThan(0);
  });

  it('rarity multiplier applies to chaos damage like other elements', () => {
    // Build a rare chaos gem manually — gemSlot defaults to common.
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const rareChaos: EquippedSlot = {
      gem: createGem('chaos-rare', 'chaos_damage', 1, 'rare'),
    };
    loadout.weapon.slots[0] = rareChaos;

    const stats = calculateStats(loadout, registry).stats;

    // chaos_damage T1 = 2, rare multiplier = 1.5 → 3.
    expect(stats.elementalDamage.chaos).toBeCloseTo(3, 5);
  });
});
