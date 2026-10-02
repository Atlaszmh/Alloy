import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { runeText, type RuneRef } from '@alloy/engine';
import { RunePicker, type RunePickerProps } from '../RunePicker';
import { pricedRegistry } from './priced-registry';

const registry = pricedRegistry();
const multishot = registry.getRunes().find((r) => r.name === 'Multi-shot')!.id;
const quick3: RuneRef = { id: 'quick', tier: 3 };
const heavy3: RuneRef = { id: 'heavy', tier: 3 };
const bolt = { form: 'bolt' } as const;

/** A socket pip that opens the picker, as the builder's does. */
function Harness(props: Partial<RunePickerProps>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Socket 1
      </button>
      {open && (
        <RunePicker
          candidates={[{ rune: { id: 'split', tier: 1 }, count: 2 }]}
          onPick={() => {}}
          onClose={() => setOpen(false)}
          {...props}
        />
      )}
    </>
  );
}

describe('RunePicker', () => {
  it('lists each fitting rune with its count, its effect, its trade-off and its raw price; a pick picks and closes', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <RunePicker
        candidates={[
          { rune: { id: 'split', tier: 1 }, count: 2 },
          { rune: quick3, count: 1 },
        ]}
        onPick={onPick}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Socket a rune' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
    expect(screen.getByTestId('rune-picker')).toHaveAttribute('data-pad-scope');
    expect(screen.getByRole('button', { name: 'Split I ×2' })).toHaveAccessibleDescription(
      'Splits into 2 shards on hit, each at 30% power · +27% cost',
    );
    const q = runeText(registry, quick3);
    expect(q.effect).toBe('Beat −20%, cooldown −20%');
    // The E2E finds a row by its rune's id, its name, tier and effect in its text.
    expect(screen.getByTestId('rune-pick-quick')).toBe(
      screen.getByRole('button', { name: 'Quick III ×1' }),
    );
    expect(screen.getByTestId('rune-pick-quick')).toHaveTextContent('Quick III');
    expect(screen.getByTestId('rune-pick-quick')).toHaveTextContent(q.effect);
    expect(screen.getByRole('button', { name: 'Quick III ×1' })).toHaveAccessibleDescription(
      `${q.effect} · ${q.tradeoff} · +25% cost`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Quick III ×1' }));
    expect(onPick).toHaveBeenCalledWith(quick3);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("is a modal: Back has the focus and is the pad's back; Escape, a pick or the backdrop close it, the focus back on its opener", () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Socket 1' });
    opener.focus();
    fireEvent.click(opener);
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toHaveFocus();
    expect(back).toHaveAttribute('data-pad-back');
    expect(back).toHaveAttribute('data-testid', 'rune-picker-close');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(opener).toHaveFocus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Split I ×2' }));
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(opener).toHaveFocus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByTestId('rune-picker'));
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("the sheet sits in the kit's UI layer, over the screen", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Socket 1' }));
    expect(screen.getByTestId('rune-picker').parentElement).toBe(
      document.getElementById('delve-ui-layer'),
    );
  });

  it('inline, it is drawn in place as its own pad scope: Back has the focus, Escape closes it', () => {
    const onClose = vi.fn();
    const { container } = render(
      <RunePicker
        variant="inline"
        candidates={[{ rune: { id: 'split', tier: 1 }, count: 2 }]}
        onPick={() => {}}
        onClose={onClose}
      />,
    );
    const picker = screen.getByTestId('rune-picker');
    expect(container).toContainElement(picker);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('group', { name: 'Socket a rune' })).toBe(picker);
    expect(picker).toHaveAttribute('data-pad-scope');
    expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Split I ×2' })).toBeInTheDocument();
    fireEvent.keyDown(picker, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('a filled socket shows its rune with Pull, dormant with its reason, then the runes to replace it', () => {
    const onPull = vi.fn();
    const onClose = vi.fn();
    render(
      <RunePicker
        candidates={[{ rune: { id: 'split', tier: 1 }, count: 1 }]}
        current={{ id: 'linger', tier: 2 }}
        dormant
        pullText="Pull · destroys it"
        onPick={() => {}}
        onPull={onPull}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Linger II' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Linger II, dormant' })).toBeInTheDocument();
    expect(screen.getByTestId('rune-dormant')).toHaveTextContent('Works on heavy and hold blows');
    expect(screen.getByText('Replace with')).toBeInTheDocument();
    expect(screen.getByTestId('rune-pull')).toHaveTextContent('Pull · destroys it');
    fireEvent.click(screen.getByTestId('rune-pull'));
    expect(onPull).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('the Training Grounds pick the tier: one row a rune, no count', () => {
    const onPick = vi.fn();
    render(
      <RunePicker
        candidates={[
          { rune: { id: 'split', tier: 1 }, count: null },
          { rune: { id: 'split', tier: 2 }, count: null },
        ]}
        tierChoice
        onPick={onPick}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Tier I' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('rune-tier-4'));
    expect(screen.getAllByRole('button', { name: /^Split/ })).toHaveLength(1);
    const row = screen.getByRole('button', { name: 'Split IV' });
    expect(row).toBe(screen.getByTestId('rune-pick-split'));
    expect(row).toHaveAccessibleDescription(
      'Splits into 3 shards on hit, each at 45% power · +54% cost',
    );
    fireEvent.click(row);
    expect(onPick).toHaveBeenCalledWith({ id: 'split', tier: 4 });
  });

  it("words a rune by its move's rules: Multi-shot's cut is halved on a Volley", () => {
    const rune: RuneRef = { id: multishot, tier: 2 };
    const { rerender } = render(
      <RunePicker candidates={[{ rune, count: 1 }]} onPick={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('68.75%');
    rerender(
      <RunePicker
        candidates={[{ rune, count: 1 }]}
        on={{ form: 'volley' }}
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('84.375%');
  });

  it('with nothing that fits, says so', () => {
    render(<RunePicker candidates={[]} onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('rune-none')).toHaveTextContent(
      'No rune in your pouch fits this move.',
    );
  });

  it("prices a rune after its effect and trade-off, in its chain's payment, eased by the move's ease", () => {
    const h = runeText(registry, heavy3, bolt);
    const words = (cost: string) => `${h.effect} · ${h.tradeoff} · ${cost}`;
    const row = () => screen.getByRole('button', { name: 'Heavy III ×1' });
    const picker = (terms: Pick<RunePickerProps, 'payment' | 'ease'>) => (
      <RunePicker
        candidates={[{ rune: heavy3, count: 1 }]}
        on={bolt}
        onPick={() => {}}
        onClose={() => {}}
        {...terms}
      />
    );
    const { rerender } = render(picker({ payment: 'mana' }));
    expect(row()).toHaveAccessibleDescription(words('+55% cost'));
    expect(screen.getByText('+55% cost')).toHaveClass('text-amber-200/80');
    rerender(picker({ payment: 'charge' }));
    expect(row()).toHaveAccessibleDescription(words('+55% charge'));
    rerender(picker({ payment: 'cast' }));
    expect(row()).toHaveAccessibleDescription(words('+55% cast wind-up, +55% cost'));
    rerender(picker({ payment: 'mana', ease: 0.45 }));
    expect(row()).toHaveAccessibleDescription(words('+30% cost'));
  });

  it('shows no price on a blow, nor for a dimmed rune: the current one or a candidate', () => {
    const { rerender } = render(
      <RunePicker
        candidates={[{ rune: heavy3, count: 1 }]}
        on={{ weapon: 'sword', kind: 'heavy' }}
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('rune-pick-heavy')).not.toHaveTextContent('% cost');
    rerender(
      <RunePicker
        candidates={[
          { rune: { id: 'pierce', tier: 1 }, count: 1, dormant: true },
          { rune: heavy3, count: 1 },
        ]}
        current={{ id: 'pierce', tier: 3 }}
        dormant
        on={bolt}
        payment="mana"
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('rune-current')).not.toHaveTextContent('% cost');
    expect(screen.getByRole('img', { name: 'Pierce I, dormant' })).toBeInTheDocument();
    expect(screen.getByTestId('rune-pick-pierce')).not.toHaveTextContent('% cost');
    expect(screen.getByTestId('rune-pick-heavy')).toHaveTextContent('+55% cost');
  });
});
