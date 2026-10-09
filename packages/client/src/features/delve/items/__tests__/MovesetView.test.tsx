import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MAX_SOCKETS, generateItem, movesetOf, SeededRNG } from '@alloy/engine';
import { MovesetView } from '../MovesetView';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();

describe('MovesetView', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it("lists each chain with its slots against the ceiling and its constructs, and a skill it can't hold", () => {
    render(<MovesetView item={store().profile.equipped.weapon!} />);
    expect(screen.getByTestId('item-moveset')).toHaveTextContent(/^Moveset/);
    expect(screen.getByTestId('moveset-basic')).toHaveTextContent(
      'Basic 3 / 3 · light Fire blow · light Fire blow · heavy Fire blow',
    );
    // A new save's common sword: two Primary constructs (the melee default, Strike).
    expect(screen.getByTestId('moveset-primary')).toHaveTextContent(/^Primary 2 \/ 3 · .*Strike/);
    expect(screen.getByTestId('moveset-defensive')).toHaveTextContent(
      'Defensive 0 / 1 · open it on the Temper bench',
    );
    expect(screen.getByTestId('moveset-ultimate')).toHaveTextContent(
      'Ultimate — · not on a common weapon',
    );
    expect(screen.getByTestId('item-sockets')).toHaveTextContent(
      `Sockets · up to ${MAX_SOCKETS} a move`,
    );
    expect(screen.getByTestId('item-moveset').outerHTML).not.toMatch(
      /text-(\[(\d|1[0-3])px\]|xs\b)/,
    );
  });

  it("marks a construct the weapon's class can't express dormant", () => {
    const bow = generateItem(
      registry,
      { uid: 'w1', ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'bow', mana: 'fire' },
      new SeededRNG(4),
    );
    // The sword's Strike constructs on a bow: dormant there.
    const sword = store().profile.equipped.weapon!;
    const m = movesetOf(registry, bow);
    const item = {
      ...bow,
      moveset: {
        ...m,
        chains: { ...m.chains, primary: movesetOf(registry, sword).chains.primary! },
      },
    };
    render(<MovesetView item={item} />);
    const row = screen.getByTestId('moveset-primary');
    expect(row).toHaveTextContent(/Strike \(dormant\)/);
    expect(row.querySelector('[data-dormant]')).not.toBeNull();
  });
});
