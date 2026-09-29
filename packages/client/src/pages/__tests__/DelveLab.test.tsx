import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { dpsCombos, dpsKey } from '@alloy/engine';
import { getDelveRegistry } from '@/features/delve/registry';
import type { LabRow } from '@/features/delve/lab/lab-model';
import { DelveLab } from '../DelveLab';

/** Stands in for the lab's worker: the test answers each request itself. */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: MessageEvent<LabRow[]>) => void) | null = null;
  requests: unknown[] = [];
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(msg: unknown) {
    this.requests.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  /** Post these rows back, as the worker does. */
  reply(rows: LabRow[]) {
    act(() => this.onmessage?.({ data: rows } as MessageEvent<LabRow[]>));
  }
}
const latest = () => FakeWorker.all[FakeWorker.all.length - 1];

const grid = dpsCombos(getDelveRegistry());
const byKey = new Map(grid.map((s) => [dpsKey(s), s]));
/** A fixed result for the grid's setup `key`: flat at `dps`. */
function result(key: string, dps: number, casts = 3): LabRow {
  return { key, setup: byKey.get(key)!, result: { series: Array(60).fill(dps), dps, casts } };
}
const rowKeys = () => screen.getAllByTestId('lab-row').map((r) => r.getAttribute('data-key'));

function renderLab() {
  render(
    <MemoryRouter>
      <DelveLab />
    </MemoryRouter>,
  );
}

describe('DelveLab', () => {
  beforeEach(() => {
    FakeWorker.all = [];
    vi.stubGlobal('Worker', FakeWorker);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('runs the grid at depth 10 on one dummy, then shows the chips and the rows ranked', () => {
    renderLab();
    expect(latest().requests).toEqual([{ depth: 10, pack: false }]);
    latest().reply([
      result('basic|sword|fire|none', 30),
      result('basic|bow|storm|none', 50),
      result('basic|axe|frost|fire', 40),
    ]);
    expect(screen.getByTestId('lab-chip-weapon-sword')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('lab-chip-secondary-none')).toBeInTheDocument();
    expect(rowKeys()).toEqual([
      'basic|bow|storm|none',
      'basic|axe|frost|fire',
      'basic|sword|fire|none',
    ]);
    expect(screen.getByTestId('lab-progress')).toBeInTheDocument();
  });

  it('a chip narrows the rows', () => {
    renderLab();
    latest().reply([result('basic|sword|fire|none', 30), result('basic|bow|storm|none', 50)]);
    fireEvent.click(screen.getByTestId('lab-chip-weapon-bow'));
    expect(screen.getByTestId('lab-chip-weapon-bow')).toHaveAttribute('aria-pressed', 'false');
    expect(rowKeys()).toEqual(['basic|sword|fire|none']);
  });

  it('charts the top 8, one path per ticked row', () => {
    renderLab();
    const basics = grid.filter((s) => s.view === 'basic').slice(0, 10);
    latest().reply(basics.map((s, i) => result(dpsKey(s), 10 + i)));
    expect(screen.getAllByTestId('lab-line')).toHaveLength(8);
    fireEvent.click(screen.getByTestId(`lab-tick-${dpsKey(basics[9])}`));
    expect(screen.getAllByTestId('lab-line')).toHaveLength(7);
  });

  it("an unaffordable ability sits last, as can't afford", () => {
    renderLab();
    latest().reply([
      result('ability|nova|fire|none|2|mana', 0, 0),
      result('ability|bolt|fire|none|0|mana', 40),
    ]);
    fireEvent.click(screen.getByTestId('lab-tab-ability'));
    expect(rowKeys()).toEqual(['ability|bolt|fire|none|0|mana', 'ability|nova|fire|none|2|mana']);
    expect(screen.getAllByTestId('lab-row')[1]).toHaveTextContent("can't afford");
  });

  it('a new depth (on release) or Pack starts a fresh worker; a finished run is kept', () => {
    renderLab();
    const first = latest();
    fireEvent.change(screen.getByTestId('lab-depth'), { target: { value: '20' } });
    expect(FakeWorker.all).toHaveLength(1);
    fireEvent.pointerUp(screen.getByTestId('lab-depth'));
    expect(first.terminated).toBe(true);
    expect(latest().requests).toEqual([{ depth: 20, pack: false }]);
    latest().reply(grid.map((s) => result(dpsKey(s), 1)));
    expect(screen.queryByTestId('lab-progress')).toBeNull();

    fireEvent.click(screen.getByTestId('lab-pack'));
    expect(latest().requests).toEqual([{ depth: 20, pack: true }]);
    // Back to one dummy: the session kept that run, so no worker is needed.
    fireEvent.click(screen.getByTestId('lab-pack'));
    expect(FakeWorker.all).toHaveLength(3);
    expect(screen.queryByTestId('lab-progress')).toBeNull();
  });
});
