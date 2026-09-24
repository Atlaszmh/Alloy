import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatDelta,
  formatStat,
  legendaryText,
  manaStyle,
  manaStyles,
} from '../format';
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
    expect(legendaryText(registry, 'glass_cannon', 47.6)).toBe(
      '+48% damage, but 20% less max life.',
    );
  });

  it('describes every mana type with a name, icon and color', () => {
    expect(manaStyle(registry, 'fire')).toMatchObject({ name: 'Fire', icon: '🔥' });
    const all = manaStyles(registry);
    expect(Object.keys(all)).toEqual(['fire', 'frost', 'storm', 'earth', 'shadow']);
    for (const style of Object.values(all)) expect(style.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
