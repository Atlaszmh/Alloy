import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  compareItem,
  defaultMoveset,
  generateItem,
  SeededRNG,
  type GearItem,
  type GearSlot,
  type ManaType,
  type Rarity,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { BagPane } from '../BagPane';
import { getDelveRegistry } from '../../../registry';
import { UPGRADE_EPSILON } from '../../../format';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const gear = (
  uid: string,
  slot: GearSlot,
  rarity: Rarity = 'magic',
  mana: ManaType = 'fire',
): GearItem => generateItem(registry, { uid, ilvl: 3, rarity, slot, mana }, new SeededRNG(4));
const put = (...bag: GearItem[]) => store().setProfile({ ...store().profile, bag });
const open = (locked = false) => {
  const props = { locked, selected: null, onSelect: vi.fn(), onHover: vi.fn(), onEquip: vi.fn() };
  render(<BagPane {...props} />);
  return props;
};
const tiles = () => screen.getAllByTestId('bag-item');
/** The tile of the bag item `uid`, by its name. */
const tile = (uid: string) =>
  tiles().find((t) =>
    t.getAttribute('aria-label')!.startsWith(store().profile.bag.find((i) => i.uid === uid)!.name),
  )!;

describe('the bag pane', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    useInputDeviceStore.setState({ device: 'keyboard' });
  });

  it('counts the bag, and marks each tile ▲ better as it is, ◇ better only as a home, NEW', () => {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    // A built-up common sword against a plain uncommon one: worse as it is, better as a home.
    const mine = {
      ...sword,
      moveset: defaultMoveset(registry, sword, 'fire', { primary: 5, basic: 5 }),
    };
    const plain = generateItem(
      registry,
      { uid: 'w2', ilvl: 2, rarity: 'uncommon', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(4),
    );
    store().setProfile({
      ...p,
      equipped: { ...p.equipped, weapon: mine },
      bag: [gear('h1', 'helm'), plain],
    });
    store().markNew(['h1']);
    open();
    expect(screen.getByTestId('bag-count')).toHaveTextContent(
      `2 / ${registry.getDelveBalance().loot.bagSize}`,
    );
    expect(tile('h1')).toHaveAccessibleName(expect.stringMatching(/, upgrade, new$/));
    expect(tile('w2')).toHaveAccessibleName(expect.stringMatching(/, potential upgrade$/));
    expect(screen.getByTestId('bag-filter-upgrades')).toHaveTextContent('Upgrades 1');
  });

  it('filters by kind and by ▲ upgrades, and sorts by power, rarity, slot or newest', () => {
    put(gear('r1', 'ring', 'common'), gear('w1', 'weapon', 'rare'), gear('h1', 'helm', 'epic'));
    open();
    const rarities = () => tiles().map((t) => t.dataset.rarity);
    fireEvent.click(screen.getByTestId('bag-filter-weapons'));
    expect(rarities()).toEqual(['rare']);
    fireEvent.click(screen.getByTestId('bag-filter-armor'));
    expect(rarities()).toEqual(['epic']);
    fireEvent.click(screen.getByTestId('bag-filter-jewelry'));
    expect(rarities()).toEqual(['common']);
    fireEvent.click(screen.getByTestId('bag-filter-upgrades'));
    expect(tiles().length).toBeGreaterThan(0);
    for (const t of tiles()) expect(t).toHaveAccessibleName(expect.stringContaining(', upgrade'));
    fireEvent.click(screen.getByTestId('bag-filter-all'));
    expect(screen.getByTestId('bag-filter-all')).toHaveAttribute('aria-pressed', 'true');
    const sort = screen.getByTestId('bag-sort');
    expect(sort).toHaveTextContent('Power');
    fireEvent.click(sort);
    expect(sort).toHaveTextContent('Rarity');
    expect(rarities()).toEqual(['epic', 'rare', 'common']);
    fireEvent.click(sort);
    expect(sort).toHaveTextContent('Slot');
    expect(rarities()).toEqual(['rare', 'epic', 'common']); // weapon, helm, ring
    fireEvent.click(sort);
    expect(sort).toHaveTextContent('Newest');
    expect(rarities()).toEqual(['epic', 'rare', 'common']);
  });

  it('hover and a click select, a right-click equips; under the pad focus selects and A equips', () => {
    put(gear('h1', 'helm'));
    const props = open();
    const helm = tiles()[0];
    fireEvent.mouseEnter(helm);
    expect(props.onHover).toHaveBeenLastCalledWith('h1');
    fireEvent.mouseLeave(helm);
    expect(props.onHover).toHaveBeenLastCalledWith(null);
    fireEvent.focus(helm);
    expect(props.onSelect).not.toHaveBeenCalled(); // keyboard focus only moves the ring
    fireEvent.click(helm);
    expect(props.onSelect).toHaveBeenCalledWith('h1');
    fireEvent.contextMenu(helm);
    expect(props.onEquip).toHaveBeenCalledWith('h1');
    useInputDeviceStore.setState({ device: 'gamepad' });
    props.onSelect.mockClear();
    props.onEquip.mockClear();
    fireEvent.focus(helm);
    expect(props.onSelect).toHaveBeenCalledWith('h1');
    fireEvent.click(helm);
    expect(props.onEquip).toHaveBeenCalledWith('h1');
  });

  it('Equip best never asks, and leaves weapons alone', () => {
    const sword = gear('w1', 'weapon', 'rare');
    put(gear('h1', 'helm', 'magic', 'storm'), {
      ...sword,
      moveset: defaultMoveset(registry, sword, 'fire', { primary: 5 }),
    });
    // The sword is an upgrade too, which Equip best still leaves to the compare pane.
    const { equipped, pair } = store().profile;
    expect(
      compareItem(equipped, store().profile.bag[1], registry, 1, pair).powerPct,
    ).toBeGreaterThan(UPGRADE_EPSILON);
    open();
    expect(screen.getByTestId('equip-best')).toHaveTextContent('▲ Equip best (1)');
    fireEvent.click(screen.getByTestId('equip-best'));
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    expect(store().profile.equipped.weapon?.uid).not.toBe('w1');
    expect(store().profile.pair.secondary).toBeNull();
  });

  it('Salvage junk melts what is worse, never a weapon holding runes', () => {
    const p = store().profile;
    const worn = p.equipped.weapon!;
    const chain = worn.moveset!.chains.primary!;
    const runed = [{ ...chain.moves[0], runes: [{ id: 'split', tier: 1 as const }] }];
    const held: GearItem = {
      ...worn,
      uid: 'w2',
      moveset: {
        ...worn.moveset!,
        chains: { ...worn.moveset!.chains, primary: { ...chain, moves: runed } },
      },
    };
    store().setProfile({
      ...p,
      equipped: { ...p.equipped, helm: gear('h0', 'helm', 'epic') },
      bag: [gear('h1', 'helm', 'common'), held],
    });
    open();
    expect(screen.getByTestId('salvage-junk')).toHaveTextContent('Salvage junk (1)');
    fireEvent.click(screen.getByTestId('salvage-junk'));
    expect(store().profile.bag.map((i) => i.uid)).toEqual(['w2']);
  });

  it('auto-salvage takes every rarity up to the one chosen', () => {
    open();
    const chip = screen.getByTestId('auto-salvage');
    expect(chip).toHaveTextContent('Off');
    fireEvent.click(chip);
    const choice = screen.getByRole('radiogroup', { name: 'Auto-salvage up to' });
    fireEvent.click(within(choice).getByTestId('auto-salvage-magic'));
    expect(store().profile.autoSalvage).toMatchObject({
      common: true,
      uncommon: true,
      magic: true,
      rare: false,
      epic: false,
    });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(chip).toHaveTextContent('Magic');
    fireEvent.click(chip);
    fireEvent.click(screen.getByTestId('auto-salvage-off'));
    expect(Object.values(store().profile.autoSalvage).some(Boolean)).toBe(false);
  });

  it('locked (mid-dive or paused), Equip best, Salvage junk and auto-salvage wait for the Anvil', () => {
    put(gear('h1', 'helm', 'magic', 'storm'));
    open(true);
    expect(screen.getByTestId('equip-best')).toBeDisabled();
    expect(screen.getByTestId('equip-best')).toHaveTextContent('Equip between dives');
    expect(screen.getByTestId('salvage-junk')).toBeDisabled();
    expect(screen.getByTestId('salvage-junk')).toHaveTextContent('Salvage between dives');
    expect(screen.getByTestId('auto-salvage')).toBeDisabled();
  });
});
