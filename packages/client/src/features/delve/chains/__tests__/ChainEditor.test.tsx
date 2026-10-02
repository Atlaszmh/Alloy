import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { computeHeroStats, defaultChains } from '@alloy/engine';
import { ChainEditor } from '../ChainEditor';
import { getDelveRegistry } from '../../registry';

const registry = getDelveRegistry();
const split = { id: 'split', tier: 1 } as const;

describe('ChainEditor', () => {
  const stats = computeHeroStats({}, registry);
  const given = defaultChains(registry, 'storm', null);
  const caps = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };

  it('edits the chains it is given through onChange', () => {
    const onChange = vi.fn();
    render(
      <ChainEditor chains={given} caps={caps} stats={stats} locked={false} onChange={onChange} />,
    );
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Storm Bolt');
    fireEvent.click(screen.getByTestId('form-lance'));
    const [first, ...rest] = given.primary.moves;
    expect(onChange).toHaveBeenCalledWith(
      'primary',
      { ...given.primary, moves: [{ ...first, form: 'lance' }, ...rest] },
      given.primary.moves.map((_, i) => i), // an edit keeps every move where it was
    );
    expect(screen.queryByTestId('reaction-unknown')).toBeNull(); // the reactions live on the Codex
    expect(screen.getAllByTestId(/^attune-/)).toHaveLength(6);
  });

  it('changes nothing while locked', () => {
    const onChange = vi.fn();
    render(<ChainEditor chains={given} caps={caps} stats={stats} locked onChange={onChange} />);
    fireEvent.click(screen.getByTestId('form-lance'));
    fireEvent.click(screen.getByTestId('move-add'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('with a fixed shape, moves change but never move, go or come, and the payment stays', () => {
    render(
      <ChainEditor
        chains={given}
        caps={caps}
        stats={stats}
        locked={false}
        fixedShape
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('form-lance')).toBeEnabled();
    expect(screen.queryByTestId('move-add')).toBeNull();
    expect(screen.getByTestId('move-left-1')).not.toBeVisible();
    expect(screen.queryByTestId('payment-mana')).toBeNull();
  });

  it('reports where each move came from: ◂ ▸ move it, × drops it, + is new, an edit keeps it', () => {
    const onChange = vi.fn();
    const [m] = given.primary.moves;
    const three = {
      ...given,
      primary: {
        ...given.primary,
        moves: [
          m,
          { ...m, kind: 'medium' as const },
          { ...m, kind: 'heavy' as const, runes: [split] },
        ],
      },
    };
    render(
      <ChainEditor chains={three} caps={caps} stats={stats} locked={false} onChange={onChange} />,
    );
    const last = () => onChange.mock.lastCall!;
    fireEvent.click(screen.getByTestId('move-right-0'));
    expect(last()[2]).toEqual([1, 0, 2]);
    fireEvent.click(screen.getByTestId('move-remove-1'));
    expect(last()[2]).toEqual([0, 2]);
    fireEvent.click(screen.getByTestId('move-2'));
    fireEvent.click(screen.getByTestId('move-add')); // a copy of the heavy, with no sockets
    expect(last()[2]).toEqual([0, 1, 2, null]);
    expect(last()[1].moves[3]).toEqual({ kind: 'heavy', form: m.form, elements: m.elements });
    fireEvent.click(screen.getByTestId('kind-light'));
    expect(last()[2]).toEqual([0, 1, 2]);
  });
});
