import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { defaultMoveset } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { findMarked, type Marked } from '../../../tutorial/marked';
import { edit, renderSkills, stepTo } from './harness';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

// See the pad navigation and guidance spec, 2.3 and 5: the lesson's Primary (`l1-skills`), marker
// by marker, on the real engine: add a slot, the new move in the secondary through its editor,
// the way out, a socket and its rune on the first move, the way out, Apply and the sheet's Apply.

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();

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

const STEP = registry.getTutorialData().steps.find((s) => s.id === 'l1-skills')!;
/** What the marker points at: its target, and the marked control's test id (or its nearest). */
const at = (m: Marked | null) =>
  m && [m.id, m.el.closest('[data-testid]')?.getAttribute('data-testid') ?? null];
const marker = () => at(findMarked(STEP));

describe("the Skills tab under Hesta's lesson (l1-skills)", () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    lesson();
    // jsdom has no layout: every element a box on screen, so the scopes and targets are seen.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('the trail is the one this walk follows', () => {
    expect(STEP.trail).toEqual([
      'skills.primary', 'skills.addSlot', 'skills.elements', 'skills.socket', 'skills.rune', 'skills.apply',
    ]);
  });

  it('leads through the editor in order: the slot, the last move in the secondary, out, the first move’s socket and rune, out, Apply, the sheet’s Apply', () => {
    renderSkills({ scoped: true });
    // The Primary is the chosen skill: its tab is done, and Add slot is first.
    expect(screen.getByTestId('chain-skill-primary')).toHaveAttribute('data-tutorial', 'skills.primary');
    expect(marker()).toEqual(['skills.addSlot', 'add-slot']);
    fireEvent.click(screen.getByTestId('add-slot'));
    // At its ceiling (an uncommon sword's Primary stops at 3), Add slot is gone: the trail passes it.
    expect(screen.queryByTestId('add-slot')).toBeNull();

    // The new last move: its card, then its editor's Elements row.
    expect(marker()).toEqual(['skills.card:last', 'move-2']);
    edit(2);
    expect(marker()).toEqual(['skills.elements', 'move-elements']);
    expect(screen.getByTestId('move-elements')).toHaveAttribute('data-tutorial-done', 'false');
    stepTo('move-elements', 'Frost');
    expect(screen.getByTestId('move-elements')).toHaveAttribute('data-tutorial-done', 'true');
    // Nothing more of the step in this editor: its way out.
    expect(marker()).toEqual(['back', 'move-editor-back']);
    fireEvent.click(screen.getByTestId('move-editor-back'));

    // The first move: its card, its Open a socket row, its socket row, the rune grid.
    expect(screen.getByTestId('move-2')).toHaveAttribute('data-tutorial-done', 'true');
    expect(marker()).toEqual(['skills.card:first', 'move-0']);
    edit(0);
    expect(marker()).toEqual(['skills.socket', 'socket-open']);
    fireEvent.click(screen.getByTestId('socket-open'));
    expect(marker()).toEqual(['skills.rune', 'inspect-socket-0']);
    // A click focuses what it presses, as a browser does: the picker's opener, which it refocuses.
    screen.getByTestId('inspect-socket-0').focus();
    fireEvent.click(screen.getByTestId('inspect-socket-0'));
    expect(marker()).toEqual(['skills.rune', 'rune-picker']);
    fireEvent.click(screen.getByTestId('rune-pick-quick'));
    expect(marker()).toEqual(['back', 'move-editor-back']);
    fireEvent.click(screen.getByTestId('move-editor-back'));

    // Apply: the footer's, then the sheet's.
    expect(screen.getByTestId('move-0')).toHaveAttribute('data-tutorial-done', 'true');
    expect(marker()).toEqual(['skills.apply', 'chain-apply']);
    fireEvent.click(screen.getByTestId('chain-apply'));
    expect(marker()).toEqual(['skills.apply', 'apply-sheet-confirm']);
    fireEvent.click(screen.getByTestId('apply-sheet-confirm'));
    expect(store().profile.tutorial?.step).not.toBe('l1-skills');
  });

  it("the editor's lesson targets sit on the Primary's moves only: another move's editor, or another skill's, carries none", () => {
    renderSkills({ scoped: true });
    edit(0);
    expect(document.querySelector('[data-tutorial="skills.elements"]')).toBeNull(); // not the last move
    fireEvent.click(screen.getByTestId('move-editor-back'));
    edit(1);
    expect(document.querySelector('[data-tutorial="skills.socket"]')).toBeNull(); // not the first
    fireEvent.click(screen.getByTestId('move-editor-back'));
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    edit(0);
    expect(
      document.querySelector(
        '[data-tutorial^="skills."]:not([data-tutorial="skills.primary"]):not([data-tutorial="skills.mana"]):not([data-tutorial="skills.apply"])',
      ),
    ).toBeNull();
  });
});
