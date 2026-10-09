import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, screen, fireEvent, within } from '@testing-library/react';
import {
  heroChains,
  type Chains,
  type Construct,
  type MoveKind,
  type ProfileActionResult,
} from '@alloy/engine';
import { PAD_BUTTONS, type PadButton } from '@/features/gamepad/gamepad';
import { padPrompts } from '@/features/delve/kit/prompts';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { useUIStore } from '@/stores/uiStore';
import { ONBOARDING } from '../../../onboarding';
import { renderSkills, roomy } from './harness';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const realSalvage = useDelveStore.getState().salvageConstruct;
/** The hero's chains, as its equipped weapon carries them. */
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;

/** A key as the window hears it. */
const press = (code: string, mods: { altKey?: boolean; ctrlKey?: boolean } = {}) =>
  fireEvent.keyDown(document.body, { code, ...mods });
/** The pad's buttons, `on` held. */
const held = (...on: PadButton[]) =>
  Object.fromEntries(PAD_BUTTONS.map((b) => [b, on.includes(b)])) as Record<PadButton, boolean>;
const summary = () => screen.getByTestId('abilities-summary');
const kinds = (...k: MoveKind[]) => k.map((kind) => `${kind} Fire Strike`).join(' · ');

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
    for (const label of ['Edit move', 'Unsocket', 'Next skill'])
      expect(bar).toHaveTextContent(label);
    expect(bar).not.toHaveTextContent('Reorder');
  });

  it("a first visit pulses Edit move with its line, until a move's editor opens once", () => {
    useUIStore.setState({ seen: [] });
    roomy();
    renderSkills();
    expect(screen.getByTestId('onboarding-hint')).toHaveTextContent(ONBOARDING.skills);
    expect(document.querySelector('.k-prompt[data-pulse]')).toHaveTextContent('Edit move');
    fireEvent.click(screen.getByTestId('move-0'));
    expect(screen.getByTestId('move-editor')).toBeInTheDocument();
    expect(useUIStore.getState().seen).toContain('skills');
    expect(screen.queryByTestId('onboarding-hint')).toBeNull();
  });

  it('a link picks the skill', () => {
    roomy();
    renderSkills({ link: { tab: 'skills', skill: 'ultimate' } });
    expect(screen.getByTestId('chain-skill-ultimate')).toHaveAttribute('aria-selected', 'true');
  });

  it('keys: ] and [ step the skills, Alt+arrows move the chosen move, Del unsockets it, Ctrl+Enter opens the Apply sheet', () => {
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
    expect(screen.getByTestId('apply-sheet')).toBeInTheDocument();
    // The unsocketed construct waits in the draft's bag (Apply is B2's; D2 un-skips its test).
    expect(store().chainDraft?.bag.map((c) => c.kind)).toEqual(['heavy']);
    expect(chains().primary.moves).toHaveLength(4); // the save, until Apply
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
  afterEach(() => {
    vi.restoreAllMocks();
    useDelveStore.setState({ salvageConstruct: realSalvage });
  });

  it('on the home row X unsockets the chosen move into the bag; the Basic keeps its last blow', () => {
    roomy();
    renderSkills();
    act(() => screen.getByTestId('move-1').focus());
    padTap('x');
    expect(summary()).toHaveTextContent(kinds('light', 'medium', 'heavy'));
    expect(chains().primary.moves).toHaveLength(4); // a draft
    expect(screen.getByTestId('bag-construct')).toHaveTextContent('medium Fire Strike');
    expect(store().chainDraft?.bag.map((c) => c.uid)).toEqual(['p2']);
    // The Basic: three blows go down to one, never none.
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    for (let i = 0; i < 3; i++) {
      act(() => screen.getByTestId('move-0').focus());
      padTap('x');
    }
    expect(screen.getAllByTestId(/^move-\d$/)).toHaveLength(1);
  });

  it('in the editor X unsockets its move and closes it; Del too', () => {
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
    // Task 7 wires the editor's X to unsocket (it still removes here): then expect the bag to hold both.
  });

  it('on a bag row A places and X salvages (the store), B undoes a salvage while it is offered', () => {
    roomy({ primary: { moves: [], payment: 'mana' } }, { primary: 2 });
    const spare: Construct = { uid: 'spare', kind: 'light', form: 'strike', elements: ['fire'] };
    store().setProfile({ ...store().profile, constructs: [spare] });
    renderSkills();
    expect(summary()).toHaveTextContent(/No construct in this chain/);
    const row = screen.getByTestId('bag-construct');
    act(() => row.focus());
    // The footer's prompts follow the focus.
    const labels = () => [...document.querySelectorAll('.k-prompt')].map((p) => p.textContent);
    expect(labels().join(' ')).toMatch(/Place/);
    expect(labels().join(' ')).toMatch(/Salvage/);
    fireEvent.click(row); // A presses the focused row (fireEvent wraps act, so the state flushes before the next expect)
    expect(summary()).toHaveTextContent('light Fire Strike');
    expect(store().chainDraft?.bag).toEqual([]);
    expect(screen.getByTestId('bag-empty')).toBeInTheDocument();
    // A salvage goes through the store (B2's engine; here stubbed) and offers Undo on B.
    act(() => store().revertDraft());
    const after = { ...store().profile, constructs: [] };
    useDelveStore.setState({
      salvageConstruct: (): ProfileActionResult => {
        useDelveStore.setState({ undo: { before: store().profile, after, newUids: {} } });
        store().setProfile(after);
        return { ok: true, profile: after };
      },
    });
    act(() => screen.getByTestId('bag-construct').focus());
    padTap('x');
    expect(store().profile.constructs).toEqual([]);
    expect(labels().join(' ')).toMatch(/Undo salvage/);
    padTap('b');
    expect(store().profile.constructs).toEqual([spare]);
  });

  it('Y opens the Apply sheet from the home row and from the editor; with nothing changed Y opens nothing', () => {
    roomy();
    renderSkills();
    padTap('y');
    expect(screen.queryByTestId('apply-sheet')).toBeNull();
    fireEvent.click(screen.getByTestId('move-0'));
    fireEvent.keyDown(screen.getByTestId('move-kind'), { key: 'ArrowRight' });
    padTap('y', 1000);
    expect(screen.getByTestId('apply-sheet')).toBeInTheDocument();
    // Its Apply is B2's engine (D2 un-skips the apply tests); Back closes it.
    fireEvent.click(
      within(screen.getByTestId('apply-sheet')).getByRole('button', { name: /Back/ }),
    );
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
    fireEvent.click(
      within(screen.getByTestId('apply-sheet')).getByRole('button', { name: /Back/ }),
    );
    expect(screen.queryByTestId('apply-sheet')).toBeNull();
    fireEvent.click(screen.getByTestId('chain-apply'));
    expect(screen.getByTestId('apply-sheet')).toBeInTheDocument();
  });
});
