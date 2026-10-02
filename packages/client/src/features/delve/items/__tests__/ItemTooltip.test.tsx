import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { baseDisplayName } from '@alloy/engine';
import { ItemTooltip, ItemTooltipCard } from '../ItemTooltip';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../registry';

const worn = () => useDelveStore.getState().profile.equipped;

describe('ItemTooltip', () => {
  beforeEach(() => {
    localStorage.clear();
    // A fire hero in a common sword and a common chest.
    useDelveStore.getState().resetProfile(1234, 'fire');
  });

  it("names an equipped item, what it is and that it's worn", () => {
    const sword = worn().weapon!;
    render(<ItemTooltipCard uid={sword.uid} />);
    expect(screen.getByText(sword.name)).toBeInTheDocument();
    const what = `Common ${baseDisplayName(getDelveRegistry(), sword)} · Weapon · Equipped`;
    expect(screen.getByText(what)).toBeInTheDocument();
    expect(screen.queryByText('Against what you wear')).toBeNull();
  });

  it('compares a bag item with what is worn', () => {
    const chest = worn().chest!;
    act(() => useDelveStore.getState().unequip('chest'));
    render(<ItemTooltipCard uid={chest.uid} />);
    expect(screen.getByText(chest.name)).toBeInTheDocument();
    expect(screen.getByText('Against what you wear')).toBeInTheDocument();
  });

  it('shows nothing for an item the save no longer holds', () => {
    const { container } = render(<ItemTooltipCard uid="gone" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the card over its child', () => {
    const sword = worn().weapon!;
    render(
      <ItemTooltip uid={sword.uid} openWhile>
        <button type="button">tile</button>
      </ItemTooltip>,
    );
    expect(screen.getByRole('button', { name: 'tile' })).toBeInTheDocument();
    expect(screen.getByText(sword.name)).toBeInTheDocument();
  });
});
