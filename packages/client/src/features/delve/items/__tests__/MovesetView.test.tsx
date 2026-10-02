import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { defaultMoveset, generateItem, SeededRNG } from '@alloy/engine';
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

  it("lists each chain the weapon carries with its slots and moves, and what it can't carry", () => {
    render(<MovesetView item={store().profile.equipped.weapon!} />);
    expect(screen.getByTestId('item-moveset')).toHaveTextContent(/^Moveset/);
    expect(screen.getByTestId('moveset-basic')).toHaveTextContent(
      'Basic 3/5 · light Fire blow · light Fire blow · heavy Fire blow',
    );
    expect(screen.getByTestId('moveset-primary')).toHaveTextContent(
      'Primary 1/5 · light Fire Bolt',
    );
    expect(screen.getByTestId('moveset-defensive')).toHaveTextContent(
      'Defensive: carried by magic weapons and better',
    );
    expect(screen.getByTestId('item-sockets')).toHaveTextContent('Sockets · up to 1 a move');
  });

  it("shows a rare weapon's Defensive and its extra Primary slot", () => {
    const w = generateItem(
      registry,
      { uid: 'w1', ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(4),
    );
    render(
      <MovesetView item={{ ...w, moveset: defaultMoveset(registry, w, 'fire', { primary: 2 }) }} />,
    );
    expect(screen.getByTestId('moveset-primary')).toHaveTextContent(/^Primary 2\/5 · /);
    expect(screen.getByTestId('moveset-defensive')).toHaveTextContent(/^Defensive 1\/5 · /);
    expect(screen.getByTestId('moveset-ultimate')).toHaveTextContent(
      'Ultimate: carried by epic weapons and better',
    );
  });
});
