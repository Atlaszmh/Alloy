import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { heroChains, type Chains } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { SANDBOX_KEY, useSandboxStore } from '@/stores/sandboxStore';
import { armed } from '../../../__tests__/armed';
import { getDelveRegistry } from '../../../registry';
import { ApplySheet } from '../ApplySheet';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useNavigate: () => mockNavigate,
}));

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
const onClose = vi.fn();
const renderSheet = () =>
  render(
    <MemoryRouter>
      <ApplySheet skill="primary" onClose={onClose} />
    </MemoryRouter>,
  );
/** The Primary's first Strike made a Lance. */
const draftLance = () => {
  const primary = chains().primary;
  act(() =>
    store().editDraft('primary', { ...primary, moves: [{ ...primary.moves[0], form: 'lance' }] }),
  );
};

describe('the Apply sheet', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().setProfile(armed(store().profile));
    useDelveStore.setState({ unsocket: null });
    onClose.mockClear();
    mockNavigate.mockClear();
  });

  it('lists each change, the price and nothing destroyed; Apply is the first focus', () => {
    draftLance();
    renderSheet();
    const sheet = screen.getByTestId('apply-sheet');
    expect(within(sheet).getByTestId('apply-line-primary')).toHaveTextContent('medium Fire Strike');
    expect(within(sheet).getByTestId('apply-line-primary')).toHaveTextContent('medium Fire Lance');
    expect(within(sheet).getByTestId('apply-sheet-price')).toHaveTextContent(
      'free until your first dive',
    );
    const confirm = within(sheet).getByTestId('apply-sheet-confirm');
    expect(confirm).toBeEnabled();
    expect(confirm).toHaveAttribute('data-pad-first');
    expect(confirm).toHaveAttribute('data-tutorial', 'skills.apply');
    expect(confirm).toHaveFocus();
  });

  it('A (its Apply) applies the draft and closes it', () => {
    draftLance();
    renderSheet();
    fireEvent.click(screen.getByTestId('apply-sheet-confirm'));
    expect(chains().primary.moves[0].form).toBe('lance');
    expect(store().chainDraft).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('B (its Back) returns with the draft as it was', () => {
    draftLance();
    renderSheet();
    fireEvent.click(within(screen.getByTestId('apply-sheet')).getByRole('button', { name: /Back/ }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(store().chainDraft?.chains.primary?.moves[0].form).toBe('lance');
    expect(chains().primary.moves[0].form).toBe('strike');
  });

  it('Discard changes reverts the draft and closes it', () => {
    draftLance();
    renderSheet();
    fireEvent.click(screen.getByTestId('apply-sheet-discard'));
    expect(store().chainDraft).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('a draft the engine refuses: Apply is off, the reason beside it, and the first focus leaves it', () => {
    // A rune the pouch doesn't hold, socketed in the draft.
    const primary = chains().primary;
    act(() =>
      store().editDraft('primary', {
        ...primary,
        moves: primary.moves.map((m) => ({ ...m, runes: [{ id: 'chain', tier: 1 as const }] })),
      }),
    );
    renderSheet();
    const confirm = screen.getByTestId('apply-sheet-confirm');
    expect(confirm).toBeDisabled();
    expect(confirm).not.toHaveAttribute('data-pad-first');
    const why = screen.getByTestId('apply-sheet-why');
    expect(why).toHaveTextContent('Not enough runes in your pouch');
    expect(confirm).toHaveAttribute('aria-describedby', why.id);
  });

  it('Try in Training loads the draft into the sandbox, unapplied, and opens the Training Grounds with the way back to this skill', () => {
    localStorage.removeItem(SANDBOX_KEY);
    draftLance();
    renderSheet();
    fireEvent.click(screen.getByTestId('apply-sheet-try'));
    const sandbox = useSandboxStore.getState();
    expect(sandbox.chains.primary.moves[0].form).toBe('lance');
    expect(sandbox.loadedWeapon?.uid).toBe(store().profile.equipped.weapon!.uid);
    expect(sandbox.primary).toBe('fire');
    // The draft stays a draft: the save is untouched, the draft as it was.
    expect(chains().primary.moves[0].form).toBe('strike');
    expect(store().chainDraft?.chains.primary?.moves[0].form).toBe('lance');
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith('/delve/training', {
      state: { back: { tab: 'skills', skill: 'primary' } },
    });
  });

  it('Try in Training loads a draft the engine would refuse too: the sandbox is free', () => {
    const primary = chains().primary;
    act(() =>
      store().editDraft('primary', {
        ...primary,
        moves: primary.moves.map((m) => ({ ...m, runes: [{ id: 'chain', tier: 1 as const }] })),
      }),
    );
    renderSheet();
    expect(screen.getByTestId('apply-sheet-try')).toBeEnabled();
    fireEvent.click(screen.getByTestId('apply-sheet-try'));
    expect(useSandboxStore.getState().chains.primary.moves[0].runes).toEqual([
      { id: 'chain', tier: 1 },
    ]);
  });

  it('names what Apply destroys', () => {
    // A socketed rune pulled under the 'destroy' rule (the dev override): the price says so.
    act(() => store().setUnsocket('destroy'));
    const runed = { ...chains().primary.moves[0], runes: [{ id: 'quick', tier: 3 as const }] };
    const p = store().profile;
    const weapon = p.equipped.weapon!;
    store().setProfile({
      ...p,
      equipped: {
        ...p.equipped,
        weapon: {
          ...weapon,
          moveset: {
            ...weapon.moveset!,
            chains: { ...weapon.moveset!.chains, primary: { ...chains().primary, moves: [runed] } },
          },
        },
      },
    });
    act(() =>
      store().editDraft('primary', { ...chains().primary, moves: [{ ...runed, runes: [null] }] }),
    );
    renderSheet();
    expect(screen.getByTestId('apply-sheet-price')).toHaveTextContent('destroys Quick III');
  });
});
