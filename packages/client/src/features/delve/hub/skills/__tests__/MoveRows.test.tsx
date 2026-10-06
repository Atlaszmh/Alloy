import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { defaultMoveset, heroChains, type Chains, type ChainSkill } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { edit, renderSkills, stepTo, valuesOf } from './harness';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const draft = () => store().chainDraft?.chains.primary;
const saved = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
const summary = () => screen.getByTestId('abilities-summary');
const damage = () => screen.getByTestId('stat-damage').textContent;

/** The starting sword made epic, every chain at five slots, the Primary its four default Bolts. */
function roomy() {
  const p = store().profile;
  const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
  const moveset = defaultMoveset(registry, weapon, 'fire', {
    basic: 3,
    primary: 4,
    defensive: 1,
    ultimate: 1,
  });
  const slots: Record<ChainSkill, number> = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
  store().setProfile({
    ...p,
    pair: { primary: 'fire', secondary: 'nature' },
    equipped: { ...p.equipped, weapon: { ...weapon, moveset: { chains: moveset.chains, slots } } },
  });
}

describe('the move editor', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    roomy();
  });

  it('a click (A) on a card opens its editor in the pane as a nested pad scope; with it shut the pane has no stops', () => {
    renderSkills();
    const pane = screen.getByTestId('ability-readout');
    expect(within(pane).queryAllByRole('button')).toEqual([]);
    expect(within(pane).queryAllByRole('spinbutton')).toEqual([]);
    edit(1);
    const editor = screen.getByTestId('move-editor');
    expect(editor).toHaveAttribute('data-pad-scope');
    // Its way out: Back is the scope's back, off the D-pad.
    expect(within(editor).getByTestId('move-editor-back')).toHaveAttribute('data-pad-back');
    expect(within(editor).getByTestId('move-editor-back')).toHaveAttribute('data-pad-skip');
    expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(editor)
        .getAllByRole('spinbutton')
        .map((s) => s.dataset.testid),
    ).toEqual(['move-kind', 'move-elements', 'move-position', 'chain-payment']);
  });

  it("each row edits the draft at once, and the lane's numbers follow: Kind", () => {
    renderSkills();
    const before = damage();
    edit(0);
    stepTo('move-kind', 'Heavy');
    expect(draft()!.moves[0].kind).toBe('heavy');
    expect(saved().primary.moves[0].kind).toBe('light'); // a draft until Apply
    expect(summary()).toHaveTextContent('heavy Fire Bolt · medium Fire Bolt');
    expect(damage()).not.toBe(before);
  });

  it('Elements steps through the pair, then each ordered pair, main element first', () => {
    renderSkills();
    edit(1);
    expect(valuesOf('move-elements')).toEqual(['Fire', 'Nature', 'Fire + Nature', 'Nature + Fire']);
    stepTo('move-elements', 'Nature + Fire');
    expect(draft()!.moves[1].elements).toEqual(['nature', 'fire']);
    expect(screen.getByTestId('element-effect')).toHaveTextContent('Wildfire');
  });

  it('Position moves the move along its chain; the editor stays on it and keeps the focus', () => {
    renderSkills();
    edit(0);
    const position = screen.getByTestId('move-position');
    position.focus();
    expect(position).toHaveAttribute('aria-valuetext', 'Position 1 of 4');
    fireEvent.keyDown(position, { key: 'ArrowRight' });
    expect(summary()).toHaveTextContent(
      'medium Fire Bolt · light Fire Bolt · medium Fire Bolt · heavy Fire Bolt',
    );
    expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('move-position')).toHaveAttribute(
      'aria-valuetext',
      'Position 2 of 4',
    );
    expect(document.activeElement).toBe(screen.getByTestId('move-position'));
    // The draft's origins follow the move: Apply's price sees a reorder, not two new moves.
    expect(store().chainDraft!.origins.primary).toEqual([1, 0, 2, 3]);
  });

  it("Payment is the chain's: one stepper for every move", () => {
    renderSkills();
    edit(2);
    stepTo('chain-payment', 'Charge');
    expect(draft()!.payment).toBe('charge');
    expect(screen.getByTestId('num-cost')).toHaveTextContent(/^Charge \d+/);
  });

  it("Form opens a grid of the slot's forms, each with its line and what it does to the chain; a pick closes it onto the Form row", () => {
    renderSkills();
    edit(0);
    screen.getByTestId('move-form').focus();
    fireEvent.click(screen.getByTestId('move-form'));
    const grid = screen.getByTestId('form-picker');
    expect(grid).toHaveAttribute('data-pad-scope');
    expect(within(grid).getByTestId('form-bolt')).toHaveAttribute('aria-pressed', 'true');
    expect(within(grid).getByTestId('form-damage-lance')).toHaveTextContent(
      /chain damage a second/,
    );
    // A defensive form is no Primary's.
    expect(within(grid).queryByTestId('form-ward')).toBeNull();
    fireEvent.click(within(grid).getByTestId('form-lance'));
    expect(screen.queryByTestId('form-picker')).toBeNull();
    expect(draft()!.moves[0].form).toBe('lance');
    expect(document.activeElement).toBe(screen.getByTestId('move-form'));
  });

  it('Back closes the editor onto its card; another skill or the Mana view closes it too', () => {
    renderSkills();
    edit(2);
    fireEvent.click(screen.getByTestId('move-editor-back'));
    expect(screen.queryByTestId('move-editor')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('move-2'));
    edit(2);
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.queryByTestId('move-editor')).toBeNull();
    edit(0);
    fireEvent.click(screen.getByTestId('mana-realign'));
    expect(screen.queryByTestId('move-editor')).toBeNull();
  });

  it('a blow takes a kind and an element: no form, no payment', () => {
    renderSkills();
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    edit(0);
    expect(screen.queryByTestId('move-form')).toBeNull();
    expect(screen.queryByTestId('chain-payment')).toBeNull();
    expect(valuesOf('move-elements')).toEqual(['Fire', 'Nature']);
  });

  it('mid-dive a card only selects: the editor never opens', () => {
    store().startDive(1);
    renderSkills();
    edit(1);
    expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('move-editor')).toBeNull();
  });

  it('Remove (the mouse’s; X in plan 03) drops the move and closes the editor onto the next card', () => {
    renderSkills();
    edit(1);
    fireEvent.click(screen.getByTestId('move-remove'));
    expect(screen.queryByTestId('move-editor')).toBeNull();
    expect(draft()!.moves.map((m) => m.kind)).toEqual(['light', 'medium', 'heavy']);
    expect(document.activeElement).toBe(screen.getByTestId('move-0'));
  });
});
