import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
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

/**
 * The tests share the module-level session cache: none replies with the whole grid at the
 * default depth and pack, so every later test still creates a worker on load.
 */
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
      result('ability|nova|fire|none|heavy|mana', 0, 0),
      result('ability|bolt|fire|none|medium|mana', 40),
    ]);
    fireEvent.click(screen.getByTestId('lab-tab-ability'));
    expect(rowKeys()).toEqual([
      'ability|bolt|fire|none|medium|mana',
      'ability|nova|fire|none|heavy|mana',
    ]);
    expect(screen.getAllByTestId('lab-row')[1]).toHaveTextContent("can't afford");
  });

  it('the Runes view gives each row its ratio to its baseline (× none)', () => {
    renderLab();
    latest().reply([
      result('rune|none|bolt|fire|none', 40),
      result('rune|echo|bolt|fire|III', 58),
      result('basic|sword|fire|none', 30),
    ]);
    expect(screen.queryByText('× none')).toBeNull();
    fireEvent.click(screen.getByTestId('lab-tab-rune'));
    expect(rowKeys()).toEqual(['rune|echo|bolt|fire|III', 'rune|none|bolt|fire|none']);
    expect(screen.getByText('× none')).toBeInTheDocument();
    const [echo, none] = screen.getAllByTestId('lab-row');
    expect(within(echo).getByTestId('lab-ratio')).toHaveTextContent('×1.45');
    expect(within(none).getByTestId('lab-ratio')).toHaveTextContent('—');
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

  it('the Mana select runs the grid starved or supported, each kept apart for the session', () => {
    renderLab();
    const mana = screen.getByTestId('lab-mana');
    expect(mana).toHaveValue('full');
    expect(
      within(mana)
        .getAllByRole('option')
        .map((o) => o.getAttribute('value')),
    ).toEqual(['full', 'starved', 'supported']);
    fireEvent.change(mana, { target: { value: 'starved' } });
    expect(latest().requests).toEqual([{ depth: 10, pack: false, sustained: 'starved' }]);
    latest().reply(grid.map((s) => result(dpsKey(s), 2)));
    expect(screen.queryByTestId('lab-progress')).toBeNull();
    fireEvent.change(mana, { target: { value: 'supported' } });
    expect(latest().requests).toEqual([{ depth: 10, pack: false, sustained: 'supported' }]);
    expect(screen.getByTestId('lab-progress')).toBeInTheDocument();
    // Back to starved: the session kept that run, so no worker is needed.
    const workers = FakeWorker.all.length;
    fireEvent.change(mana, { target: { value: 'starved' } });
    expect(FakeWorker.all).toHaveLength(workers);
    expect(screen.queryByTestId('lab-progress')).toBeNull();
  });

  it('is a kit screen: the band header holds the view tabs and ◂ Training, which goes back', () => {
    render(
      <MemoryRouter initialEntries={['/delve/lab']}>
        <Routes>
          <Route path="/delve/lab" element={<DelveLab />} />
          <Route path="/delve/training" element={<div data-testid="training-page" />} />
        </Routes>
      </MemoryRouter>,
    );
    const lab = screen.getByTestId('delve-lab');
    expect(lab).toHaveClass('delve-zoom');
    expect(lab).toHaveAttribute('data-pad-scope');
    const header = lab.querySelector('header')!;
    expect(within(header).getByTestId('lab-tab-basic')).toHaveAttribute('aria-selected', 'true');
    expect(within(header).getByRole('tablist')).toHaveAttribute('data-pad-tabs');
    const back = within(header).getByTestId('lab-back');
    expect(back).toHaveAttribute('data-pad-back');
    fireEvent.click(back);
    expect(screen.getByTestId('training-page')).toBeInTheDocument();
  });

  it('moving focus off the slider commits the depth too (a controller only nudges it)', () => {
    renderLab();
    fireEvent.change(screen.getByTestId('lab-depth'), { target: { value: '15' } });
    expect(FakeWorker.all).toHaveLength(1);
    fireEvent.blur(screen.getByTestId('lab-depth'));
    expect(FakeWorker.all).toHaveLength(2);
    expect(latest().requests).toEqual([{ depth: 15, pack: false }]);
    // Losing focus without a change starts no run.
    fireEvent.blur(screen.getByTestId('lab-depth'));
    expect(FakeWorker.all).toHaveLength(2);
  });
});
