import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { ItemHeader } from '../ItemHeader';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const bow = (): GearItem => ({
  ...generateItem(
    registry,
    { uid: 'w1', ilvl: 7, rarity: 'rare', slot: 'weapon', baseId: 'bow', mana: 'frost' },
    new SeededRNG(4),
  ),
  upgrade: 2,
});

describe('ItemHeader', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('names the item, its rarity, base and slot, and tags its mana, attack, tempo, level and forging', () => {
    const item = bow();
    render(<ItemHeader item={item} />);
    expect(screen.getByTestId('item-name')).toHaveTextContent(item.name);
    expect(screen.getByTestId('item-name')).toHaveClass('text-lg');
    expect(screen.getByRole('button', { name: `${item.name} +2, rare` })).toHaveStyle({
      width: '56px',
    });
    expect(document.body).toHaveTextContent(/Rare .+ · Weapon/);
    expect(screen.getByTestId('item-mana')).toHaveTextContent(/Frost \+\d+ · not your element$/);
    expect(document.body).toHaveTextContent('🎯 Ranged');
    expect(screen.getByTestId('item-tempo')).toHaveTextContent(/^Tempo [\d.]+×: /);
    expect(document.body).toHaveTextContent('iLvl 7');
    expect(document.body).toHaveTextContent('+2 forged');
    expect(document.body).not.toHaveTextContent('Equipped');
  });

  it('at lg, draws the larger tile and name, and marks what is equipped', () => {
    const sword = store().profile.equipped.weapon!;
    render(<ItemHeader item={sword} size="lg" />);
    expect(screen.getByTestId('item-name')).toHaveClass('text-xl');
    expect(screen.getByRole('button', { name: `${sword.name}, common` })).toHaveStyle({
      width: '72px',
    });
    expect(screen.getByTestId('item-mana')).toHaveTextContent(/^🔥 Fire \+1$/);
    expect(document.body).toHaveTextContent('⚔️ Melee');
    expect(document.body).toHaveTextContent('Equipped');
  });
});
