import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DpsSetup } from '@alloy/engine';
import { LabTable } from '../LabTable';
import type { LabRow } from '../lab-model';

/** A made-up ability row keyed `form|first`. */
function row(key: string, dps: number, casts = 2): LabRow {
  const [form, first] = key.split('|');
  const setup = { view: 'ability', dims: { form, first } } as unknown as DpsSetup;
  return { key, setup, result: { series: [], dps, casts } };
}

describe('LabTable', () => {
  it('lists each row with its dimensions and DPS; a tick charts it', () => {
    const onTick = vi.fn();
    render(
      <LabTable
        rows={[row('bolt|fire', 40), row('nova|frost', 20), row('nova|fire', 0, 0)]}
        columns={['form', 'first']}
        ticked={new Set(['bolt|fire'])}
        onTick={onTick}
      />,
    );
    const rows = screen.getAllByTestId('lab-row');
    expect(rows.map((r) => r.textContent)).toEqual([
      'boltfire40.0',
      'novafrost20.0',
      "novafirecan't afford",
    ]);
    // The bar is scaled to the top row.
    expect(within(rows[1]).getByTestId('lab-bar')).toHaveStyle({ width: '50%' });
    expect(screen.getByTestId('lab-tick-bolt|fire')).toBeChecked();
    expect(screen.getByTestId('lab-tick-nova|frost')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('lab-tick-nova|frost'));
    expect(onTick).toHaveBeenCalledWith('nova|frost');
    expect(screen.queryByText('× none')).toBeNull();
  });

  it('with ratios, a × none column: each row over its baseline, — without one', () => {
    render(
      <LabTable
        rows={[row('echo|bolt', 58), row('none|bolt', 40)]}
        columns={['form', 'first']}
        ticked={new Set()}
        onTick={() => {}}
        ratios={new Map([['echo|bolt', 1.45]])}
      />,
    );
    expect(screen.getByText('× none')).toBeInTheDocument();
    expect(screen.getAllByTestId('lab-ratio').map((c) => c.textContent)).toEqual(['×1.45', '—']);
  });
});
