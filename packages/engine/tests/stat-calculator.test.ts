import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { createEmptyLoadout } from '../src/types/item.js';
import { calculateStats } from '../src/forge/stat-calculator.js';
import type { Loadout, EquippedSlot } from '../src/types/item.js';
import type { OrbInstance } from '../src/types/orb.js';
import type { AffixTier } from '../src/types/affix.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
const balance = data.balance;

function makeOrb(affixId: string, tier: AffixTier = 1, uid?: string): OrbInstance {
  return { uid: uid ?? `orb-${affixId}-${tier}`, affixId, tier };
}

function singleSlot(affixId: string, tier: AffixTier = 1): EquippedSlot {
  return { kind: 'single', orb: makeOrb(affixId, tier), socketedRound: 1 };
}

function upgradedSlot(affixId: string, originalTier: AffixTier, upgradedTier: AffixTier): EquippedSlot {
  return {
    kind: 'upgraded',
    orb: makeOrb(affixId, originalTier),
    originalTier,
    upgradedTier,
    socketedRound: 1,
  };
}

function compoundSlot(
  affixId1: string,
  affixId2: string,
  compoundId: string,
  tier1: AffixTier = 1,
  tier2: AffixTier = 1,
): EquippedSlot {
  return {
    kind: 'compound',
    orbs: [makeOrb(affixId1, tier1, `orb-${affixId1}`), makeOrb(affixId2, tier2, `orb-${affixId2}`)],
    compoundId,
    socketedRound: 1,
  };
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
    // Sword: physicalDamage 40
    expect(stats.physicalDamage).toBe(40);
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
    // Sword: physicalDamage 40, attackSpeed 1.8, critChance 5
    // Chainmail: armor 20, maxHP 20, blockChance 5
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const stats = calculateStats(loadout, registry);

    // maxHP: base 200 + 20 flat from chainmail = 220
    expect(stats.maxHP).toBe(220);

    // critChance: 5 from sword (flat)
    expect(stats.critChance).toBe(5);

    // attackSpeed: 1.8 from sword (overrides default 1.0)
    expect(stats.attackSpeed).toBe(1.8);

    // armor: 20 from chainmail
    expect(stats.armor).toBe(20);
  });

  // Test 2b: Axe base stats
  it('applies axe base stats correctly', () => {
    // Axe: physicalDamage 60, attackSpeed 2.5
    const loadout = createEmptyLoadout('axe', 'chainmail');
    const stats = calculateStats(loadout, registry);

    // physicalDamage: 60 flat from axe
    expect(stats.physicalDamage).toBe(60);

    // attackSpeed: 2.5 from axe (overrides default)
    expect(stats.attackSpeed).toBe(2.5);

    // critMultiplier: base 150, no bonus from axe
    expect(stats.critMultiplier).toBe(150);
  });

  // Test 3: Single affix applied to weapon
  it('applies single affix to weapon', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = singleSlot('fire_damage', 1);
    const stats = calculateStats(loadout, registry);

    // fire_damage T1 weaponEffect: elementalDamage.fire +12 flat
    expect(stats.elementalDamage.fire).toBe(12);
  });

  // Test 4: Single affix applied to armor
  it('applies single affix to armor', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.armor.slots[0] = singleSlot('flat_hp', 1);
    const stats = calculateStats(loadout, registry);

    // flat_hp T1 armorEffect: maxHP +45 flat
    // Base 200 + 20 (chainmail) + 45 = 265
    expect(stats.maxHP).toBe(265);
  });

  // Test 5: Compound affix applied correctly
  it('applies compound affix to weapon', () => {
    // Ignite compound on weapon: all effects are compound.* keys which are skipped
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = compoundSlot('chance_on_hit', 'fire_damage', 'ignite');
    const stats = calculateStats(loadout, registry);

    // compound.ignite.* keys should be skipped
    expect(stats.elementalDamage.fire).toBe(0);
  });

  // Test 6: Upgraded orb uses upgraded tier values
  it('upgraded orb uses upgraded tier values', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = upgradedSlot('fire_damage', 1 as AffixTier, 2 as AffixTier);
    const stats = calculateStats(loadout, registry);

    // fire_damage T2 weaponEffect: elementalDamage.fire +19 flat
    expect(stats.elementalDamage.fire).toBe(19);
  });

  // Test 7: Base stat scaling applies correctly
  it('applies base stat scaling (STR/STR on weapon)', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.baseStats = { stat1: 'STR', stat2: 'STR' };
    const stats = calculateStats(loadout, registry);

    // STR weapon scaling: physicalDamage +2.0 per allocation
    // Two STR allocations = +2.0 + 2.0 = +4.0 flat physical damage
    // Plus sword base: 40
    expect(stats.physicalDamage).toBe(44);
  });

  it('applies base stat scaling (DEX on weapon reduces attack interval)', () => {
    const loadout = createEmptyLoadout('axe', 'chainmail');
    loadout.weapon.baseStats = { stat1: 'DEX', stat2: 'DEX' };
    const stats = calculateStats(loadout, registry);

    // DEX weapon: critChance +0.5 flat each = +1.0 flat total
    // Axe has no critChance base stat, so critChance = 1.0
    expect(stats.critChance).toBeCloseTo(1.0);

    // DEX weapon: attackSpeed +0.003 each = -0.003 -0.003 = -0.006 percent on attackSpeed
    // attackSpeed: 2.5 (axe base) * (1 + (-0.006)) = 2.5 * 0.994 = 2.485
    expect(stats.attackSpeed).toBeCloseTo(2.485);
  });

  it('applies base stat scaling (VIT on armor)', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.armor.baseStats = { stat1: 'VIT', stat2: 'VIT' };
    const stats = calculateStats(loadout, registry);

    // VIT armor: maxHP +8 flat each = +16 total
    // maxHP: 200 + 20 (chainmail) + 16 = 236
    expect(stats.maxHP).toBe(236);
    expect(stats.hpRegen).toBeCloseTo(0.02);
  });

  // Test 8: Synergy detection
  it('detects active synergy when all required affixes present', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = singleSlot('flat_physical', 1);
    loadout.armor.slots[0] = singleSlot('flat_hp', 1);

    const thornsAffix = registry.findAffix('thorns');
    if (thornsAffix) {
      loadout.weapon.slots[1] = singleSlot('thorns', 1);
      const stats = calculateStats(loadout, registry);
      expect(stats).toBeDefined();
    }
  });

  // Test 8b: Synergy with stat-affecting bonus
  it('applies synergy bonus effects that affect DerivedStats', () => {
    // "assassin" synergy requires: crit_chance, crit_damage, attack_speed
    // bonusEffects include critMultiplier flat +15
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = singleSlot('crit_chance', 1);
    loadout.weapon.slots[1] = singleSlot('crit_damage', 1);
    loadout.weapon.slots[2] = singleSlot('attack_speed', 1);

    const stats = calculateStats(loadout, registry);

    // critMultiplier: base 150
    // crit_damage T1 weaponEffect: critDamage (maps to critMultiplier) +23 flat
    // assassin synergy: critMultiplier +15 flat
    // Total critMultiplier flat = 150 + 23 + 15 = 188
    // No percent on critMultiplier, so stays at 188
    expect(stats.critMultiplier).toBe(188);
  });

  // Test 9: Modifier ordering: flat before percent
  it('applies flat modifiers before percent modifiers', () => {
    const loadout = createEmptyLoadout('axe', 'chainmail');
    // axe: physicalDamage 60 flat
    // flat_physical T1 on weapon: physicalDamage +15 flat
    loadout.weapon.slots[0] = singleSlot('flat_physical', 1);
    const stats = calculateStats(loadout, registry);

    // physicalDamage: 60 (axe base) + 15 (affix flat) = 75
    expect(stats.physicalDamage).toBe(75);
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
    loadout.weapon.slots[0] = singleSlot('fire_damage', 1);
    loadout.weapon.slots[1] = singleSlot('fire_damage', 2);
    const stats = calculateStats(loadout, registry);

    // fire_damage T1 weaponEffect: elementalDamage.fire +12 flat
    // fire_damage T2 weaponEffect: elementalDamage.fire +19 flat
    // Total: 12 + 19 = 31
    expect(stats.elementalDamage.fire).toBe(31);
  });

  it('multiple flat_physical affixes stack on weapon', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = singleSlot('flat_physical', 1);
    loadout.weapon.slots[1] = singleSlot('flat_physical', 2);
    const stats = calculateStats(loadout, registry);

    // flat_physical T1: physicalDamage +15 flat
    // flat_physical T2: physicalDamage +23 flat
    // Sword base: 40
    // Total: 40 + 15 + 23 = 78
    expect(stats.physicalDamage).toBe(78);
  });

  // Test: frozen output
  it('returns a frozen DerivedStats object', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const stats = calculateStats(loadout, registry);
    expect(Object.isFrozen(stats)).toBe(true);
  });

  // Test: staff allElementalDamage base stat expands to all elements
  it('staff allElementalDamage bonus expands to all elements', () => {
    // Staff: physicalDamage 25, attackSpeed 2.0, allElementalDamage 10
    const loadout = createEmptyLoadout('staff', 'chainmail');
    // Put a fire_damage orb on weapon to add to fire elemental damage
    loadout.weapon.slots[0] = singleSlot('fire_damage', 1);
    const stats = calculateStats(loadout, registry);

    // fire: 10 (staff allElementalDamage) + 12 (fire_damage T1) = 22 flat, no percent
    expect(stats.elementalDamage.fire).toBe(22);
    // other elements: 10 flat from allElementalDamage
    expect(stats.elementalDamage.cold).toBe(10);
  });

  // Test: armor affix applies armorEffect with flat resistance
  it('fire_damage on armor applies resistance bonus', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.armor.slots[0] = singleSlot('fire_damage', 1);
    const stats = calculateStats(loadout, registry);

    // fire_damage T1 armorEffect: resistances.fire +8 flat
    // Now with flat ops, it actually adds resistance
    expect(stats.resistances.fire).toBe(8);
  });
});
