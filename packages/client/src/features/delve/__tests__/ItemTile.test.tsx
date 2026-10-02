import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { generateItem, SeededRNG } from '@alloy/engine';
import { ItemTile, deltaMark } from '../ItemTile';
import { getDelveRegistry } from '../registry';

const registry = getDelveRegistry();
const item = generateItem(
  registry,
  { uid: 't1', ilvl: 4, rarity: 'epic', slot: 'ring' },
  new SeededRNG(3),
);
const mark = (container: HTMLElement) =>
  container.querySelector('.k-tile-delta [data-glyph]')?.getAttribute('data-glyph') ?? null;

describe('ItemTile', () => {
  it('is a kit tile: ▲ for a gain, ▼ for a loss, nothing for rounding noise', () => {
    const { container, rerender } = render(<ItemTile item={item} delta={0.2} />);
    expect(container.querySelector('.k-tile')).not.toBeNull();
    expect(mark(container)).toBe('up');
    expect(screen.getByRole('button')).toHaveAccessibleName(`${item.name}, epic, upgrade`);
    rerender(<ItemTile item={item} delta={-0.2} />);
    expect(mark(container)).toBe('down');
    rerender(<ItemTile item={item} delta={0.001} />);
    expect(mark(container)).toBeNull();
  });

  it('marks a weapon better only as a home for your moveset ◇, and ▲ by its value as it is', () => {
    expect(deltaMark(0.2, -0.1)).toBe('potential');
    expect(deltaMark(0.2, 0.1)).toBe('up');
    expect(deltaMark(-0.2, -0.1)).toBe('down');
    expect(deltaMark(0.001, 0)).toBeNull();
    expect(deltaMark(null)).toBeNull();
    const { container } = render(<ItemTile item={item} delta={0.2} asIs={-0.1} />);
    expect(mark(container)).toBe('potential');
  });

  it('exposes rarity, fires onClick and forwards its ref to the button', () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(<ItemTile ref={ref} item={item} onClick={onClick} testId="tile" />);
    const tile = screen.getByTestId('tile');
    expect(tile).toHaveAttribute('data-rarity', 'epic');
    expect(ref.current).toBe(tile);
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('marks NEW (not on a locked item), the lock, and an accessible empty slot', () => {
    const { rerender } = render(<ItemTile item={item} isNew />);
    expect(screen.getByRole('button')).toHaveAccessibleName(`${item.name}, epic, new`);
    rerender(<ItemTile item={{ ...item, locked: true }} isNew />);
    expect(screen.getByRole('button')).toHaveAccessibleName(`${item.name}, epic, locked`);
    rerender(<ItemTile item={null} slot="helm" />);
    expect(screen.getByRole('button', { name: /Empty helm slot/ })).toBeInTheDocument();
  });

  it("marks the item's forge level +N, drawn and spoken, and none at +0", () => {
    const { rerender } = render(<ItemTile item={{ ...item, upgrade: 3 }} />);
    expect(screen.getByText('+3')).toHaveClass('k-tile-plus');
    expect(screen.getByRole('button')).toHaveAccessibleName(`${item.name} +3, epic`);
    rerender(<ItemTile item={{ ...item, upgrade: 0 }} />);
    expect(screen.queryByText('+0')).toBeNull();
  });

  it('marks the item mana affinity with a colored pip', () => {
    const { container } = render(<ItemTile item={{ ...item, mana: 'frost' }} />);
    const pip = container.querySelector('.k-tile-mana');
    expect(pip).toHaveAttribute('data-mana', 'frost');
    expect(pip).toHaveAttribute('title', 'Frost affinity');
  });
});
