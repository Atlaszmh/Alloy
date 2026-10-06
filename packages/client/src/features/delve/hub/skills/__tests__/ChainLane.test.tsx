import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  chainCycle,
  computeHeroStats,
  defaultChains,
  resolveChain,
  type Chains,
  type Move,
} from '@alloy/engine';
import { formatNumber } from '../../../format';
import { getDelveRegistry } from '../../../registry';
import { dropIndex } from '../ChainLane';
import { Panes } from './harness';

const registry = getDelveRegistry();
const stats = computeHeroStats({}, registry, { attunement: { fire: 5 } });
const bolt = (over: Partial<Move> = {}): Move => ({
  kind: 'medium',
  form: 'bolt',
  elements: ['fire'],
  ...over,
});
/** A light Bolt, then a held one its Echo repeats. */
const primary = {
  moves: [
    bolt({ kind: 'light' }),
    bolt({ kind: 'hold', runes: [{ id: 'echo', tier: 3 as const }] }),
  ],
  payment: 'mana' as const,
};
const chains: Chains = { ...defaultChains(registry, 'fire', null), primary };
const caps = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
const panes = (onChange = vi.fn()) =>
  render(<Panes chains={chains} caps={caps} stats={stats} locked={false} onChange={onChange} />);

describe('ChainLane', () => {
  it("shows the chain's cycle from chainCycle: damage, seconds, mana, and the support", () => {
    panes();
    const cycle = chainCycle(registry, stats, resolveChain(registry, stats, 'primary', primary));
    expect(screen.getByTestId('stat-damage')).toHaveTextContent(formatNumber(cycle.damage));
    expect(screen.getByTestId('stat-cycle')).toHaveTextContent(`${cycle.seconds.toFixed(1)} s`);
    expect(screen.getByTestId('stat-mana')).toHaveTextContent(String(Math.round(cycle.mana)));
    expect(screen.getByTestId('mana-support')).toHaveTextContent(
      /^Spends \d+\/s · your build refills \d+\/s$/,
    );
  });

  it('draws the rhythm: a block per move, a hold hatched, an echo ghost, a line per beat, the pause', () => {
    panes();
    const strip = within(screen.getByTestId('rhythm-strip'));
    expect(strip.getByTestId('rhythm-step-0')).not.toHaveAttribute('data-hold');
    expect(strip.getByTestId('rhythm-step-1')).toHaveAttribute('data-hold');
    expect(strip.queryByTestId('rhythm-echo-0')).toBeNull();
    expect(strip.getByTestId('rhythm-echo-1')).toBeInTheDocument();
    expect(strip.getAllByTestId(/^rhythm-beat-/)).toHaveLength(2);
    const restart = registry.getDelveBalance().abilities.comboWindow;
    expect(screen.getByTestId('rhythm-strip')).toHaveTextContent(
      `pause ${restart.toFixed(1)} s restarts`,
    );
  });

  it('the basic chain shows its blows, with no stats or rhythm', () => {
    panes();
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getAllByTestId(/^move-\d$/)).toHaveLength(3);
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('3 of 5 slots');
    expect(screen.queryByTestId('chain-stats')).toBeNull();
    expect(screen.queryByTestId('rhythm-strip')).toBeNull();
  });

  it("a card's pips are off the D-pad and a pip's click opens its editor at that socket", () => {
    const socketed: Chains = {
      ...chains,
      primary: { moves: [bolt({ kind: 'light', runes: [null] }), bolt()], payment: 'mana' },
    };
    render(
      <Panes
        chains={socketed}
        caps={caps}
        stats={stats}
        locked={false}
        onChange={vi.fn()}
        runes={{
          pouch: 'any',
          socketCap: 3,
          socketPrice: () => null,
          weaponBaseId: null,
          pullText: () => 'Pull',
        }}
      />,
    );
    expect(screen.getByTestId('sockets-0')).toHaveAttribute('data-pad-skip');
    expect(screen.queryByTestId('move-editor')).toBeNull();
    fireEvent.click(
      within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: empty' }),
    );
    expect(screen.getByTestId('move-editor')).toBeInTheDocument();
    expect(screen.getByTestId('rune-picker')).toBeInTheDocument();
  });

  it('a mouse drag moves a card by its travel over the spacing of the cards', () => {
    const onChange = vi.fn();
    const three: Chains = {
      ...chains,
      primary: {
        moves: [bolt({ kind: 'light' }), bolt(), bolt({ kind: 'heavy' })],
        payment: 'mana',
      },
    };
    render(<Panes chains={three} caps={caps} stats={stats} locked={false} onChange={onChange} />);
    // Each card's column 100 px after the last.
    const box = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const n = Number(this.querySelector('[data-card]')?.getAttribute('data-card') ?? 0);
        return DOMRect.fromRect({ x: n * 100, y: 0, width: 90, height: 50 });
      });
    const card = screen.getByTestId('move-0');
    fireEvent.pointerDown(card, { pointerType: 'mouse', button: 0, clientX: 0 });
    fireEvent.pointerMove(card, { pointerType: 'mouse', clientX: 210 });
    fireEvent.pointerUp(card, { pointerType: 'mouse', clientX: 210 });
    fireEvent.click(card); // the click that ends a drag picks nothing
    box.mockRestore();
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenLastCalledWith('primary', expect.anything(), [1, 2, 0]);
  });

  it('a dragged card lands where it is let go, a place a card-and-gap apart', () => {
    expect(dropIndex(0, 210, 100, 4)).toBe(2);
    expect(dropIndex(1, 40, 100, 4)).toBe(1);
    expect(dropIndex(2, -1000, 100, 4)).toBe(0);
    expect(dropIndex(1, 1000, 100, 4)).toBe(3);
  });
});
