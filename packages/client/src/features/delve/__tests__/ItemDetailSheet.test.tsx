import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { generateItem, SeededRNG } from '@alloy/engine';
import { ItemDetailSheet } from '../ItemDetailSheet';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();

describe('ItemDetailSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234);
  });

  it('shows the item mana and the attunement equipping it would add', () => {
    const helm = generateItem(
      registry,
      { uid: 'h1', ilvl: 3, rarity: 'magic', slot: 'helm', mana: 'frost' },
      new SeededRNG(4),
    );
    const s = useDelveStore.getState();
    s.setProfile({ ...s.profile, bag: [helm] });
    render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    expect(screen.getByTestId('item-mana')).toHaveTextContent('Frost +1');
    expect(screen.getByTestId('attune-delta')).toHaveTextContent('+1 Frost');
    expect(screen.getByTestId('attune-note')).toHaveTextContent('powers abilities');
  });
});
