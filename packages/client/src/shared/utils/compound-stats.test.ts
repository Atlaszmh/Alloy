import { describe, it, expect } from 'vitest';
import { formatCompoundStat, getStatColorClass } from './compound-stats';

describe('formatCompoundStat', () => {
  it('formats chance suffix', () => {
    expect(formatCompoundStat('compound.ignite.chance', 15)).toBe('15% proc chance');
  });

  it('formats dotMultiplier suffix', () => {
    expect(formatCompoundStat('compound.ignite.dotMultiplier', 2)).toBe('2x DOT multiplier');
  });

  it('formats duration suffix', () => {
    expect(formatCompoundStat('compound.freeze.duration', 3)).toBe('3s duration');
  });

  it('formats chainDamage suffix', () => {
    expect(formatCompoundStat('compound.shock.chainDamage', 120)).toBe('+120 chain damage');
  });

  it('falls back for unknown compound suffix', () => {
    expect(formatCompoundStat('compound.fire.unknown', 5)).toBe('+5 unknown');
  });

  it('handles non-compound keys', () => {
    expect(formatCompoundStat('fireDamage', 10)).toBe('+10 fireDamage');
  });
});

describe('getStatColorClass', () => {
  it('returns fire color for ignite', () => {
    expect(getStatColorClass('compound.ignite.chance')).toBe('text-fire');
  });

  it('returns cold color for freeze', () => {
    expect(getStatColorClass('compound.freeze.duration')).toBe('text-cold');
  });

  it('returns default for unknown element', () => {
    expect(getStatColorClass('compound.unknown.chance')).toBe('text-surface-300');
  });

  it('returns default for non-compound key', () => {
    expect(getStatColorClass('fireDamage')).toBe('text-surface-300');
  });
});
