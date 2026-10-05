import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { defaultMoveset } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { edit, renderSkills, stepTo } from './harness';

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

  it("the lane: the first and last cards are keyed, Add slot is done at the lesson's moves, the first move's Open a socket row until it has one", () => {
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
    // The first move's editor: its "Open a socket" row, done once one is open.
    expect(target('skills.socket')).toBeNull();
    edit(0);
    expect(target('skills.socket')).toBe(screen.getByTestId('socket-open'));
    expect(done('skills.socket')).toBe('false');
    fireEvent.click(screen.getByTestId('socket-open'));
    // At the uncommon sword's cap the row goes; the socket's rune row takes the trail on.
    expect(target('skills.socket')).toBeNull();
    expect(target('skills.rune')).toBe(screen.getByTestId('inspect-socket-0'));
    // Another skill's cards and Add slot are no targets.
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(target('skills.card:first')).toBeNull();
    expect(target('skills.addSlot')).toBeNull();
  });

  it('the inspector: the elements are a target on the last move only, done in the secondary; the socket row and its picker are skills.rune', () => {
    renderSkills();
    // Move 1 of 2 is selected: its elements are not the lesson's.
    expect(target('skills.elements')).toBeNull();
    edit(1);
    expect(target('skills.elements')).toBe(screen.getByTestId('move-elements'));
    expect(done('skills.elements')).toBe('false');
    stepTo('move-elements', 'Frost');
    expect(done('skills.elements')).toBe('true');
    // The first move's socket row, once it has a socket.
    edit(0);
    expect(target('skills.elements')).toBeNull();
    expect(target('skills.rune')).toBeNull();
    fireEvent.click(screen.getByTestId('socket-open'));
    expect(target('skills.rune')).toBe(screen.getByTestId('inspect-socket-0'));
    expect(done('skills.rune')).toBe('false');
    // Its picker, a scope of its own, carries the same target on its list of runes.
    fireEvent.click(screen.getByTestId('inspect-socket-0'));
    const list = screen
      .getByTestId('rune-picker')
      .querySelector<HTMLElement>('[data-tutorial="skills.rune"]')!;
    fireEvent.click(within(list).getByTestId('rune-pick-quick'));
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(done('skills.rune')).toBe('true');
    expect(screen.getByTestId('chain-apply')).toHaveAttribute('data-tutorial', 'skills.apply');
    expect(screen.getByTestId('chain-apply')).toBeEnabled();
    // It opens the Apply sheet, whose Apply carries the target too.
    fireEvent.click(screen.getByTestId('chain-apply'));
    expect(screen.getByTestId('apply-sheet-confirm')).toHaveAttribute(
      'data-tutorial',
      'skills.apply',
    );
  });

  it('a card is done as a way once its move holds what selecting it is for: the last the secondary, the first a rune', () => {
    renderSkills();
    expect(done('skills.card:last')).toBe('false');
    edit(1);
    stepTo('move-elements', 'Frost');
    expect(done('skills.card:last')).toBe('true');
    expect(done('skills.card:first')).toBe('false');
    edit(0);
    fireEvent.click(screen.getByTestId('socket-open'));
    // An open, empty socket is not yet what the card is for.
    expect(done('skills.card:first')).toBe('false');
    fireEvent.click(screen.getByTestId('inspect-socket-0'));
    fireEvent.click(screen.getByTestId('rune-pick-quick'));
    expect(done('skills.card:first')).toBe('true');
  });
});
