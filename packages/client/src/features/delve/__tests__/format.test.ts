import { describe, it, expect } from 'vitest';
import { formatNumber, formatDelta, formatStat, legendaryText } from '../format';
import { getDelveRegistry } from '../registry';

const registry = getDelveRegistry();

describe('delve format helpers', () => {
  it('abbreviates large numbers', () => {
    expect(formatNumber(950)).toBe('950');
    expect(formatNumber(12_400)).toBe('12.4k');
    expect(formatNumber(3_000_000)).toBe('3M');
    expect(formatNumber(250_000)).toBe('250k');
    expect(formatNumber(7.6)).toBe('8');
  });

  it('formats deltas with sign and never shows a bare 0 for small changes', () => {
    expect(formatDelta(0.123)).toBe('+12%');
    expect(formatDelta(-0.04)).toBe('−4%');
    expect(formatDelta(0.001)).toBe('+<1%');
    expect(formatDelta(0)).toBe('±0%');
  });

  it('formats flat and percentage stats using data labels', () => {
    expect(formatStat(registry, 'armor', 42)).toBe('+42 Armor');
    expect(formatStat(registry, 'critChance', 5)).toBe('+5% Crit Chance');
    expect(formatStat(registry, 'lifesteal', 2.5)).toBe('+2.5% Lifesteal');
  });

  it('fills legendary text with the rolled value', () => {
    expect(legendaryText(registry, 'executioner', 77.4)).toBe(
      'Deal +77% damage to enemies below 30% life.',
    );
  });
});
