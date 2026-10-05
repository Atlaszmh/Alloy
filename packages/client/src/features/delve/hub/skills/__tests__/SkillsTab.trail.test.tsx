import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { defaultMoveset } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { renderSkills } from './harness';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

// See the pad navigation and guidance spec, 2.3: the lesson's Primary (`l1-skills`), click by
// click, on the real engine: add a slot, the new move in the secondary, a socket on the first
// move, the rune, Apply.

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const target = (t: string) => document.querySelector<HTMLElement>(`[data-tutorial="${t}"]`);
const done = (t: string) => target(t)?.getAttribute('data-tutorial-done');

/** The hero at `l1-skills`: an uncommon sword whose Primary holds two moves, frost bound, Links, scrap and a rune in hand. */
function lesson() {
  const p = armed(store().profile);
  const sword = p.equipped.weapon!;
  const moveset = defaultMoveset(registry, sword, 'fire', { primary: 2 });
  store().setProfile({
    ...p,
    equipped: { ...p.equipped, weapon: { ...sword, moveset } },
    pair: { primary: 'fire', secondary: 'frost' },
    links: 5,
    scrap: 500,
    runes: { quick: [1, 0, 0, 0, 0] },
    tutorial: { step: 'l1-skills', count: 0, misses: 0 },
  });
}

describe("the Skills tab under Hesta's lesson (l1-skills)", () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    lesson();
  });

  it("the lane: the first and last cards are keyed, Add slot is done at the lesson's moves, the first move's sockets once it has one", () => {
    renderSkills();
    expect(screen.getByTestId('chain-skill-primary')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('move-0')).toHaveAttribute('data-tutorial', 'skills.card:first');
    expect(screen.getByTestId('move-1')).toHaveAttribute('data-tutorial', 'skills.card:last');
    // Two moves of the lesson's three.
    expect(done('skills.addSlot')).toBe('false');
    fireEvent.click(screen.getByTestId('add-slot'));
    expect(done('skills.addSlot')).toBe('true');
    expect(screen.getByTestId('move-1')).not.toHaveAttribute('data-tutorial');
    expect(screen.getByTestId('move-2')).toHaveAttribute('data-tutorial', 'skills.card:last');
    // The first move stays selected: its sockets show "+ socket", and are done once one is open.
    expect(target('skills.socket')).toBe(screen.getByTestId('sockets-0'));
    expect(done('skills.socket')).toBe('false');
    fireEvent.click(within(screen.getByTestId('sockets-0')).getByTestId('socket-open'));
    expect(done('skills.socket')).toBe('true');
    // Another skill's cards and Add slot are no targets.
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(target('skills.card:first')).toBeNull();
    expect(target('skills.addSlot')).toBeNull();
  });

  it('a card is done as a way once its move holds what selecting it is for: the last the secondary, the first a rune', () => {
    renderSkills();
    expect(done('skills.card:last')).toBe('false');
    fireEvent.click(screen.getByTestId('move-1'));
    fireEvent.click(screen.getByTestId('element-frost'));
    expect(done('skills.card:last')).toBe('true');
    expect(done('skills.card:first')).toBe('false');
    fireEvent.click(screen.getByTestId('move-0'));
    fireEvent.click(within(screen.getByTestId('sockets-0')).getByTestId('socket-open'));
    // An open, empty socket is not yet what the card is for.
    expect(done('skills.card:first')).toBe('false');
    fireEvent.click(screen.getByTestId('inspect-socket-0'));
    fireEvent.click(screen.getByTestId('rune-pick-quick'));
    expect(done('skills.card:first')).toBe('true');
  });
});
