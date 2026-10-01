import { describe, it, expect } from 'vitest';
import { MANA_TYPES, dpsCombos, type DpsSetup } from '@alloy/engine';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import {
  BY_LINE,
  NONE_COLOR,
  PALETTE,
  baseRatios,
  dimGroups,
  formatDps,
  formatRatio,
  lineColor,
  passes,
  rank,
  recall,
  remember,
  topTicks,
  type LabRow,
} from '../lab-model';

/** A made-up row: the model reads only its `dims`, `dps` and `casts`. */
function row(dims: Record<string, string>, dps: number, casts = 1): LabRow {
  const setup = { view: 'ability', dims } as unknown as DpsSetup;
  return { key: Object.values(dims).join('|'), setup, result: { series: [dps], dps, casts } };
}

describe('lab-model', () => {
  it('groups each dims key, in order, with every value once in grid order', () => {
    const setups = [
      row({ form: 'bolt', first: 'fire', second: 'none' }, 1),
      row({ form: 'nova', first: 'fire', second: 'storm' }, 1),
      row({ form: 'bolt', first: 'frost', second: 'none' }, 1),
    ].map((r) => r.setup);
    expect(dimGroups(setups)).toEqual([
      { key: 'form', values: ['bolt', 'nova'] },
      { key: 'first', values: ['fire', 'frost'] },
      { key: 'second', values: ['none', 'storm'] },
    ]);
    // The engine's grid lists each dimension's values in a sensible order.
    const basics = dpsCombos(getDelveRegistry()).filter((s) => s.view === 'basic');
    expect(dimGroups(basics).map((g) => [g.key, g.values.length])).toEqual([
      ['weapon', 7],
      ['primary', 6],
      ['secondary', 7],
    ]);
    expect(dimGroups(basics)[2].values).toEqual(['none', ...MANA_TYPES]);
  });

  it('a row passes unless one of its values is switched off', () => {
    const { setup } = row({ form: 'bolt', first: 'fire' }, 1);
    expect(passes(setup, {})).toBe(true);
    expect(passes(setup, { form: ['nova'] })).toBe(true);
    expect(passes(setup, { form: ['nova'], first: ['fire'] })).toBe(false);
  });

  it('ranks by DPS, and a row whose held button never acted goes last', () => {
    const rows = [
      row({ id: 'a' }, 5),
      row({ id: 'b' }, 0, 0),
      row({ id: 'c' }, 9),
      row({ id: 'd' }, 0, 3),
      row({ id: 'e' }, 7),
    ];
    expect(rank(rows).map((r) => r.key)).toEqual(['c', 'e', 'a', 'd', 'b']);
  });

  it('ticks the top 8', () => {
    const ranked = rank(Array.from({ length: 10 }, (_, i) => row({ id: `r${i}` }, i)));
    expect([...topTicks(ranked)]).toEqual(['r9', 'r8', 'r7', 'r6', 'r5', 'r4', 'r3', 'r2']);
  });

  it("colours by line, or by a dimension's value: an element its own colour, none grey", () => {
    const groups = dimGroups([row({ form: 'bolt' }, 1).setup, row({ form: 'nova' }, 1).setup]);
    const r = row({ form: 'nova', first: 'frost', second: 'none' }, 1);
    expect(lineColor(BY_LINE, r, 3, groups)).toBe(PALETTE[3]);
    expect(lineColor('first', r, 3, groups)).toBe(manaStyle(getDelveRegistry(), 'frost').color);
    expect(lineColor('second', r, 3, groups)).toBe(NONE_COLOR);
    // Any other value takes the palette by its place in its group.
    expect(lineColor('form', r, 3, groups)).toBe(PALETTE[1]);
  });

  it('keeps results for the session by depth, pack and key', () => {
    const a = row({ id: 'a' }, 1);
    const b = row({ id: 'b' }, 2);
    remember(7, true, undefined, [b]);
    expect(recall(7, true, undefined, ['a', 'b'])).toEqual([b]);
    expect(recall(7, false, undefined, ['a', 'b'])).toEqual([]);
    remember(7, true, undefined, [a]);
    expect(recall(7, true, undefined, ['a', 'b'])).toEqual([a, b]);
  });

  it('keeps one key apart under each mana option (full, starved, supported)', () => {
    const full = row({ id: 'c' }, 1);
    const starved = row({ id: 'c' }, 2);
    remember(8, false, undefined, [full]);
    remember(8, false, 'starved', [starved]);
    expect(recall(8, false, undefined, ['c'])).toEqual([full]);
    expect(recall(8, false, 'starved', ['c'])).toEqual([starved]);
    expect(recall(8, false, 'supported', ['c'])).toEqual([]);
  });

  it('shows DPS to a tenth below 100, whole above', () => {
    expect(formatDps(12.345)).toBe('12.3');
    expect(formatDps(1046.4)).toBe('1046');
  });

  it("divides each row's DPS by its baseline's: none without a baseline, or one that dealt nothing", () => {
    const run = (key: string, dps: number, base?: string): LabRow => ({
      key,
      setup: { view: 'rune', dims: {}, base } as unknown as DpsSetup,
      result: { series: [dps], dps, casts: 1 },
    });
    const rows = [
      run('none', 40),
      run('echo', 58, 'none'),
      run('idle', 0),
      run('split', 30, 'idle'),
      run('lost', 9, 'not-run'),
    ];
    expect([...baseRatios(rows)]).toEqual([['echo', 1.45]]);
    expect(formatRatio(1.45)).toBe('×1.45');
    expect(formatRatio(0.9)).toBe('×0.90');
  });
});
