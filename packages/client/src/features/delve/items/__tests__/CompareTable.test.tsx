import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { CompareTable } from '../CompareTable';
import { getDelveRegistry } from '../../registry';

const registry = getDelveRegistry();
const helm = (
  uid: string,
  implicits: GearItem['implicits'],
  affixes: GearItem['affixes'],
): GearItem => ({
  ...generateItem(
    registry,
    { uid, ilvl: 3, rarity: 'magic', slot: 'helm', mana: 'fire' },
    new SeededRNG(4),
  ),
  implicits,
  affixes,
});
const mine = helm(
  'h1',
  [{ stat: 'armor', value: 7, roll: 0.5 }],
  [
    { stat: 'critChance', value: 3, roll: 0.5 },
    { stat: 'armor', value: 2, roll: 0.5 },
  ],
);
const worn = helm(
  'h2',
  [{ stat: 'armor', value: 10, roll: 0.5 }],
  [{ stat: 'maxHp', value: 18, roll: 0.5 }],
);

describe('CompareTable', () => {
  it("sets each stat beside the worn item's, summed, coloured by which gives more", () => {
    render(<CompareTable item={mine} worn={worn} />);
    const rows = screen.getAllByTestId(/^compare-row-/);
    expect(rows.map((r) => r.dataset.testid)).toEqual([
      'compare-row-armor',
      'compare-row-critChance',
      'compare-row-maxHp',
    ]);
    expect(rows[0]).toHaveTextContent('Armor+10+9');
    expect(rows[1]).toHaveTextContent('Crit Chance—+3%');
    expect(rows[2]).toHaveTextContent('Max Life+18—');
    expect(rows[0].children[2]).toHaveStyle({ color: '#f87171' });
    expect(rows[1].children[2]).toHaveStyle({ color: '#4ade80' });
  });

  it('with nothing worn, every stat is a gain', () => {
    render(<CompareTable item={mine} worn={null} />);
    expect(screen.getByTestId('compare-table')).toHaveTextContent('StatWornThis');
    expect(screen.getAllByTestId(/^compare-row-/)).toHaveLength(2);
    expect(screen.getByTestId('compare-row-armor')).toHaveTextContent('Armor—+9');
    expect(screen.getByTestId('compare-row-armor').children[2]).toHaveStyle({ color: '#4ade80' });
  });
});
