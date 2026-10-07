import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { BuffRow, type HudBuff } from '../BuffRow';

const boon = (over: Partial<Extract<HudBuff, { id: 'boon' }>> = {}): HudBuff => ({
  id: 'boon',
  boon: 'keen_edge',
  name: 'Keen Edge',
  family: 'offense',
  count: 1,
  dive: true,
  lines: ['+10% damage'],
  ...over,
});

describe('BuffRow', () => {
  it('draws a boon as a tile: its family glyph, gold for the dive, cyan for the floor, no countdown', () => {
    render(
      <BuffRow
        buffs={[
          boon(),
          boon({ boon: 'vigor', name: 'Shrine of Vigor', family: 'offense', dive: false }),
        ]}
      />,
    );
    const dive = screen.getByRole('img', { name: 'Keen Edge, this dive' });
    const floor = screen.getByRole('img', { name: 'Shrine of Vigor, this floor' });
    expect(dive).toHaveAttribute('data-buff', 'boon');
    expect(dive.querySelector('[data-glyph="attack"]')).not.toBeNull();
    expect(dive).toHaveStyle({ borderColor: '#feae34' });
    expect(floor).toHaveStyle({ borderColor: '#2ce8f5' });
    expect(floor).not.toHaveTextContent(/\ds/);
  });

  it('a shrine is a boon tile like any other', () => {
    render(
      <BuffRow
        buffs={[boon({ boon: 'renewal', name: 'Shrine of Renewal', family: 'defense', dive: false })]}
      />,
    );
    const tile = screen.getByRole('img', { name: 'Shrine of Renewal, this floor' });
    expect(tile).toHaveAttribute('data-boon', 'renewal');
    expect(tile.querySelector('[data-glyph="barrier"]')).not.toBeNull();
  });

  it('shows the count in the corner only above 1, at 16 design px', () => {
    render(<BuffRow buffs={[boon({ count: 3, lines: ['a', 'b', 'c'] }), boon({ boon: 'x', name: 'X' })]} />);
    const stacked = screen.getByRole('img', { name: 'Keen Edge ×3, this dive' });
    const count = stacked.querySelector('[data-count]')!;
    expect(count).toHaveTextContent('3');
    expect(count).toHaveClass('text-[16px]');
    expect(screen.getByRole('img', { name: 'X, this dive' }).querySelector('[data-count]')).toBeNull();
  });

  it("lists the taken tiers' lines in a tooltip on hover and on focus", () => {
    render(<BuffRow buffs={[boon({ count: 2, lines: ['+10% damage', '+20% damage'] })]} />);
    const tile = screen.getByRole('img', { name: 'Keen Edge ×2, this dive' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(tile);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Keen Edge');
    expect(tip).toHaveTextContent('This dive');
    expect(within(tip).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '+10% damage',
      '+20% damage',
    ]);
    fireEvent.mouseLeave(tile);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(tile);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('leaves the timed buffs as they were', () => {
    render(<BuffRow buffs={[{ id: 'riposte', left: 1.2, total: 2 }]} />);
    const tile = screen.getByRole('img', { name: 'Riposte, 2s left' });
    expect(tile).toHaveTextContent('2s');
    expect(tile.querySelector('[data-glyph="riposte"]')).not.toBeNull();
  });

  it("a floor-long barrier (Stone Skin's, left Infinity) shows no countdown", () => {
    render(<BuffRow buffs={[{ id: 'barrier', left: Infinity, total: null }]} />);
    const tile = screen.getByRole('img', { name: 'Barrier, this floor' });
    expect(tile).not.toHaveTextContent(/\ds|Infinity/);
  });
});
