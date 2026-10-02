import {
  FLUX_GRADES,
  RARITY_ORDER,
  type EconomyDive,
  type EconomyReport,
  type Haul,
} from '@alloy/engine';
import { RARITY_COLOR, RARITY_LABEL, formatNumber } from '../format';
import { getDelveRegistry } from '../registry';
import { PALETTE } from './lab-model';

/**
 * The DPS Lab's Economy view's pure helpers (see the crafting spec's "Economy
 * view"): how much of each material a haul holds, each dive's mean over the
 * seeds, and the lines a chart choice draws.
 */

/** What the view asks its worker for: the economy sim of each seed, `dives` dives each. */
export interface EconomyRequest {
  seeds: number[];
  dives: number;
}

/** A material the view counts: its id, its label and how much of it a haul holds. */
export interface EconomyMaterial {
  id: string;
  label: string;
  of: (h: Haul) => number;
}

const total = (ns: readonly number[]) => ns.reduce((a, b) => a + b, 0);

/** The table's materials: the currencies, then each kind's total. */
export const MATERIAL_TOTALS: EconomyMaterial[] = [
  { id: 'scrap', label: 'Scrap', of: (h) => h.scrap },
  { id: 'dust', label: 'Mana Dust', of: (h) => h.dust },
  { id: 'links', label: 'Links', of: (h) => h.links },
  { id: 'bars', label: 'Bars', of: (h) => total(Object.values(h.metals)) },
  { id: 'flux', label: 'Flux', of: (h) => total(Object.values(h.flux)) },
  {
    id: 'shards',
    label: 'Shards',
    of: (h) => total(Object.values(h.shards).flatMap((tiers) => tiers ?? [])),
  },
  { id: 'essences', label: 'Essences', of: (h) => total(Object.values(h.essences)) },
  { id: 'runes', label: 'Runes', of: (h) => total(Object.values(h.runes).flat()) },
];

/** Every material the chart can show: the totals, then each metal and each flux grade alone. */
export function economyMaterials(): EconomyMaterial[] {
  const { metals } = getDelveRegistry().getCraftingData();
  return [
    ...MATERIAL_TOTALS,
    ...metals.map((m) => ({
      id: `metal:${m.id}`,
      label: `${m.name} bars`,
      of: (h: Haul) => h.metals[m.id] ?? 0,
    })),
    ...FLUX_GRADES.map((g) => ({
      id: `flux:${g}`,
      label: `${RARITY_LABEL[g]} flux`,
      of: (h: Haul) => h.flux[g] ?? 0,
    })),
  ];
}

/** Each dive's mean over the reports that reached it of `value` (its sum with `sum`). */
export function perDive(
  reports: readonly EconomyReport[],
  value: (d: EconomyDive) => number,
  sum = false,
): number[] {
  const n = Math.max(0, ...reports.map((r) => r.dives.length));
  return Array.from({ length: n }, (_, i) => {
    const at = reports.flatMap((r) => (r.dives[i] ? [value(r.dives[i])] : []));
    return sum || at.length === 0 ? total(at) : total(at) / at.length;
  });
}

/** One charted line: a value a dive. */
export interface EconomyLine {
  key: string;
  label: string;
  color: string;
  values: number[];
}

/**
 * The chart's lines for a choice: a material's income, spending and death loss
 * (its id; `lost` null counts 0), the items forged by rarity (`'forged'`), the
 * deepest depth (`'depth'`) or the deaths (`'deaths'`, a count). One choice at a
 * time, so one axis holds one unit.
 */
export function economyLines(reports: readonly EconomyReport[], show: string): EconomyLine[] {
  if (show === 'forged')
    return RARITY_ORDER.map((r) => ({
      key: `forged:${r}`,
      label: RARITY_LABEL[r],
      color: RARITY_COLOR[r],
      values: perDive(reports, (d) => d.forged[r] ?? 0),
    }));
  if (show === 'depth')
    return [
      {
        key: 'depth',
        label: 'Deepest depth',
        color: PALETTE[0],
        values: perDive(reports, (d) => d.depth),
      },
    ];
  if (show === 'deaths')
    return [
      {
        key: 'deaths',
        label: 'Deaths',
        color: PALETTE[1],
        values: perDive(reports, (d) => (d.died ? 1 : 0), true),
      },
    ];
  const m = economyMaterials().find((x) => x.id === show) ?? MATERIAL_TOTALS[0];
  return [
    {
      key: `income:${m.id}`,
      label: `${m.label} in`,
      color: PALETTE[0],
      values: perDive(reports, (d) => m.of(d.income)),
    },
    {
      key: `spent:${m.id}`,
      label: `${m.label} spent`,
      color: PALETTE[1],
      values: perDive(reports, (d) => m.of(d.spent)),
    },
    {
      key: `lost:${m.id}`,
      label: `${m.label} lost`,
      color: PALETTE[2],
      values: perDive(reports, (d) => (d.lost ? m.of(d.lost) : 0)),
    },
  ];
}

/** The seeds typed in ("1, 2, 3"): whole numbers from 0, each once, in order. */
export function parseSeeds(text: string): number[] {
  const seeds = text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0);
  return [...new Set(seeds)];
}

/** A dive's value: whole as it is, a mean to one place, thousands short (1.2k). */
export function formatAmount(n: number): string {
  if (n >= 1000) return formatNumber(n);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
