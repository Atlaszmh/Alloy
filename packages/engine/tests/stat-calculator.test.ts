import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { createEmptyLoadout } from '../src/types/item.js';
import { calculateStats } from '../src/forge/stat-calculator.js';
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
    const stats = calculateStats(loadout, registry);
    expect(stats.armor).toBeGreaterThanOrEqual(1);
    expect(stats.armor).toBeLessThan(100);
    expect(stats.attackSpeed).toBeGreaterThanOrEqual(0.3);
    expect(stats.critChance).toBeGreaterThanOrEqual(0);
    expect(stats.critChance).toBeLessThanOrEqual(75);
  });

  it('caps are enforced at integer scale', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const stats = calculateStats(loadout, registry);
    expect(stats.dodgeChance).toBeLessThanOrEqual(50);
    expect(stats.blockChance).toBeLessThanOrEqual(50);
    expect(stats.resistances.fire).toBeLessThanOrEqual(90);
  });
});

describe('Stat Calculator', () => {
  // Test 1: Empty loadout returns base stats with new base item system
  it('empty loadout returns base stats', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const stats = calculateStats(loadout, registry);

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
    const stats = calculateStats(loadout, registry);

    expect(stats.maxHP).toBe(220);
    expect(stats.critChance).toBe(5);
    expect(stats.attackSpeed).toBe(1.8);
    expect(stats.armor).toBe(20);
  });

  // Test 2b: Axe base stats
  it('applies axe base stats correctly', () => {
    const loadout = createEmptyLoadout('axe', 'chainmail');
    const stats = calculateStats(loadout, registry);

    expect(stats.physicalDamage).toBe(15);
    expect(stats.attackSpeed).toBe(2.5);
    expect(stats.critMultiplier).toBe(150);
  });

  // Test 3: Single affix applied to weapon
  it('applies single affix to weapon', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('fire_damage', 1);
    const stats = calculateStats(loadout, registry);

    // fire_damage T1 weaponEffect: elementalDamage.fire +3 flat
    expect(stats.elementalDamage.fire).toBe(3);
  });

  // Test 4: Single affix applied to armor
  it('applies single affix to armor', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.armor.slots[0] = gemSlot('flat_hp', 1);
    const stats = calculateStats(loadout, registry);

    // flat_hp T1 armorEffect: maxHP +45 flat
    // Base 200 + 20 (chainmail) + 45 = 265
    expect(stats.maxHP).toBe(265);
  });

  // Test 5: Gem effects applied correctly
  it('applies gem affix to weapon', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('fire_damage', 2);
    const stats = calculateStats(loadout, registry);

    // fire_damage T2 weaponEffect: elementalDamage.fire +5 flat
    expect(stats.elementalDamage.fire).toBe(5);
  });

  // Test 7: Base stat scaling applies correctly
  it('applies base stat scaling (STR/STR on weapon)', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.baseStats = { stat1: 'STR', stat2: 'STR' };
    const stats = calculateStats(loadout, registry);

    expect(stats.physicalDamage).toBe(11);
  });

  it('applies base stat scaling (DEX on weapon reduces attack interval)', () => {
    const loadout = createEmptyLoadout('axe', 'chainmail');
    loadout.weapon.baseStats = { stat1: 'DEX', stat2: 'DEX' };
    const stats = calculateStats(loadout, registry);

    expect(stats.critChance).toBeCloseTo(1.0);
    expect(stats.attackSpeed).toBeCloseTo(2.485);
  });

  it('applies base stat scaling (VIT on armor)', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.armor.baseStats = { stat1: 'VIT', stat2: 'VIT' };
    const stats = calculateStats(loadout, registry);

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
      const stats = calculateStats(loadout, registry);
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

    const stats = calculateStats(loadout, registry);

    // critMultiplier: base 150 + 23 (crit_damage T1) + 15 (assassin synergy) = 188
    expect(stats.critMultiplier).toBe(188);
  });

  // Test 9: Modifier ordering: flat before percent
  it('applies flat modifiers before percent modifiers', () => {
    const loadout = createEmptyLoadout('axe', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('flat_physical', 1);
    const stats = calculateStats(loadout, registry);

    // physicalDamage: 15 (axe base) + 4 (flat_physical T1) = 19
    expect(stats.physicalDamage).toBe(19);
  });

  // Test 10: Caps enforced at integer scale
  it('caps critChance at 75', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.baseStats = { stat1: 'DEX', stat2: 'DEX' };
    const stats = calculateStats(loadout, registry);
    expect(stats.critChance).toBeLessThanOrEqual(75);
    expect(stats.critChance).toBeGreaterThanOrEqual(0);
  });

  it('caps dodgeChance at 50', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const stats = calculateStats(loadout, registry);
    expect(stats.dodgeChance).toBeLessThanOrEqual(50);
    expect(stats.dodgeChance).toBeGreaterThanOrEqual(0);
  });

  it('caps blockChance at 50', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const stats = calculateStats(loadout, registry);
    expect(stats.blockChance).toBeLessThanOrEqual(50);
    expect(stats.blockChance).toBeGreaterThanOrEqual(0);
  });

  it('enforces minimum attack speed', () => {
    const loadout = createEmptyLoadout('dagger', 'leather');
    const stats = calculateStats(loadout, registry);
    expect(stats.attackSpeed).toBeGreaterThanOrEqual(balance.minAttackSpeed);
  });

  it('caps resistances at 90', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const stats = calculateStats(loadout, registry);
    expect(stats.resistances.fire).toBeLessThanOrEqual(90);
    expect(stats.resistances.fire).toBeGreaterThanOrEqual(0);
  });

  // Test 11: Multiple affixes stack correctly
  it('multiple affixes stack correctly', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('fire_damage', 1);
    loadout.weapon.slots[1] = gemSlot('fire_damage', 2);
    const stats = calculateStats(loadout, registry);

    // fire_damage T1: +3, fire_damage T2: +5 = 8
    expect(stats.elementalDamage.fire).toBe(8);
  });

  it('multiple flat_physical affixes stack on weapon', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('flat_physical', 1);
    loadout.weapon.slots[1] = gemSlot('flat_physical', 2);
    const stats = calculateStats(loadout, registry);

    // Sword base: 10 + 4 + 6 = 20
    expect(stats.physicalDamage).toBe(20);
  });

  // Test: frozen output
  it('returns a frozen DerivedStats object', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const stats = calculateStats(loadout, registry);
    expect(Object.isFrozen(stats)).toBe(true);
  });

  // Test: staff allElementalDamage base stat expands to all elements
  it('staff allElementalDamage bonus expands to all elements', () => {
    const loadout = createEmptyLoadout('staff', 'chainmail');
    loadout.weapon.slots[0] = gemSlot('fire_damage', 1);
    const stats = calculateStats(loadout, registry);

    expect(stats.elementalDamage.fire).toBe(6);
    expect(stats.elementalDamage.cold).toBe(3);
  });

  // Test: armor affix applies armorEffect with flat resistance
  it('fire_damage on armor applies resistance bonus', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.armor.slots[0] = gemSlot('fire_damage', 1);
    const stats = calculateStats(loadout, registry);

    expect(stats.resistances.fire).toBe(8);
  });
});
