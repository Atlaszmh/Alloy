import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { generateItem, SeededRNG } from '@alloy/engine';
import { ItemTile } from '../ItemTile';
import { getDelveRegistry } from '../registry';

const registry = getDelveRegistry();
const item = generateItem(
  registry,
  { uid: 't1', ilvl: 4, rarity: 'epic', slot: 'ring' },
  new SeededRNG(3),
);

describe('ItemTile', () => {
  it('shows an upgrade badge for positive deltas only', () => {
    const { rerender } = render(<ItemTile item={item} delta={0.2} />);
    expect(screen.getByTestId('upgrade-badge')).toHaveTextContent('▲');
    rerender(<ItemTile item={item} delta={-0.2} />);
    expect(screen.queryByTestId('upgrade-badge')).toBeNull();
    expect(screen.getByText('▼')).toBeInTheDocument();
    rerender(<ItemTile item={item} delta={0.001} />);
    expect(screen.queryByText('▲')).toBeNull();
  });

  it('exposes rarity and fires onClick', () => {
    const onClick = vi.fn();
    render(<ItemTile item={item} onClick={onClick} testId="tile" />);
    const tile = screen.getByTestId('tile');
    expect(tile).toHaveAttribute('data-rarity', 'epic');
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders upgrade level and an accessible empty slot', () => {
    const { rerender } = render(<ItemTile item={{ ...item, upgrade: 3 }} />);
    expect(screen.getByText('+3')).toBeInTheDocument();
    rerender(<ItemTile item={null} slot="helm" />);
    expect(screen.getByRole('button', { name: /Empty helm slot/ })).toBeInTheDocument();
  });
});
