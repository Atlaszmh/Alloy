import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createDelveProfile, emptyHaul, type EconomyReport } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { EconomyView } from '../EconomyView';

/** Stands in for the view's worker: the test answers each run itself. */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: MessageEvent<EconomyReport>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
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
  /** Post a seed's report back, as the worker does. */
  reply(report: EconomyReport) {
    act(() => this.onmessage?.({ data: report } as MessageEvent<EconomyReport>));
  }
}
const latest = () => FakeWorker.all[FakeWorker.all.length - 1];

const NONE = { common: 0, uncommon: 0, magic: 0, rare: 0, epic: 0, legendary: 0 };
const PROFILE = createDelveProfile(getDelveRegistry(), 1);
/**
 * Seed `seed`'s dives at these depths: 100 × seed scrap in, 20 from quests, 5 salvaged and 10 spent a dive, `seed` rares
 * forged, the last a death that loses 30 scrap.
 */
function report(seed: number, depths: number[]): EconomyReport {
  return {
    seed,
    dives: depths.map((depth, i) => {
      const died = i === depths.length - 1;
      return {
        dive: i + 1,
        income: { ...emptyHaul(), scrap: 100 * seed },
        quests: { ...emptyHaul(), scrap: 20 },
        salvaged: { ...emptyHaul(), scrap: 5 },
        spent: { ...emptyHaul(), scrap: 10 },
        stops: emptyHaul(),
        constructs: { placed: 0, salvaged: 0 },
        boons: { offense: seed, element: 0, defense: 1, tempo: 0, fortune: 0, pact: 0, floor: 0 },
        forged: { ...NONE, rare: seed },
        depth,
        died,
        lost: died ? { ...emptyHaul(), scrap: 30 } : null,
      };
    }),
    profile: PROFILE,
  };
}
const cells = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((c) => c.textContent);

describe('EconomyView', () => {
  beforeEach(() => {
    FakeWorker.all = [];
    vi.stubGlobal('Worker', FakeWorker);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('runs the economy sim for the seeds and dives on Run, in a worker, then tables each dive', () => {
    render(<EconomyView />);
    expect(screen.getByTestId('economy-seeds')).toHaveValue('1, 2, 3');
    expect(screen.getByTestId('economy-dives')).toHaveValue(12);
    expect(screen.getByTestId('economy-results')).toHaveTextContent(
      'Pick seeds and dives, then Run',
    );
    expect(FakeWorker.all).toHaveLength(0);
    fireEvent.change(screen.getByTestId('economy-seeds'), { target: { value: '7, 8' } });
    fireEvent.change(screen.getByTestId('economy-dives'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('economy-run'));
    expect(latest().requests).toEqual([{ seeds: [7, 8], dives: 3 }]);
    expect(screen.getByTestId('economy-progress')).toBeInTheDocument();
    latest().reply(report(7, [2, 3, 4]));
    expect(screen.getByTestId('economy-progress')).toBeInTheDocument();
    latest().reply(report(8, [4, 5, 6]));
    expect(screen.queryByTestId('economy-progress')).toBeNull();
    const rows = screen.getAllByTestId('economy-row');
    expect(rows).toHaveLength(3);
    // Dive, depth, deaths, forged by rarity, then each total "in / quests / salvaged / spent / lost": means over the
    // seeds, deaths a count.
    expect(cells(rows[0]).slice(0, 5)).toEqual([
      '1',
      '3',
      '0',
      '0 · 0 · 0 · 7.5 · 0 · 0',
      '750 / 20 / 5 / 10 / 0',
    ]);
    expect(cells(rows[2]).slice(0, 5)).toEqual([
      '3',
      '5',
      '2',
      '0 · 0 · 0 · 7.5 · 0 · 0',
      '750 / 20 / 5 / 10 / 30',
    ]);
    // The last column: the boons by family, offense to floor but pact, means over the seeds.
    // No pact column: the bot never takes one.
    expect(cells(rows[0]).at(-1)).toBe('7.5 · 0 · 1 · 0 · 0 · 0');
    expect(within(screen.getByTestId('economy-table')).getByText('Boons')).toHaveAttribute(
      'title',
      'offense · element · defense · tempo · fortune · floor',
    );
  });

  it("charts a material's income, spending and death loss, the items forged by rarity, the depth or the deaths", () => {
    render(<EconomyView />);
    fireEvent.click(screen.getByTestId('economy-run'));
    for (const seed of [1, 2, 3]) latest().reply(report(seed, [1, 2]));
    const show = screen.getByTestId('economy-show');
    expect(show).toHaveValue('scrap');
    expect(screen.getAllByTestId('economy-line')).toHaveLength(5);
    for (const label of [
      'Scrap in',
      'Scrap from quests',
      'Scrap salvaged',
      'Scrap spent',
      'Scrap lost',
    ])
      expect(screen.getByTestId('economy-legend')).toHaveTextContent(label);
    fireEvent.change(show, { target: { value: 'forged' } });
    expect(screen.getAllByTestId('economy-line')).toHaveLength(6);
    fireEvent.change(show, { target: { value: 'boons' } });
    expect(screen.getAllByTestId('economy-line')).toHaveLength(7);
    expect(screen.getByTestId('economy-legend')).toHaveTextContent('Offense');
    fireEvent.change(show, { target: { value: 'deaths' } });
    expect(screen.getAllByTestId('economy-line')).toHaveLength(1);
    // The read-out is the last dive's until the pointer picks one: all three seeds died on dive 2.
    expect(screen.getByTestId('economy-legend')).toHaveTextContent('Dive 23Deaths');
  });

  it('a new Run ends the last worker and starts afresh; no seeds, no Run', () => {
    render(<EconomyView />);
    const run = screen.getByTestId('economy-run');
    fireEvent.click(run);
    const first = latest();
    first.reply(report(1, [2]));
    expect(screen.getAllByTestId('economy-row')).toHaveLength(1);
    fireEvent.click(run);
    expect(first.terminated).toBe(true);
    expect(FakeWorker.all).toHaveLength(2);
    expect(screen.queryAllByTestId('economy-row')).toHaveLength(0);
    fireEvent.change(screen.getByTestId('economy-seeds'), { target: { value: 'none' } });
    expect(run).toBeDisabled();
    fireEvent.change(screen.getByTestId('economy-seeds'), { target: { value: '4' } });
    fireEvent.change(screen.getByTestId('economy-dives'), { target: { value: '0' } });
    expect(run).toBeDisabled();
  });

  it('a throw in the worker shows the error and stops the progress bar; a new Run clears it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<EconomyView />);
    fireEvent.click(screen.getByTestId('economy-run'));
    latest().reply(report(1, [2]));
    act(() => latest().onerror?.({ message: 'Uncaught Error: boom' } as ErrorEvent));
    expect(screen.queryByTestId('economy-progress')).toBeNull();
    expect(screen.getByTestId('economy-error')).toHaveTextContent('Uncaught Error: boom');
    fireEvent.click(screen.getByTestId('economy-run'));
    expect(screen.queryByTestId('economy-error')).toBeNull();
    expect(screen.getByTestId('economy-progress')).toBeInTheDocument();
  });
});
