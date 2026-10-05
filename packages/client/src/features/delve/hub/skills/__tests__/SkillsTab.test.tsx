import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, screen, fireEvent, within } from '@testing-library/react';
import {
  defaultMoveset,
  heroChains,
  type Chains,
  type ChainSkill,
  type MoveKind,
} from '@alloy/engine';
import { PAD_BUTTONS, type PadButton } from '@/features/gamepad/gamepad';
import { padPrompts } from '@/features/delve/kit/prompts';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { renderSkills } from './harness';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
/** The hero's chains, as its equipped weapon carries them. */
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;

/** The starting sword made epic (all four skills), every chain at five slots, its default moves. */
function roomy() {
  const p = store().profile;
  const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
  const lengths = { basic: 3, primary: 4, defensive: 1, ultimate: 1 };
  const moveset = defaultMoveset(registry, weapon, 'fire', lengths);
  const slots: Record<ChainSkill, number> = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
  store().setProfile({
    ...p,
    equipped: { ...p.equipped, weapon: { ...weapon, moveset: { chains: moveset.chains, slots } } },
  });
}
/** A key as the window hears it. */
const press = (code: string, mods: { altKey?: boolean; ctrlKey?: boolean } = {}) =>
  fireEvent.keyDown(document.body, { code, ...mods });
/** The pad's buttons, `on` held. */
const held = (...on: PadButton[]) =>
  Object.fromEntries(PAD_BUTTONS.map((b) => [b, on.includes(b)])) as Record<PadButton, boolean>;
const summary = () => screen.getByTestId('abilities-summary');
const kinds = (...k: MoveKind[]) => k.map((kind) => `${kind} Fire Bolt`).join(' · ');

describe('SkillsTab: the footer, the keys and the pad', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    useInputDeviceStore.getState().setDevice('keyboard');
  });

  it('sets the Apply bar as its footer, "No changes" when nothing is unapplied; the pause sets none', () => {
    const { unmount } = renderSkills();
    const footer = within(screen.getByTestId('hub-footer'));
    expect(footer.getByTestId('chain-price')).toHaveTextContent('No changes');
    expect(footer.getByTestId('chain-apply')).toBeDisabled();
    expect(footer.getByTestId('chain-revert')).toBeDisabled();
    unmount();
    renderSkills({ mode: 'pause' });
    expect(screen.queryByTestId('chain-draft')).toBeNull();
  });

  it("draws its prompts in the hub's footer", () => {
    renderSkills();
    const bar = screen.getByTestId('hub-footer');
    for (const label of ['Edit move', 'Remove', 'Next skill']) expect(bar).toHaveTextContent(label);
    expect(bar).not.toHaveTextContent('Reorder');
  });

  it('a link picks the skill', () => {
    roomy();
    renderSkills({ link: { tab: 'skills', skill: 'ultimate' } });
    expect(screen.getByTestId('chain-skill-ultimate')).toHaveAttribute('aria-selected', 'true');
  });

  it('keys: ] and [ step the skills, Alt+arrows move the chosen move, Del removes it, Ctrl+Enter opens the Apply sheet', () => {
    roomy();
    renderSkills();
    press('BracketRight');
    expect(screen.getByTestId('chain-skill-defensive')).toHaveAttribute('aria-selected', 'true');
    press('BracketLeft');
    press('BracketLeft');
    expect(screen.getByTestId('chain-skill-basic')).toHaveAttribute('aria-selected', 'true');
    press('BracketRight');
    // Focus selects a card (a click opens its editor, whose scope would take the keys).
    act(() => screen.getByTestId('move-3').focus());
    press('ArrowLeft', { altKey: true });
    expect(summary()).toHaveTextContent(kinds('light', 'medium', 'heavy', 'medium'));
    press('Delete');
    expect(summary()).toHaveTextContent(kinds('light', 'medium', 'medium'));
    press('Enter', { ctrlKey: true });
    fireEvent.click(screen.getByTestId('apply-sheet-confirm'));
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['light', 'medium', 'medium']);
  });

  it('Alt+← → never fall through to the browser (Back / Forward), even where they move nothing', () => {
    renderSkills({ link: { tab: 'skills', view: 'mana' } });
    expect(press('ArrowLeft', { altKey: true })).toBe(false);
    expect(press('ArrowRight', { altKey: true })).toBe(false);
  });

});

/** A pad tap: the press, then a release frame. */
const padTap = (b: PadButton, at = 0) =>
  act(() => {
    padPrompts(new Set([b]), held(b), at);
    padPrompts(new Set(), held(), at + 50);
  });

describe('SkillsTab: X removes, Y opens the Apply sheet; no hold', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    useInputDeviceStore.getState().setDevice('gamepad');
    // jsdom has no layout: a box for every element, so the editor's scope is the topmost visible one.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('on the home row X removes the chosen move, never the last', () => {
    roomy();
    renderSkills();
    act(() => screen.getByTestId('move-1').focus());
    padTap('x');
    expect(summary()).toHaveTextContent(kinds('light', 'medium', 'heavy'));
    expect(chains().primary.moves).toHaveLength(4); // a draft
  });

  it('in the editor X removes its move and closes it; Del too', () => {
    roomy();
    renderSkills();
    fireEvent.click(screen.getByTestId('move-0'));
    padTap('x');
    expect(screen.queryByTestId('move-editor')).toBeNull();
    expect(summary()).toHaveTextContent(kinds('medium', 'medium', 'heavy'));
    fireEvent.click(screen.getByTestId('move-0'));
    press('Delete');
    expect(screen.queryByTestId('move-editor')).toBeNull();
    expect(summary()).toHaveTextContent(kinds('medium', 'heavy'));
  });

  it('Y opens the Apply sheet from the home row and from the editor; A applies; with nothing changed Y opens nothing', () => {
    roomy();
    renderSkills();
    padTap('y');
    expect(screen.queryByTestId('apply-sheet')).toBeNull();
    fireEvent.click(screen.getByTestId('move-0'));
    fireEvent.keyDown(screen.getByTestId('move-kind'), { key: 'ArrowRight' });
    padTap('y', 1000);
    expect(screen.getByTestId('apply-sheet')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('apply-sheet-confirm'));
    expect(chains().primary.moves[0].kind).toBe('medium');
    expect(screen.queryByTestId('apply-sheet')).toBeNull();
  });

  it('Ctrl+Enter and the footer’s Apply open the sheet too; none of its prompts is a hold', () => {
    roomy();
    renderSkills();
    act(() => screen.getByTestId('move-0').focus());
    padTap('x'); // a change to apply
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    press('Enter', { ctrlKey: true });
    expect(screen.getByTestId('apply-sheet')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('apply-sheet')).getByRole('button', { name: /Back/ }));
    expect(screen.queryByTestId('apply-sheet')).toBeNull();
    fireEvent.click(screen.getByTestId('chain-apply'));
    expect(screen.getByTestId('apply-sheet')).toBeInTheDocument();
  });
});
