import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RARITY_COLOR } from '../../format';
import { ItemIcon } from '../../ItemIcon';
import { Tile } from '../Tile';

describe('the kit tile', () => {
  it('is a socket with the rarity border, its icon and its size', () => {
    const onClick = vi.fn();
    render(
      <Tile
        rarity="epic"
        icon={<ItemIcon baseId="cuirass" rarity="epic" />}
        size={64}
        label="Voidweave Plate, epic"
        testId="bag-item"
        onClick={onClick}
      />,
    );
    const tile = screen.getByRole('button', { name: 'Voidweave Plate, epic' });
    expect(tile).toHaveClass('k-tile', 'k-socket');
    expect(tile).toHaveStyle({ width: '64px', height: '64px', borderColor: RARITY_COLOR.epic });
    expect(tile).toHaveAttribute('data-rarity', 'epic');
    expect(tile).toHaveAttribute('data-testid', 'bag-item');
    expect(tile).not.toHaveAttribute('aria-pressed');
    expect(tile.querySelector('svg[data-base="cuirass"]')).not.toBeNull();
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('draws and speaks its states', () => {
    const { rerender } = render(
      <Tile rarity="rare" label="Ember Fang" delta="up" fresh locked equipped selected />,
    );
    const tile = screen.getByRole('button', {
      name: 'Ember Fang, upgrade, new, locked, equipped',
    });
    expect(tile).toHaveAttribute('aria-pressed', 'true');
    expect(tile.querySelector('[data-glyph="up"]')).not.toBeNull();
    expect(tile.querySelector('[data-glyph="lock"]')).not.toBeNull();
    expect(tile).toHaveTextContent('NEW');
    expect(tile).toHaveTextContent('E');
    rerender(<Tile rarity="rare" label="Ember Fang" delta="down" selected={false} />);
    expect(screen.getByRole('button', { name: 'Ember Fang, downgrade' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(tile.querySelector('[data-glyph="down"]')).not.toBeNull();
    rerender(<Tile rarity="rare" label="Ember Fang" delta="potential" />);
    expect(
      screen.getByRole('button', { name: 'Ember Fang, potential upgrade' }),
    ).toBeInTheDocument();
    expect(tile.querySelector('[data-glyph="potential"]')).not.toBeNull();
  });

  it('says its mark in data-delta for tests and audits', () => {
    const { rerender } = render(<Tile rarity="rare" delta="potential" label="x" />);
    expect(screen.getByRole('button')).toHaveAttribute('data-delta', 'potential');
    rerender(<Tile rarity="rare" delta={null} label="x" />);
    expect(screen.getByRole('button')).not.toHaveAttribute('data-delta');
  });

  it('draws an empty slot with no rarity', () => {
    render(<Tile rarity={null} label="Empty helm slot" />);
    const tile = screen.getByRole('button', { name: 'Empty helm slot' });
    expect(tile).not.toHaveAttribute('data-rarity');
    expect(tile.style.borderColor).toBe('');
  });
});
