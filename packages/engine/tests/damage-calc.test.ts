import { describe, it, expect } from 'vitest';
import { calculatePhysicalDamage, calculateElementalDamage, calculateDOTDamage } from '../src/duel/damage-calc.js';
import { createEmptyDerivedStats } from '../src/types/derived-stats.js';
import type { DerivedStats } from '../src/types/derived-stats.js';
import type { ActiveDOT } from '../src/types/combat.js';

function makeStats(overrides: Partial<DerivedStats> = {}): DerivedStats {
  return { ...createEmptyDerivedStats(), ...overrides };
}

describe('calculatePhysicalDamage', () => {
  it('deals full damage with 0% armor', () => {
    const attacker = makeStats({ physicalDamage: 100 });
    const defender = makeStats({ armor: 0 });
    expect(calculatePhysicalDamage(attacker, defender)).toBe(100);
  });

  it('reduces damage by 50% with 50% armor and 0% penetration', () => {
    const attacker = makeStats({ physicalDamage: 100, armorPenetration: 0 });
    const defender = makeStats({ armor: 50 }); // 50 = 50%
    expect(calculatePhysicalDamage(attacker, defender)).toBe(50);
  });

  it('armor penetration bypasses armor', () => {
    const attacker = makeStats({ physicalDamage: 100, armorPenetration: 50 }); // 50 = 50%
    const defender = makeStats({ armor: 50 }); // 50 = 50%
    expect(calculatePhysicalDamage(attacker, defender)).toBe(75);
  });

  it('100% armor with 0% penetration deals zero damage', () => {
    const attacker = makeStats({ physicalDamage: 100, armorPenetration: 0 });
    const defender = makeStats({ armor: 100 }); // 100 = 100%
    expect(calculatePhysicalDamage(attacker, defender)).toBe(0);
  });

  it('100% armor with 100% penetration deals full damage', () => {
    const attacker = makeStats({ physicalDamage: 100, armorPenetration: 100 }); // 100 = 100%
    const defender = makeStats({ armor: 100 }); // 100 = 100%
    expect(calculatePhysicalDamage(attacker, defender)).toBe(100);
  });

  it('never returns negative damage', () => {
    const attacker = makeStats({ physicalDamage: 0 });
    const defender = makeStats({ armor: 100 });
    expect(calculatePhysicalDamage(attacker, defender)).toBeGreaterThanOrEqual(0);
  });

  it('zero physical damage returns zero', () => {
    const attacker = makeStats({ physicalDamage: 0 });
    const defender = makeStats({ armor: 0 });
    expect(calculatePhysicalDamage(attacker, defender)).toBe(0);
  });
});

describe('calculateElementalDamage', () => {
  it('deals full elemental damage with 0% resistance', () => {
    const attacker = makeStats({
      elementalDamage: { fire: 100, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const defender = makeStats();
    expect(calculateElementalDamage(attacker, defender, 'fire')).toBe(100);
  });

  it('reduces damage by resistance', () => {
    const attacker = makeStats({
      elementalDamage: { fire: 100, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const defender = makeStats({
      resistances: { fire: 50, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 }, // 50 = 50%
    });
    expect(calculateElementalDamage(attacker, defender, 'fire')).toBe(50);
  });

  it('elemental penetration bypasses resistance', () => {
    const attacker = makeStats({
      elementalDamage: { fire: 100, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
      elementalPenetration: 50, // 50 = 50%
    });
    const defender = makeStats({
      resistances: { fire: 80, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 }, // 80 = 80%
    });
    expect(calculateElementalDamage(attacker, defender, 'fire')).toBe(60);
  });

  it('returns 0 for elements with no damage', () => {
    const attacker = makeStats();
    const defender = makeStats();
    expect(calculateElementalDamage(attacker, defender, 'fire')).toBe(0);
  });

  it('90% resistance with 0% penetration leaves 10% damage', () => {
    const attacker = makeStats({
      elementalDamage: { fire: 100, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const defender = makeStats({
      resistances: { fire: 90, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 }, // 90 = 90%
    });
    expect(calculateElementalDamage(attacker, defender, 'fire')).toBeCloseTo(10);
  });

  it('each element is independent', () => {
    const attacker = makeStats({
      elementalDamage: { fire: 100, cold: 50, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const defender = makeStats({
      resistances: { fire: 50, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 }, // 50 = 50%
    });
    expect(calculateElementalDamage(attacker, defender, 'fire')).toBe(50);
    expect(calculateElementalDamage(attacker, defender, 'cold')).toBe(50);
  });
});

describe('calculateDOTDamage', () => {
  it('deals base DOT damage with no resistance', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 10, remainingTicks: 30, sourceAffixId: 'test', stacks: 1,
    };
    const defender = makeStats();
    const attacker = makeStats({ dotMultiplier: 100 }); // 100 = 1.0x
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(10);
  });

  it('stacks multiply DOT damage', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 10, remainingTicks: 30, sourceAffixId: 'test', stacks: 3,
    };
    const defender = makeStats();
    const attacker = makeStats({ dotMultiplier: 100 }); // 100 = 1.0x
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(30);
  });

  it('resistance reduces DOT damage', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 100, remainingTicks: 30, sourceAffixId: 'test', stacks: 1,
    };
    const defender = makeStats({
      resistances: { fire: 50, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 }, // 50 = 50%
    });
    const attacker = makeStats({ dotMultiplier: 100, elementalPenetration: 0 }); // 100 = 1.0x
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(50);
  });

  it('dotMultiplier scales DOT damage', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 10, remainingTicks: 30, sourceAffixId: 'test', stacks: 1,
    };
    const defender = makeStats();
    const attacker = makeStats({ dotMultiplier: 200 }); // 200 = 2.0x
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(20);
  });

  it('full resistance results in zero DOT damage', () => {
    const dot: ActiveDOT = {
      element: 'poison', damagePerTick: 50, remainingTicks: 30, sourceAffixId: 'test', stacks: 1,
    };
    const defender = makeStats({
      resistances: { fire: 0, cold: 0, lightning: 0, poison: 100, shadow: 0, chaos: 0 }, // 100 = 100%
    });
    const attacker = makeStats({ dotMultiplier: 100, elementalPenetration: 0 }); // 100 = 1.0x
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(0);
  });

  it('elemental penetration bypasses DOT resistance', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 100, remainingTicks: 30, sourceAffixId: 'test', stacks: 1,
    };
    const defender = makeStats({
      resistances: { fire: 80, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 }, // 80 = 80%
    });
    const attacker = makeStats({ dotMultiplier: 100, elementalPenetration: 50 }); // 100 = 1.0x, 50 = 50%
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(60);
  });

  it('combined stacks, resistance, penetration, and multiplier', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 10, remainingTicks: 30, sourceAffixId: 'test', stacks: 2,
    };
    const defender = makeStats({
      resistances: { fire: 50, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 }, // 50 = 50%
    });
    const attacker = makeStats({ dotMultiplier: 150, elementalPenetration: 50 }); // 150 = 1.5x, 50 = 50%
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(22.5);
  });
});
