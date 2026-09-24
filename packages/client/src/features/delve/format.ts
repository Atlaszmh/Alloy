import type { DataRegistry, HeroStatKey, ManaType, Rarity } from '@alloy/engine';
import { MANA_TYPES } from '@alloy/engine';

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b9b9c4',
  uncommon: '#4ade80',
  magic: '#60a5fa',
  rare: '#fcd34d',
  epic: '#c084fc',
  legendary: '#fb923c',
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  magic: 'Magic',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export const SLOT_LABEL = {
  weapon: 'Weapon',
  helm: 'Helm',
  chest: 'Chest',
  gloves: 'Gloves',
  boots: 'Boots',
  amulet: 'Amulet',
  ring: 'Ring',
} as const;

/** 950 → "950", 12_400 → "12.4k", 3_100_000 → "3.1M". */
export function formatNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n));
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'k'],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const v = n / size;
      return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}${suffix}`;
    }
  }
  return String(Math.round(n));
}

function formatPct(value: number, decimals: number): string {
  const f = Math.pow(10, decimals);
  const v = Math.round(value * f) / f;
  return decimals > 0 ? v.toFixed(decimals).replace(/\.0+$/, '') : String(Math.round(v));
}

/** "+12% Crit Chance" / "+340 Armor" */
export function formatStat(registry: DataRegistry, stat: HeroStatKey, value: number): string {
  const def = registry.getGearAffix(stat);
  const label = def?.label ?? stat;
  if (def?.unit === 'pct') return `+${formatPct(value, def.decimals)}% ${label}`;
  return `+${formatNumber(value)} ${label}`;
}

export function legendaryText(registry: DataRegistry, id: string, value: number): string {
  return registry.getLegendary(id).text.replace('{v}', String(Math.round(value)));
}

/** 0.123 → "+12%", -0.04 → "−4%" */
export function formatDelta(frac: number): string {
  const pct = Math.round(frac * 100);
  if (pct === 0) return frac > 0 ? '+<1%' : frac < 0 ? '−<1%' : '±0%';
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

/** Upgrade threshold for ▲ badges — ignore rounding noise. */
export const UPGRADE_EPSILON = 0.005;

export interface ManaStyle {
  name: string;
  icon: string;
  color: string;
}

/** Display info per mana type, from arpg.json. */
export function manaStyle(registry: DataRegistry, mana: ManaType): ManaStyle {
  return registry.getArpgData().mana[mana];
}

export function manaStyles(registry: DataRegistry): Record<ManaType, ManaStyle> {
  return Object.fromEntries(MANA_TYPES.map((m) => [m, manaStyle(registry, m)])) as Record<
    ManaType,
    ManaStyle
  >;
}
