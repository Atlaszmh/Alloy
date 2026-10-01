import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { runeText, type RuneRef } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { RunePicker, type RunePickerProps } from '../RunePicker';

const registry = getDelveRegistry();
const multishot = registry.getRunes().find((r) => r.name === 'Multi-shot')!.id;
const quick3: RuneRef = { id: 'quick', tier: 3 };

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
  it('lists each fitting rune with its count, its effect and its trade-off; a pick picks and closes', () => {
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
      'Splits into 2 shards on hit, each at 30% power',
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
      `${q.effect} · ${q.tradeoff}`,
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
    expect(row).toHaveAccessibleDescription('Splits into 3 shards on hit, each at 45% power');
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
});
