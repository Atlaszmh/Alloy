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
    const defender = makeStats({ armor: 0.5 });
    expect(calculatePhysicalDamage(attacker, defender)).toBe(50);
  });

  it('armor penetration bypasses armor', () => {
    const attacker = makeStats({ physicalDamage: 100, armorPenetration: 0.5 });
    const defender = makeStats({ armor: 0.5 });
    expect(calculatePhysicalDamage(attacker, defender)).toBe(75);
  });

  it('100% armor with 0% penetration deals zero damage', () => {
    const attacker = makeStats({ physicalDamage: 100, armorPenetration: 0 });
    const defender = makeStats({ armor: 1.0 });
    expect(calculatePhysicalDamage(attacker, defender)).toBe(0);
  });

  it('100% armor with 100% penetration deals full damage', () => {
    const attacker = makeStats({ physicalDamage: 100, armorPenetration: 1.0 });
    const defender = makeStats({ armor: 1.0 });
    expect(calculatePhysicalDamage(attacker, defender)).toBe(100);
  });

  it('never returns negative damage', () => {
    const attacker = makeStats({ physicalDamage: 0 });
    const defender = makeStats({ armor: 1.0 });
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
      resistances: { fire: 0.5, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    expect(calculateElementalDamage(attacker, defender, 'fire')).toBe(50);
  });

  it('elemental penetration bypasses resistance', () => {
    const attacker = makeStats({
      elementalDamage: { fire: 100, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
      elementalPenetration: 0.5,
    });
    const defender = makeStats({
      resistances: { fire: 0.8, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
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
      resistances: { fire: 0.9, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    expect(calculateElementalDamage(attacker, defender, 'fire')).toBeCloseTo(10);
  });

  it('each element is independent', () => {
    const attacker = makeStats({
      elementalDamage: { fire: 100, cold: 50, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const defender = makeStats({
      resistances: { fire: 0.5, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
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
    const attacker = makeStats({ dotMultiplier: 1 });
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(10);
  });

  it('stacks multiply DOT damage', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 10, remainingTicks: 30, sourceAffixId: 'test', stacks: 3,
    };
    const defender = makeStats();
    const attacker = makeStats({ dotMultiplier: 1 });
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(30);
  });

  it('resistance reduces DOT damage', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 100, remainingTicks: 30, sourceAffixId: 'test', stacks: 1,
    };
    const defender = makeStats({
      resistances: { fire: 0.5, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const attacker = makeStats({ dotMultiplier: 1, elementalPenetration: 0 });
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(50);
  });

  it('dotMultiplier scales DOT damage', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 10, remainingTicks: 30, sourceAffixId: 'test', stacks: 1,
    };
    const defender = makeStats();
    const attacker = makeStats({ dotMultiplier: 2.0 });
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(20);
  });

  it('full resistance results in zero DOT damage', () => {
    const dot: ActiveDOT = {
      element: 'poison', damagePerTick: 50, remainingTicks: 30, sourceAffixId: 'test', stacks: 1,
    };
    const defender = makeStats({
      resistances: { fire: 0, cold: 0, lightning: 0, poison: 1.0, shadow: 0, chaos: 0 },
    });
    const attacker = makeStats({ dotMultiplier: 1, elementalPenetration: 0 });
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(0);
  });

  it('elemental penetration bypasses DOT resistance', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 100, remainingTicks: 30, sourceAffixId: 'test', stacks: 1,
    };
    const defender = makeStats({
      resistances: { fire: 0.8, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const attacker = makeStats({ dotMultiplier: 1, elementalPenetration: 0.5 });
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(60);
  });

  it('combined stacks, resistance, penetration, and multiplier', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 10, remainingTicks: 30, sourceAffixId: 'test', stacks: 2,
    };
    const defender = makeStats({
      resistances: { fire: 0.5, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const attacker = makeStats({ dotMultiplier: 1.5, elementalPenetration: 0.5 });
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(22.5);
  });
});
