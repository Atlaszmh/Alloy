import { MANA_TYPES, type DpsResult, type DpsSetup, type ManaType } from '@alloy/engine';
import { manaStyle } from '../format';
import { getDelveRegistry } from '../registry';

/**
 * The DPS Lab's pure helpers. The lab never names a dimension: its chips,
 * columns and colours all come from each setup's `dims` (see the DPS Lab spec).
 */

/** One finished run, as the worker posts it. */
export interface LabRow {
  key: string;
  setup: DpsSetup;
  result: DpsResult;
}

/** One chip group: a `dims` key and every value it takes, in grid order. */
export interface DimGroup {
  key: string;
  values: string[];
}

/** The chips switched off, per `dims` key (every chip starts on). */
export type LabFilter = Record<string, readonly string[]>;

/** The chip groups of some setups: one per `dims` key, in order, each value once. */
export function dimGroups(setups: readonly DpsSetup[]): DimGroup[] {
  const groups = new Map<string, Set<string>>();
  for (const s of setups)
    for (const [key, value] of Object.entries(s.dims)) {
      if (!groups.has(key)) groups.set(key, new Set());
      groups.get(key)!.add(value);
    }
  return [...groups].map(([key, values]) => ({ key, values: [...values] }));
}

export function passes(setup: DpsSetup, off: LabFilter): boolean {
  return Object.entries(setup.dims).every(([key, value]) => !off[key]?.includes(value));
}

/** Highest DPS first; a row whose held button never acted (`casts: 0`) goes last. */
export function rank(rows: readonly LabRow[]): LabRow[] {
  const idle = (r: LabRow) => (r.result.casts === 0 ? 1 : 0);
  return [...rows].sort((a, b) => idle(a) - idle(b) || b.result.dps - a.result.dps);
}

/** The rows charted until the reader ticks one: the top 8. */
export function topTicks(ranked: readonly LabRow[]): Set<string> {
  return new Set(ranked.slice(0, 8).map((r) => r.key));
}

/** The dark categorical palette, in its order (validated on the panel surface). */
export const PALETTE = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
];
/** No element ('none'): stone grey. */
export const NONE_COLOR = '#a8a29e';
/** Colour by "Line": each charted line its own colour. Any other choice is a `dims` key. */
export const BY_LINE = 'line';

/**
 * A charted line's colour. By line: its place among the charted lines. By a
 * dimension: its value's, an element's own colour, 'none' grey, anything else
 * the palette by the value's place in its group.
 */
export function lineColor(
  colorBy: string,
  row: LabRow,
  index: number,
  groups: readonly DimGroup[],
): string {
  if (colorBy === BY_LINE) return PALETTE[index % PALETTE.length];
  const value = row.setup.dims[colorBy];
  if (value === 'none') return NONE_COLOR;
  if ((MANA_TYPES as readonly string[]).includes(value))
    return manaStyle(getDelveRegistry(), value as ManaType).color;
  const values = groups.find((g) => g.key === colorBy)?.values ?? [];
  return PALETTE[Math.max(0, values.indexOf(value)) % PALETTE.length];
}

/** 12.3 below 100, else whole (1046). */
export function formatDps(dps: number): string {
  return dps.toFixed(dps < 100 ? 1 : 0);
}

/** Every result this session, keyed `depth|pack|dpsKey`, so flipping back is instant. */
const kept = new Map<string, LabRow>();

export function remember(depth: number, pack: boolean, rows: readonly LabRow[]): void {
  for (const r of rows) kept.set(`${depth}|${pack}|${r.key}`, r);
}

/** The results kept for these options, in the order of `keys` (the ones not run yet left out). */
export function recall(depth: number, pack: boolean, keys: readonly string[]): LabRow[] {
  return keys.flatMap((key) => kept.get(`${depth}|${pack}|${key}`) ?? []);
}
