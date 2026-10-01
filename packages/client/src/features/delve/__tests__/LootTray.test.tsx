import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { generateItem, SeededRNG } from '@alloy/engine';
import { LootTray } from '../LootTray';
import { PickupFeed } from '../arena/PickupFeed';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();

describe("the dive's loot: upgrades wait for the Anvil", () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    // A helm for the empty slot and a rare weapon, found this dive: two upgrades.
    const helm = generateItem(
      registry,
      { uid: 'h1', ilvl: 3, rarity: 'rare', slot: 'helm', mana: 'fire' },
      new SeededRNG(4),
    );
    const blade = generateItem(
      registry,
      { uid: 'w1', ilvl: 3, rarity: 'rare', slot: 'weapon', mana: 'fire' },
      new SeededRNG(5),
    );
    store().setProfile({ ...store().profile, bag: [helm, blade] });
  });

  /** Dive, and find the helm and the weapon (a new dive forgets the last one's drops). */
  const dive = () => {
    store().startDive(1);
    store().pushDiveDrops(['h1', 'w1']);
  };

  it('mid-dive the tray marks every upgrade, the weapon too, with no Equip, only the Anvil note', () => {
    dive();
    const origin = { current: null };
    render(<LootTray originRef={origin} onSelect={() => {}} />);
    expect(screen.queryByTestId('equip-upgrades')).toBeNull();
    expect(screen.getByTestId('upgrades-locked')).toHaveTextContent('▲ 2 to equip at the Anvil');
  });

  it("the arena's feed says the same", () => {
    dive();
    render(<PickupFeed onSelect={() => {}} top={0} />);
    expect(screen.queryByTestId('equip-upgrades')).toBeNull();
    expect(screen.getByTestId('upgrades-locked')).toHaveTextContent('▲ 2 to equip at the Anvil');
  });

  it('at a stop that offers to equip, the tray says one can go on there', () => {
    dive();
    const d = store().profile.dive!;
    store().setProfile({
      ...store().profile,
      dive: { ...d, phase: 'choosing', stop: { offers: ['equip'], taken: false } },
    });
    render(<LootTray originRef={{ current: null }} onSelect={() => {}} />);
    expect(screen.getByTestId('upgrades-locked')).toHaveTextContent(
      '▲ 2 to equip at this stop, or at the Anvil',
    );
  });

  it('once the dive has ended, the tray equips again, but never a weapon', () => {
    dive();
    store().setProfile({
      ...store().profile,
      dive: { ...store().profile.dive!, phase: 'extracted' },
    });
    render(<LootTray originRef={{ current: null }} onSelect={() => {}} />);
    expect(screen.getByTestId('equip-upgrades')).toHaveTextContent('▲ Equip upgrades (1)');
  });
});
