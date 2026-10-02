import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { addMaterial, emptyHaul, generateItem, SeededRNG } from '@alloy/engine';
import { FoundLog } from '../FoundLog';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();

/** The dive's state as a clear or a door leaves it. */
const at = (phase: 'fighting' | 'choosing', depth: number) =>
  store().setProfile({ ...store().profile, dive: { ...store().profile.dive!, phase, depth } });

describe('FoundLog: what this floor found', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    // A helm for the empty slot and a rare weapon: two upgrades.
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
  afterEach(() => vi.restoreAllMocks());

  /** Dive, and find the helm and the weapon. */
  const dive = () => {
    store().startDive(1);
    store().pushDiveDrops(['h1', 'w1']);
  };

  it('marks every upgrade, the weapon too, with no Equip, only the Anvil note', () => {
    dive();
    render(<FoundLog onInspect={() => {}} />);
    expect(screen.queryByTestId('equip-upgrades')).toBeNull();
    expect(screen.getByTestId('upgrades-locked')).toHaveTextContent('▲ 2 to equip at the Anvil');
  });

  it("lists this floor's pickups only, newest first, each a swatch, its name in its rarity and its mark; a click inspects it", () => {
    const onInspect = vi.fn();
    store().startDive(1);
    store().pushDiveDrops(['h1']);
    at('choosing', 1);
    at('fighting', 2);
    store().pushDiveDrops(['w1']);
    render(<FoundLog onInspect={onInspect} />);
    const rows = screen.getAllByTestId('loot-item');
    expect(rows).toHaveLength(1);
    const blade = store().profile.bag.find((i) => i.uid === 'w1')!;
    expect(rows[0]).toHaveTextContent(`${blade.name}▲`);
    expect(rows[0]).toHaveAccessibleName(`${blade.name}, upgrade`);
    expect(within(rows[0]).getByText(blade.name)).toHaveStyle({ color: '#fee761' });
    // A click leaves the focus where it was (the dock's buttons do the same).
    expect(fireEvent.mouseDown(rows[0])).toBe(false);
    fireEvent.click(rows[0]);
    expect(onInspect).toHaveBeenCalledWith('w1');
  });

  it('shows the item card inline on hover', () => {
    dive();
    render(<FoundLog onInspect={() => {}} />);
    fireEvent.mouseEnter(screen.getAllByTestId('loot-item')[0]);
    const card = within(screen.getByTestId('pickup-feed')).getByRole('tooltip');
    expect(card).toHaveTextContent(store().profile.bag.find((i) => i.uid === 'w1')!.name);
  });

  it('shows as many rows as fit, then "+n more"', () => {
    dive();
    store().pushDiveRunes([
      { id: 'split', tier: 3 },
      { id: 'quick', tier: 1 },
    ]);
    // 108 px holds three 32 px rows and their 6 px gaps: two of the four finds, then the count.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 108,
    } as DOMRect);
    render(<FoundLog onInspect={() => {}} />);
    expect(screen.getAllByTestId('loot-item')).toHaveLength(2);
    expect(screen.queryByTestId('feed-rune')).toBeNull();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it("is as tall as its rows, counting the column's room below it as room for more", () => {
    dive();
    store().pushDiveRunes([
      { id: 'split', tier: 3 },
      { id: 'quick', tier: 1 },
    ]);
    // The list holds two rows (70 px); the column has 76 px more below the panel: four rows fit.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const id = this.dataset.testid;
      return {
        height: 70,
        bottom: id === 'column' ? 376 : id === 'pickup-feed' ? 300 : 0,
      } as DOMRect;
    });
    render(
      <div data-testid="column">
        <FoundLog onInspect={() => {}} />
      </div>,
    );
    expect(screen.getByTestId('pickup-feed')).not.toHaveClass('flex-1');
    expect(screen.getAllByTestId('loot-item')).toHaveLength(2);
    expect(screen.getAllByTestId('feed-rune')).toHaveLength(2);
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  /**
   * Slots bought on the worn sword make an uncommon dagger better only with
   * that moveset moved onto it: a potential upgrade.
   */
  it('counts a weapon better only as a home for your moveset apart, as a potential upgrade', () => {
    store().setProfile({ ...store().profile, links: 99, scrap: 9999 });
    for (const skill of ['basic', 'basic', 'primary', 'primary', 'primary'] as const)
      expect(store().addSlot(skill).ok).toBe(true);
    const dagger = generateItem(
      registry,
      { uid: 'w2', ilvl: 3, rarity: 'uncommon', slot: 'weapon', mana: 'fire' },
      new SeededRNG(3),
    );
    store().setProfile({ ...store().profile, bag: [...store().profile.bag, dagger] });
    store().startDive(1);
    store().pushDiveDrops(['h1', 'w1', 'w2']);
    render(<FoundLog onInspect={() => {}} />);
    expect(screen.getByTestId('upgrades-locked')).toHaveTextContent('▲ 2 to equip at the Anvil');
    expect(screen.getByTestId('upgrades-potential')).toHaveTextContent(
      '◇ 1 potential: Transfer at the Anvil',
    );
    expect(screen.getAllByTestId('loot-item')[0]).toHaveTextContent(`${dagger.name}◇`);
  });

  it("groups the floor's materials above its items, and its essences below them; Mana Dust is the purse's", () => {
    dive();
    let haul = addMaterial(emptyHaul(), { kind: 'metal', metal: 'iron' }, 3);
    haul = addMaterial(haul, { kind: 'shard', stat: 'critChance', tier: 2 });
    haul = addMaterial(haul, { kind: 'essence', essence: 'twin_fang' });
    haul = addMaterial(haul, { kind: 'dust' }, 5);
    store().setProfile({ ...store().profile, dive: { ...store().profile.dive!, haul } });
    render(<FoundLog onInspect={() => {}} />);
    const feed = screen.getByTestId('pickup-feed');
    const order = [
      ...feed.querySelectorAll('[data-testid^="feed-"], [data-testid="loot-item"]'),
    ].map((el) => el.getAttribute('data-testid'));
    expect(order).toEqual([
      'feed-material',
      'feed-material',
      'loot-item',
      'loot-item',
      'feed-essence',
    ]);
    const [bars, shard] = screen.getAllByTestId('feed-material');
    expect(bars).toHaveTextContent(/^Iron bar ×3$/);
    expect(shard).toHaveTextContent(/^Crit Chance II$/);
    expect(within(screen.getByTestId('feed-essence')).getByText('Twin Fang essence')).toHaveStyle({
      color: '#f77622',
    });
    expect(feed).not.toHaveTextContent('Mana Dust');
  });

  it('names the runes found, grouped, even with no item found', () => {
    store().startDive(1);
    store().pushDiveRunes([
      { id: 'split', tier: 3 },
      { id: 'split', tier: 3 },
      { id: 'quick', tier: 1 },
    ]);
    render(<FoundLog onInspect={() => {}} />);
    expect(screen.getByTestId('pickup-feed')).toBeInTheDocument();
    const [first, second, ...more] = screen.getAllByTestId('feed-rune');
    expect(first).toHaveTextContent(/^Quick Irune$/);
    expect(second).toHaveTextContent(/^Split III ×2rune$/);
    expect(more).toEqual([]);
  });
});
