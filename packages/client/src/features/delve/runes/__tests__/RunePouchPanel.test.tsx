import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RunePouch, RuneRef } from '@alloy/engine';
import { RunePouchPanel } from '../RunePouchPanel';
import { pricedRegistry } from './priced-registry';

/** `delve.runes.fuseScrap` (20, 40, 80, 160 to make II to V); tier V doesn't fuse. */
const fusePrice = (r: RuneRef) => [20, 40, 80, 160][r.tier - 1] ?? null;
const pouch: RunePouch = {
  quick: [0, 0, 0, 0, 4],
  split: [3, 0, 1, 0, 0],
  ghost: [5, 0, 0, 0, 0],
};

function panel(over: { scrap?: number; locked?: boolean; pouch?: RunePouch } = {}) {
  const onFuse = vi.fn();
  render(
    <RunePouchPanel
      pouch={over.pouch ?? pouch}
      fuseCount={3}
      fusePrice={fusePrice}
      scrap={over.scrap ?? 100}
      locked={over.locked ?? false}
      onFuse={onFuse}
    />,
  );
  return onFuse;
}

describe('RunePouchPanel (the Forge tab)', () => {
  it("lists every rune held by tier in the data's order, and fuses three where it can", () => {
    const onFuse = panel();
    const rows = screen.getAllByTestId(/^pouch-/).map((r) => r.dataset.testid);
    expect(rows).toEqual(['pouch-split-1', 'pouch-split-3', 'pouch-quick-5']);
    expect(screen.getByTestId('pouch-split-1')).toHaveTextContent('Split I ×3');
    expect(screen.getByTestId('pouch-split-1')).toHaveTextContent(
      'Splits into 2 shards on hit, each at 30% power',
    );
    expect(screen.getByTestId('pouch-quick-5')).toHaveTextContent('Quick V ×4');
    expect(screen.getByTestId('rune-fuse-split-1')).toHaveTextContent('Fuse 3 → 1 · ⚙ 20');
    // One Split III is short of three; tier V doesn't fuse.
    expect(screen.queryByTestId('rune-fuse-split-3')).toBeNull();
    expect(screen.queryByTestId('rune-fuse-quick-5')).toBeNull();
    fireEvent.click(screen.getByTestId('rune-fuse-split-1'));
    expect(onFuse).toHaveBeenCalledWith({ id: 'split', tier: 1 });
  });

  it("a fuse it can't pay is disabled and says why", () => {
    panel({ scrap: 10 });
    const fuse = screen.getByTestId('rune-fuse-split-1');
    expect(fuse).toBeDisabled();
    expect(fuse).toHaveAccessibleDescription('Needs ⚙ 20 scrap');
  });

  it('locked mid-dive, as the rest of the forge', () => {
    const onFuse = panel({ locked: true });
    const fuse = screen.getByTestId('rune-fuse-split-1');
    expect(fuse).toBeDisabled();
    expect(fuse).toHaveAccessibleDescription('A dive is under way: fuse runes between dives.');
    fireEvent.click(fuse);
    expect(onFuse).not.toHaveBeenCalled();
  });

  it('prices each rune beside its effect: its full load, uneased (no move known)', () => {
    pricedRegistry();
    panel();
    expect(screen.getByTestId('pouch-split-1')).toHaveTextContent(
      'Splits into 2 shards on hit, each at 30% power · +27% cost',
    );
    expect(screen.getByTestId('pouch-split-3')).toHaveTextContent('+45% cost');
    expect(screen.getByText('+35% cost')).toHaveClass('text-amber-200/80'); // Quick V
  });

  it('an empty pouch says where runes come from', () => {
    panel({ pouch: {} });
    expect(screen.getByTestId('rune-pouch')).toHaveTextContent(
      'No runes yet. Foes drop them now and then, and every boss drops one.',
    );
  });
});
