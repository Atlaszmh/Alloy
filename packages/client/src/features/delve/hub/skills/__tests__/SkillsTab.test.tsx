import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, screen, fireEvent, within } from '@testing-library/react';
import {
  defaultMoveset,
  heroChains,
  type Chains,
  type ChainSkill,
  type MoveKind,
} from '@alloy/engine';
import { PAD_BUTTONS, type PadButton } from '@/features/gamepad/gamepad';
import { navCapture, padPrompts } from '@/features/delve/kit/prompts';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
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
    for (const label of ['Select move', 'Reorder', 'Remove', 'Next skill', 'Apply'])
      expect(bar).toHaveTextContent(label);
  });

  it('a link picks the skill', () => {
    roomy();
    renderSkills({ link: { tab: 'skills', skill: 'ultimate' } });
    expect(screen.getByTestId('chain-skill-ultimate')).toHaveAttribute('aria-selected', 'true');
  });

  it('keys: ] and [ step the skills, Alt+arrows move the chosen move, Del removes it, Ctrl+Enter applies', () => {
    roomy();
    renderSkills();
    press('BracketRight');
    expect(screen.getByTestId('chain-skill-defensive')).toHaveAttribute('aria-selected', 'true');
    press('BracketLeft');
    press('BracketLeft');
    expect(screen.getByTestId('chain-skill-basic')).toHaveAttribute('aria-selected', 'true');
    press('BracketRight');
    fireEvent.click(screen.getByTestId('move-3'));
    press('ArrowLeft', { altKey: true });
    expect(summary()).toHaveTextContent(kinds('light', 'medium', 'heavy', 'medium'));
    press('Delete');
    expect(summary()).toHaveTextContent(kinds('light', 'medium', 'medium'));
    press('Enter', { ctrlKey: true });
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['light', 'medium', 'medium']);
  });

  it('on the pad, X picks the chosen card up: the D-pad carries it, X drops it, B puts it back', () => {
    roomy();
    renderSkills();
    act(() => void padPrompts(new Set(['x']), held('x'), 0));
    act(() => navCapture()!('right'));
    act(() => navCapture()!('right'));
    expect(summary()).toHaveTextContent(kinds('medium', 'medium', 'light', 'heavy'));
    act(() => navCapture()!('b'));
    expect(navCapture()).toBeNull();
    expect(summary()).toHaveTextContent(kinds('light', 'medium', 'medium', 'heavy'));
    act(() => void padPrompts(new Set(['x']), held('x'), 1000));
    act(() => navCapture()!('right'));
    act(() => navCapture()!('x'));
    expect(navCapture()).toBeNull();
    expect(summary()).toHaveTextContent(kinds('medium', 'light', 'medium', 'heavy'));
  });

  it('on the pad, a tap of Y removes the chosen move and a held Y applies', () => {
    roomy();
    renderSkills();
    act(() => {
      padPrompts(new Set(['y']), held('y'), 0);
      padPrompts(new Set(), held(), 100);
    });
    expect(summary()).toHaveTextContent(kinds('medium', 'medium', 'heavy'));
    expect(chains().primary.moves).toHaveLength(4);
    act(() => {
      padPrompts(new Set(['y']), held('y'), 1000);
      padPrompts(new Set(), held('y'), 1700);
      padPrompts(new Set(), held(), 1800);
    });
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['medium', 'medium', 'heavy']);
  });
});
