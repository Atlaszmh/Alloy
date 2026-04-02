import { describe, it, expect } from 'vitest';
import { calculateAttackBreakdown, calculateDOTBreakdown } from '../src/duel/damage-calc.js';
import { createEmptyDerivedStats } from '../src/types/derived-stats.js';
import type { DerivedStats } from '../src/types/derived-stats.js';

function makeStats(overrides: Partial<DerivedStats> = {}): DerivedStats {
  return { ...createEmptyDerivedStats(), ...overrides };
}

describe('calculateAttackBreakdown', () => {
  it('physical breakdown with armor (40 dmg, 20 armor → 32 net)', () => {
    const attacker = makeStats({ physicalDamage: 40 });
    const defender = makeStats({ armor: 20 }); // 20 pts → 20% reduction
    const bd = calculateAttackBreakdown(attacker, defender, false, false, 0);

    expect(bd.dodged).toBe(false);
    expect(bd.physical.raw).toBe(40);
    expect(bd.physical.effectiveArmor).toBe(20);
    expect(bd.physical.reductionPct).toBe(20);
    expect(bd.physical.mitigated).toBe(8); // Math.round(40 * 20 / 100) = 8
    expect(bd.physical.net).toBe(32);
    expect(bd.totalNet).toBe(32);
  });

  it('armor penetration reduces effective armor (20 armor - 10 pen = 10 effective)', () => {
    const attacker = makeStats({ physicalDamage: 100, armorPenetration: 10 });
    const defender = makeStats({ armor: 20 });
    const bd = calculateAttackBreakdown(attacker, defender, false, false, 0);

    expect(bd.physical.effectiveArmor).toBe(10);
    expect(bd.physical.reductionPct).toBe(10);
    expect(bd.physical.mitigated).toBe(10); // Math.round(100 * 10 / 100) = 10
    expect(bd.physical.net).toBe(90);
  });

  it('armor penetration cannot push effective armor below 0', () => {
    const attacker = makeStats({ physicalDamage: 100, armorPenetration: 50 });
    const defender = makeStats({ armor: 20 });
    const bd = calculateAttackBreakdown(attacker, defender, false, false, 0);

    expect(bd.physical.effectiveArmor).toBe(0);
    expect(bd.physical.reductionPct).toBe(0);
    expect(bd.physical.net).toBe(100);
  });

  it('caps reduction at 90%', () => {
    const attacker = makeStats({ physicalDamage: 100 });
    const defender = makeStats({ armor: 95 }); // 95 pts, but capped at 90% reduction
    const bd = calculateAttackBreakdown(attacker, defender, false, false, 0);

    expect(bd.physical.effectiveArmor).toBe(95);
    expect(bd.physical.reductionPct).toBe(90);
    expect(bd.physical.mitigated).toBe(90); // Math.round(100 * 90 / 100) = 90
    expect(bd.physical.net).toBe(10);
  });

  it('elemental damage with resistance (30 fire, 15 resist → 25 net)', () => {
    const attacker = makeStats({
      elementalDamage: { fire: 30, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const defender = makeStats({
      resistances: { fire: 15, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const bd = calculateAttackBreakdown(attacker, defender, false, false, 0);

    expect(bd.elemental.fire).toBeDefined();
    expect(bd.elemental.fire!.raw).toBe(30);
    expect(bd.elemental.fire!.effectiveResist).toBe(15);
    expect(bd.elemental.fire!.reductionPct).toBe(15);
    expect(bd.elemental.fire!.mitigated).toBe(5); // Math.round(30 * 15 / 100) = 4.5 → 5
    expect(bd.elemental.fire!.net).toBe(25);
  });

  it('crit multiplier scales raw damage (critMultiplier: 200 = 2.0x)', () => {
    const attacker = makeStats({ physicalDamage: 50, critMultiplier: 200 });
    const defender = makeStats();
    const bd = calculateAttackBreakdown(attacker, defender, true, false, 0);

    expect(bd.isCrit).toBe(true);
    expect(bd.critMultiplier).toBe(2.0);
    expect(bd.physical.raw).toBe(100); // 50 * 2.0
    expect(bd.totalNet).toBe(100);
  });

  it('dodge returns zero breakdown', () => {
    const attacker = makeStats({ physicalDamage: 100 });
    const defender = makeStats();
    const bd = calculateAttackBreakdown(attacker, defender, false, true, 0);

    expect(bd.dodged).toBe(true);
    expect(bd.totalNet).toBe(0);
    expect(bd.physical.raw).toBe(0);
    expect(bd.physical.net).toBe(0);
  });

  it('block amount is subtracted from net damage', () => {
    const attacker = makeStats({ physicalDamage: 50 });
    const defender = makeStats();
    const bd = calculateAttackBreakdown(attacker, defender, false, false, 20);

    expect(bd.blocked).toBe(20);
    expect(bd.totalNet).toBe(30);
  });

  it('block cannot exceed net damage (no negative)', () => {
    const attacker = makeStats({ physicalDamage: 10 });
    const defender = makeStats();
    const bd = calculateAttackBreakdown(attacker, defender, false, false, 50);

    expect(bd.blocked).toBe(10);
    expect(bd.totalNet).toBe(0);
  });

  it('mixed physical + elemental calculates independently', () => {
    const attacker = makeStats({
      physicalDamage: 40,
      elementalDamage: { fire: 20, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const defender = makeStats({
      armor: 10,
      resistances: { fire: 20, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const bd = calculateAttackBreakdown(attacker, defender, false, false, 0);

    // Physical: 40 raw, 10% reduction → mitigated 4 → net 36
    expect(bd.physical.net).toBe(36);
    // Fire: 20 raw, 20% reduction → mitigated 4 → net 16
    expect(bd.elemental.fire!.net).toBe(16);
    expect(bd.totalRaw).toBe(60);
    expect(bd.totalNet).toBe(52);
  });

  it('no crit multiplier field when not a crit', () => {
    const attacker = makeStats({ physicalDamage: 50 });
    const defender = makeStats();
    const bd = calculateAttackBreakdown(attacker, defender, false, false, 0);

    expect(bd.isCrit).toBe(false);
    expect(bd.critMultiplier).toBeUndefined();
  });

  it('zero damage returns zero breakdown', () => {
    const attacker = makeStats({ physicalDamage: 0 });
    const defender = makeStats({ armor: 50 });
    const bd = calculateAttackBreakdown(attacker, defender, false, false, 0);

    expect(bd.totalNet).toBe(0);
    expect(bd.physical.net).toBe(0);
  });
});

describe('calculateDOTBreakdown', () => {
  it('basic DOT with no resistance', () => {
    const bd = calculateDOTBreakdown('fire', 10, 1, makeStats(), 0, 100);

    expect(bd.element).toBe('fire');
    expect(bd.damagePerTick).toBe(10);
    expect(bd.stacks).toBe(1);
    expect(bd.rawTotal).toBe(10);
    expect(bd.netDamage).toBe(10);
  });

  it('stacks multiply DOT damage', () => {
    const bd = calculateDOTBreakdown('fire', 10, 3, makeStats(), 0, 100);

    expect(bd.rawTotal).toBe(30);
    expect(bd.netDamage).toBe(30);
  });

  it('resistance reduces DOT damage', () => {
    const defender = makeStats({
      resistances: { fire: 50, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const bd = calculateDOTBreakdown('fire', 100, 1, defender, 0, 100);

    expect(bd.rawTotal).toBe(100);
    expect(bd.effectiveResist).toBe(50);
    expect(bd.reductionPct).toBe(50);
    expect(bd.netDamage).toBe(50);
  });

  it('elemental penetration reduces effective resist', () => {
    const defender = makeStats({
      resistances: { fire: 30, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const bd = calculateDOTBreakdown('fire', 100, 1, defender, 20, 100);

    expect(bd.effectiveResist).toBe(10);
    expect(bd.reductionPct).toBe(10);
    expect(bd.netDamage).toBe(90);
  });

  it('dotMultiplier scales raw damage (200 = 2.0x)', () => {
    const bd = calculateDOTBreakdown('fire', 10, 1, makeStats(), 0, 200);

    expect(bd.rawTotal).toBe(20);
    expect(bd.netDamage).toBe(20);
  });

  it('caps DOT resist reduction at 90%', () => {
    const defender = makeStats({
      resistances: { fire: 95, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const bd = calculateDOTBreakdown('fire', 100, 1, defender, 0, 100);

    expect(bd.effectiveResist).toBe(95);
    expect(bd.reductionPct).toBe(90);
    expect(bd.netDamage).toBe(10);
  });

  it('combined stacks, resistance, penetration, and multiplier', () => {
    const defender = makeStats({
      resistances: { fire: 40, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    // 10 dpt * 2 stacks * 1.5x = 30 raw
    // 40 resist - 10 pen = 30 effective → 30% reduction
    // mitigated = Math.round(30 * 30 / 100) = 9
    // net = 21
    const bd = calculateDOTBreakdown('fire', 10, 2, defender, 10, 150);

    expect(bd.rawTotal).toBe(30);
    expect(bd.effectiveResist).toBe(30);
    expect(bd.reductionPct).toBe(30);
    expect(bd.mitigated).toBeUndefined; // mitigated is not on the interface, netDamage is
    expect(bd.netDamage).toBe(21);
  });
});
