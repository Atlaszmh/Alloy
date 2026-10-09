import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { defaultMoveset, generateItem, movesetOf, SeededRNG, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { getDelveRegistry } from '../../../registry';
import { TakeSheet } from '../TakeSheet';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const rareSword = (uid: string, slots = {}): GearItem => {
  const w = generateItem(
    registry,
    { uid, ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(4),
  );
  return { ...w, moveset: defaultMoveset(registry, w, 'fire', slots) };
};

describe('TakeSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().setProfile({ ...armed(store().profile), scrap: 500 });
    store().setProfile({ ...store().profile, bag: [rareSword('w1')] });
  });

  it('offers Equip as it is and Move all here with their Power; Move all carries the guided-start target', () => {
    render(<TakeSheet uid="w1" onClose={vi.fn()} />);
    expect(screen.getByTestId('take-equip')).toHaveTextContent(/Equip as it is · [+−±]\d/);
    expect(screen.getByTestId('take-move-all')).toHaveTextContent(/^Move all here · [+−±]\d.* Power$/);
    expect(screen.getByTestId('take-move-all')).toHaveAttribute('data-tutorial', 'loadout.transfer');
  });

  // D2 un-skips: B2's moveAll.
  it.skip('Move all moves your constructs onto it and wears it; each closes the sheet', () => {
    const onClose = vi.fn();
    const before = movesetOf(registry, store().profile.equipped.weapon!).chains.primary!;
    render(<TakeSheet uid="w1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('take-move-all'));
    expect(store().profile.equipped.weapon?.uid).toBe('w1');
    expect(movesetOf(registry, store().profile.equipped.weapon!).chains.primary!.moves.map((m) => m.uid)).toEqual(
      before.moves.map((m) => m.uid),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('Equip wears it as it is, its moveset its own', () => {
    const onClose = vi.fn();
    const own = store().profile.bag[0].moveset;
    render(<TakeSheet uid="w1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('take-equip'));
    expect(store().profile.equipped.weapon?.uid).toBe('w1');
    expect(store().profile.equipped.weapon?.moveset).toEqual(own);
    expect(onClose).toHaveBeenCalled();
  });

  it('focuses the better of the two first: this rare sword is better as it comes', () => {
    render(<TakeSheet uid="w1" onClose={vi.fn()} />);
    const focused = document.activeElement as HTMLElement;
    expect(focused.dataset.testid).toBe('take-equip');
    expect(screen.getByTestId('take-equip')).toHaveClass('k-go');
  });
});
