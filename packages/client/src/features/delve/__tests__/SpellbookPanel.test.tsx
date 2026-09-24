import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { generateItem, SeededRNG } from '@alloy/engine';
import { SpellbookPanel } from '../SpellbookPanel';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();

describe('SpellbookPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234);
  });

  it('shows attunement from starter gear and which spells it unlocks', () => {
    render(<SpellbookPanel />);
    expect(screen.getByTestId('attune-fire')).toHaveAttribute('data-value', '1');
    expect(screen.getByTestId('attune-earth')).toHaveAttribute('data-value', '1');
    expect(screen.getByTestId('attune-frost')).toHaveAttribute('data-value', '0');
    expect(screen.getByTestId('spell-fireball')).toHaveAttribute('data-locked', 'false');
    expect(screen.getByTestId('spell-frost_nova')).toHaveAttribute('data-locked', 'true');
    expect(screen.getByTestId('spell-magma_eruption')).toHaveAttribute('data-locked', 'true');
    expect(screen.getByTestId('spell-magma_eruption')).toHaveTextContent('Needs');
  });

  it('puts an unlocked spell into the selected slot', () => {
    render(<SpellbookPanel />);
    // The first empty slot starts selected.
    expect(screen.getByTestId('spell-slot-2')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('spell-slot-0'));
    fireEvent.click(screen.getByTestId('spell-boulder'));
    expect(useDelveStore.getState().profile.skillSlots).toEqual(['boulder', 'fireball', null]);
    expect(screen.getByTestId('spell-slot-0')).toHaveAttribute('data-skill', 'boulder');
  });

  it('unlocks a combo once two elements reach the threshold', () => {
    const s = useDelveStore.getState();
    const rng = new SeededRNG(9);
    const gear = (['helm', 'gloves', 'amulet'] as const).map((slot, i) =>
      generateItem(registry, { uid: `f${i}`, ilvl: 3, rarity: 'common', slot, mana: 'fire' }, rng),
    );
    const earth = (['boots', 'ring'] as const).map((slot, i) =>
      generateItem(registry, { uid: `e${i}`, ilvl: 3, rarity: 'common', slot, mana: 'earth' }, rng),
    );
    const equipped = { ...s.profile.equipped };
    for (const item of [...gear, ...earth]) equipped[item.slot] = { ...item, affixes: [] };
    s.setProfile({ ...s.profile, equipped });
    render(<SpellbookPanel />);
    expect(Number(screen.getByTestId('attune-fire').dataset.value)).toBeGreaterThanOrEqual(3);
    expect(Number(screen.getByTestId('attune-earth').dataset.value)).toBeGreaterThanOrEqual(3);
    expect(screen.getByTestId('spell-magma_eruption')).toHaveAttribute('data-locked', 'false');
  });

  it('hides undiscovered reactions', () => {
    const s = useDelveStore.getState();
    s.setProfile({ ...s.profile, reactionsSeen: ['melt'] });
    render(<SpellbookPanel />);
    expect(screen.getByTestId('reaction-melt')).toHaveTextContent('Melt');
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(4);
  });
});
