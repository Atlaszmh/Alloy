import { describe, it, expect } from 'vitest';
import { describeCompoundEffect } from '../describe-compound-effect.js';
import type { CompoundEffectShape } from '@alloy/engine';

describe('describeCompoundEffect', () => {
  it('describes compound_dot in human-readable form', () => {
    const result = describeCompoundEffect({
      kind: 'compound_dot', element: 'fire', dpsPerTier: 3, duration: 12, tickInterval: 1.0, dotMultiplier: 2.0,
    } satisfies CompoundEffectShape, 2);
    expect(result.toLowerCase()).toContain('fire');
    expect(result).toMatch(/12/); // duration mentioned
    expect(result).toMatch(/6/); // dpsPerTier × tier = 6
  });

  it('describes apply_slow', () => {
    const r = describeCompoundEffect({ kind: 'apply_slow', multiplier: 1.5, duration: 4 }, 1);
    expect(r.toLowerCase()).toContain('slow');
    expect(r).toMatch(/50%/);
  });

  it('describes gain_barrier with isPercent + duration', () => {
    const r = describeCompoundEffect({ kind: 'gain_barrier', amount: 0.10, isPercent: true, duration: 30 }, 1);
    expect(r).toMatch(/10%/);
    expect(r).toMatch(/30/);
  });

  it('describes stun', () => {
    const r = describeCompoundEffect({ kind: 'stun', duration: 1.0 }, 1);
    expect(r.toLowerCase()).toContain('stun');
    expect(r).toMatch(/1/);
  });

  it('describes heal flat amount with tier scaling', () => {
    const r = describeCompoundEffect({ kind: 'heal', amountPerTier: 8, isPercent: false }, 3);
    expect(r.toLowerCase()).toContain('heal');
    expect(r).toMatch(/24/); // 8 × 3
  });

  it('describes bonus_damage with tier scaling', () => {
    const r = describeCompoundEffect({ kind: 'bonus_damage', damageType: 'fire', amountPerTier: 12 }, 2);
    expect(r.toLowerCase()).toContain('fire');
    expect(r).toMatch(/24/); // 12 × 2
  });

  it('describes bonus_damage_scaled', () => {
    const r = describeCompoundEffect({ kind: 'bonus_damage_scaled', damageType: 'physical', multiplier: 1.5 }, 1);
    expect(r.toLowerCase()).toContain('echo');
    expect(r).toMatch(/150%/);
  });

  it('describes reflect_damage', () => {
    const r = describeCompoundEffect({ kind: 'reflect_damage', multiplier: 2.0, duration: 6 }, 1);
    expect(r.toLowerCase()).toContain('reflect');
    expect(r).toMatch(/200%/);
  });

  it('describes damage_current_hp', () => {
    const r = describeCompoundEffect({ kind: 'damage_current_hp', fraction: 0.05 }, 1);
    expect(r).toMatch(/5%/);
    expect(r.toLowerCase()).toContain('current hp');
  });

  it('describes reduce_max_hp', () => {
    const r = describeCompoundEffect({ kind: 'reduce_max_hp', fraction: 0.03, duration: 15 }, 1);
    expect(r.toLowerCase()).toContain('max hp');
    expect(r).toMatch(/3%/);
    expect(r).toMatch(/15/);
  });

  it('describes stat_buff_add with tier scaling', () => {
    const r = describeCompoundEffect({ kind: 'stat_buff_add', stat: 'lifestealPercent', valuePerTier: 10, duration: 12 }, 2);
    expect(r).toMatch(/lifestealPercent|lifesteal/i);
    expect(r).toMatch(/20/); // 10 × 2
    expect(r).toMatch(/12/);
  });

  it('describes stat_buff_mul', () => {
    const r = describeCompoundEffect({ kind: 'stat_buff_mul', stat: 'attackSpeed', multiplier: 0.5, duration: 8 }, 1);
    expect(r).toMatch(/attackSpeed|attack/i);
    expect(r).toMatch(/-50%/);
  });

  it('describes apply_dot', () => {
    const r = describeCompoundEffect({ kind: 'apply_dot', element: 'poison', dpsPerTier: 5, duration: 4 }, 2);
    expect(r.toLowerCase()).toContain('poison');
    expect(r).toMatch(/10/); // 5 × 2
  });

  it('describes amplify_dot_element', () => {
    const r = describeCompoundEffect({ kind: 'amplify_dot_element', element: 'poison', stackMultiplier: 2.0, tickMultiplier: 1.5, duration: 8 }, 1);
    expect(r.toLowerCase()).toContain('poison');
    expect(r.toLowerCase()).toContain('amplifier');
  });
});
