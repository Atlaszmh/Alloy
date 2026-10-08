import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  computeHeroStats,
  defaultChains,
  type Blow,
  type Chains,
  type Construct,
  type Move,
  type ProfileActionResult,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../../registry';
import { SALVAGE_WAITS } from '../ConstructBag';
import { Panes } from './harness';

// The constructs spec, 6: the bag pane, filtered to the chosen skill; A places, X salvages.

const registry = getDelveRegistry();
const stats = computeHeroStats({}, registry, { attunement: { fire: 5 } });
const bolt = (kind: Move['kind'], uid: string, over: Partial<Move> = {}): Move => ({
  uid,
  kind,
  form: 'bolt',
  elements: ['fire'],
  ...over,
});
const primary = { moves: [bolt('light', 'c1'), bolt('medium', 'c2')], payment: 'mana' as const };
const chains: Chains = { ...defaultChains(registry, 'fire', null), primary };
const caps = { basic: 5, primary: 3, defensive: 5, ultimate: 5 };
const spare = bolt('hold', 'c9', { runes: [{ id: 'quick', tier: 2 }] });
const blow: Blow = { uid: 'b1', kind: 'heavy', element: 'storm' };
const bag: Construct[] = [spare, blow];
const realSalvage = useDelveStore.getState().salvageConstruct;

describe('the bag pane', () => {
  afterEach(() => useDelveStore.setState({ salvageConstruct: realSalvage }));

  it("lists the bag's constructs of the chosen skill, each its name, sockets and uid, and the count", () => {
    render(
      <Panes
        chains={chains}
        caps={caps}
        stats={stats}
        locked={false}
        onChange={vi.fn()}
        bag={bag}
      />,
    );
    const pane = screen.getByTestId('construct-bag');
    expect(pane).toHaveAttribute('data-pad-group');
    expect(pane).toHaveTextContent('Bag · Primary');
    expect(within(pane).getByTestId('bag-count')).toHaveTextContent('1 construct');
    const rows = within(pane).getAllByTestId('bag-construct');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('data-construct', 'c9');
    expect(rows[0]).toHaveTextContent('held Fire Bolt');
    expect(within(rows[0]).getByTestId('socket-0')).toHaveAttribute('data-rune', 'quick:2');
    expect(within(rows[0]).queryAllByRole('button')).toEqual([]); // the sockets are marks
    // The Basic sees the blow.
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(within(pane).getAllByTestId('bag-construct')[0]).toHaveTextContent('heavy Storm blow');
    fireEvent.click(screen.getByTestId('chain-skill-defensive'));
    expect(within(pane).getByTestId('bag-empty')).toBeInTheDocument();
  });

  it('a click (A) on a row places it into the next empty slot: the chain gains it and the bag loses it', () => {
    const onChange = vi.fn();
    render(
      <Panes
        chains={chains}
        caps={caps}
        stats={stats}
        locked={false}
        onChange={onChange}
        bag={bag}
      />,
    );
    fireEvent.click(screen.getByTestId('bag-construct'));
    expect(onChange).toHaveBeenCalledWith(
      'primary',
      { moves: [...primary.moves, spare], payment: 'mana' },
      [blow],
    );
    expect(screen.queryByTestId('chain-message')).toBeNull();
  });

  it("a construct the weapon can't express is marked with why, its row off", () => {
    const onChange = vi.fn();
    render(
      <Panes
        chains={chains}
        caps={caps}
        stats={stats}
        locked={false}
        onChange={onChange}
        bag={bag}
        dormantText={(c) => ('form' in c ? "A sword can't express Bolt" : null)}
      />,
    );
    const row = screen.getByTestId('bag-construct');
    expect(row).toBeDisabled();
    expect(within(row).getByTestId('bag-cant')).toHaveTextContent("A sword can't express Bolt");
    expect(row).toHaveAccessibleName("held Fire Bolt, A sword can't express Bolt");
  });

  it("Salvage is the mouse's, off the D-pad; it melts through the store, and waits while the draft has changes", () => {
    const salvage = vi.fn((): ProfileActionResult & { runes?: never } => ({
      ok: true,
      profile: useDelveStore.getState().profile,
    }));
    useDelveStore.setState({ salvageConstruct: salvage });
    const { unmount } = render(
      <Panes
        chains={chains}
        caps={caps}
        stats={stats}
        locked={false}
        onChange={vi.fn()}
        bag={bag}
      />,
    );
    const button = screen.getByTestId('bag-salvage');
    expect(button).toHaveAttribute('data-pad-skip');
    expect(button).toHaveAccessibleName('Salvage held Fire Bolt');
    fireEvent.click(button);
    expect(salvage).toHaveBeenCalledWith('c9');
    unmount();
    render(
      <Panes
        chains={chains}
        caps={caps}
        stats={stats}
        locked={false}
        onChange={vi.fn()}
        bag={bag}
        changed={{ primary }}
      />,
    );
    expect(screen.getByTestId('bag-salvage')).toBeDisabled();
    expect(screen.getByTestId('bag-salvage')).toHaveAttribute('title', SALVAGE_WAITS);
  });

  it('locked (a dive), the rows are off and nothing melts', () => {
    render(<Panes chains={chains} caps={caps} stats={stats} locked onChange={vi.fn()} bag={bag} />);
    expect(screen.getByTestId('bag-construct')).toBeDisabled();
    expect(screen.getByTestId('bag-salvage')).toBeDisabled();
  });
});
