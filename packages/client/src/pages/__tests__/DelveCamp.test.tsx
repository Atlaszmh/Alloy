import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { heroChains, settleDive } from '@alloy/engine';
import { DelveCamp } from '../DelveCamp';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '@/features/delve/registry';
import { moveFocus } from '@/features/gamepad/use-gamepad-nav';
import { uiLayer } from '@/features/delve/kit';
import { armed } from '@/features/delve/__tests__/armed';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('DelveCamp', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    useDelveStore.getState().resetProfile(1234, 'fire');
    // An uncommon sword: it carries the Primary.
    useDelveStore.getState().setProfile(armed(useDelveStore.getState().profile));
  });

  it('the Training Grounds button opens the sandbox, even with a dive under way', () => {
    useDelveStore.getState().startDive(1);
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    // Training lives in the Depart sheet, which the footer's Delve opens.
    fireEvent.click(screen.getByTestId('depart-button'));
    const button = screen.getByTestId('training-button');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(mockNavigate).toHaveBeenCalledWith('/delve/training');
  });

  it('closes a settled dive on load: one abandoned mid-floor is over, not resumed', () => {
    const s = useDelveStore.getState();
    s.startDive(1);
    const p = useDelveStore.getState().profile;
    act(() => s.setProfile(settleDive(getDelveRegistry(), p, 'abandon')));
    expect(useDelveStore.getState().profile.dive?.phase).toBe('fighting');
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    expect(useDelveStore.getState().profile.dive).toBeNull();
  });

  /** A Lance in place of the Primary's first move, unapplied. */
  const draftLance = () => {
    const s = useDelveStore.getState();
    const primary = heroChains(getDelveRegistry(), s.profile.equipped, s.profile.pair).primary!;
    act(() =>
      s.editDraft('primary', { ...primary, moves: [{ ...primary.moves[0], form: 'lance' }] }),
    );
  };
  const renderCamp = () =>
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
  /** The footer's Delve, pressed: the Depart sheet, which holds what blocks a dive. */
  const openSheet = () => fireEvent.click(screen.getByTestId('depart-button'));

  it("a pending chain draft blocks the sheet's Delve, saying why; Apply sets it and opens the way", () => {
    draftLance();
    renderCamp();
    const count = screen.getByTestId('draft-count');
    expect(count).toHaveTextContent(/^1$/);
    expect(count).toHaveAttribute('aria-label', '1 unapplied change');
    // The footer's Delve never waits: it opens the sheet, which says what holds the dive.
    expect(screen.getByTestId('depart-button')).toBeEnabled();
    expect(screen.queryByTestId('draft-warning')).toBeNull();
    openSheet();
    const warning = screen.getByTestId('draft-warning');
    expect(warning).toHaveTextContent('Unapplied changes: apply or discard them to delve');
    const delve = screen.getByTestId('delve-button');
    expect(delve).toBeDisabled();
    expect(delve).toHaveAttribute('aria-describedby', warning.id);
    fireEvent.click(delve);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(useDelveStore.getState().chainDraft).not.toBeNull();
    // Free before the first dive: Apply carries no price.
    fireEvent.click(screen.getByTestId('draft-apply'));
    expect(useDelveStore.getState().chainDraft).toBeNull();
    expect(useDelveStore.getState().profile.equipped.weapon!.moveset!.chains.primary).toBeTruthy();
    expect(screen.queryByTestId('draft-warning')).toBeNull();
    expect(screen.getByTestId('delve-button')).toBeEnabled();
  });

  it("Apply shows the price, and the engine's refusal when it can't go through", () => {
    const p = useDelveStore.getState().profile;
    useDelveStore.getState().setProfile({ ...p, stats: { ...p.stats, dives: 1 }, manaDust: 0 });
    draftLance();
    renderCamp();
    openSheet();
    const apply = screen.getByTestId('draft-apply');
    expect(apply).toHaveTextContent(/Apply · \d+ Mana Dust/);
    expect(apply).toBeDisabled();
    const why = screen.getByTestId('draft-apply-why');
    expect(why).toHaveTextContent('Not enough Mana Dust');
    expect(apply).toHaveAttribute('aria-describedby', why.id);
    // The way out still works.
    expect(screen.getByTestId('draft-discard-delve')).toBeEnabled();
  });

  it("Apply's total holds a socket's Links and scrap, and the engine's reason", () => {
    const s = useDelveStore.getState();
    const primary = heroChains(getDelveRegistry(), s.profile.equipped, s.profile.pair).primary!;
    act(() => {
      s.setProfile({ ...s.profile, scrap: 20 });
      s.editDraft('primary', { ...primary, moves: [{ ...primary.moves[0], runes: [null] }] });
    });
    renderCamp();
    openSheet();
    const apply = screen.getByTestId('draft-apply');
    expect(apply).toHaveTextContent('Apply · 1 Link · 20 scrap');
    expect(apply).toBeDisabled(); // the scrap is there, but a new hero has no Links
    expect(screen.getByTestId('draft-apply-why')).toHaveTextContent(/Links/);
  });

  it('Discard changes & delve reverts the draft and starts the dive in one press', () => {
    draftLance();
    renderCamp();
    openSheet();
    fireEvent.click(screen.getByTestId('draft-discard-delve'));
    expect(useDelveStore.getState().chainDraft).toBeNull();
    expect(useDelveStore.getState().profile.dive).not.toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/delve/run');
  });

  it('the store never starts a dive over a pending draft; a dive under way still resumes', () => {
    draftLance();
    expect(useDelveStore.getState().startDive(1)).toBe(false);
    expect(useDelveStore.getState().profile.dive).toBeNull();
    useDelveStore.getState().revertDraft();
    expect(useDelveStore.getState().startDive(1)).toBe(true);
    draftLance();
    renderCamp();
    openSheet();
    expect(screen.queryByTestId('draft-warning')).toBeNull();
    fireEvent.click(screen.getByTestId('delve-button'));
    expect(mockNavigate).toHaveBeenCalledWith('/delve/run');
  });

  it('shows waiting notices as toasts, once', () => {
    const text = 'Storm now outweighs Fire: your basic attacks strike with Storm';
    act(() => useDelveStore.setState({ notices: [text] }));
    render(
      <StrictMode>
        <MemoryRouter>
          <DelveCamp />
        </MemoryRouter>
      </StrictMode>,
    );
    expect(screen.getAllByText(text)).toHaveLength(1);
    expect(useDelveStore.getState().notices).toEqual([]);
  });

  it('a new save chooses its mana first; Frost starts with frost gear and frost abilities', () => {
    useDelveStore.getState().resetProfile(99); // no primary yet
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    // Guided start or Jump in comes first (see the tutorial spec).
    fireEvent.click(screen.getByTestId('guided-jump'));
    const choice = screen.getByTestId('mana-choice');
    expect(choice.closest('[data-pad-scope]')).not.toBeNull();
    // A second element is bound between dives; the chains keep their blows.
    expect(choice).toHaveTextContent("Between dives you'll bind a second element");
    expect(choice).not.toHaveTextContent('last blow');
    const storm = screen.getByTestId('mana-choice-storm');
    expect(storm).toHaveTextContent('Storm chains');
    expect(storm).toHaveTextContent('Every blow applies a stack of Storm: Shock');
    expect(storm).toHaveTextContent('Superconductor');
    fireEvent.click(screen.getByTestId('mana-choice-frost'));
    expect(screen.queryByTestId('mana-choice')).toBeNull();
    const p = useDelveStore.getState().profile;
    expect(p.pair).toEqual({ primary: 'frost', secondary: null });
    expect(p.equipped.weapon!.mana).toBe('frost');
    // Its common sword carries the basic chain alone, in Frost.
    const chains = p.equipped.weapon!.moveset!.chains;
    expect(chains.basic!.map((b) => b.element)).toEqual(['frost', 'frost', 'frost']);
    expect(Object.keys(chains)).toEqual(['basic']);
  });

  it('shows the Links beside the scrap', () => {
    act(() =>
      useDelveStore.getState().setProfile({ ...useDelveStore.getState().profile, links: 3 }),
    );
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('links-count')).toHaveTextContent(/^3 Links$/);
    act(() =>
      useDelveStore.getState().setProfile({ ...useDelveStore.getState().profile, links: 1 }),
    );
    expect(screen.getByTestId('links-count')).toHaveTextContent(/^1 Link$/);
  });

  it('Restart Delve (dev), from the system menu, wipes the save back to the first question', () => {
    const s = useDelveStore.getState();
    s.startDive(1);
    s.setProfile({ ...useDelveStore.getState().profile, scrap: 500 });
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    // The footer's Menu (Esc / Menu) opens the system menu.
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByTestId('restart-delve'));
    // The first press only asks.
    expect(useDelveStore.getState().profile.scrap).toBe(500);
    expect(screen.getByTestId('restart-delve')).toHaveTextContent(/wipe/i);
    fireEvent.click(screen.getByTestId('restart-delve'));
    const p = useDelveStore.getState().profile;
    expect(p).toMatchObject({ scrap: 50, dive: null, pair: { primary: null } }); // the starter kit's scrap
    expect(p.stats.dives).toBe(0);
    expect(screen.getByTestId('guided-choice')).toBeInTheDocument();
    expect(screen.queryByTestId('system-menu')).toBeNull();
  });

  it('asks nothing once the mana is chosen', () => {
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('mana-choice')).toBeNull();
    expect(screen.getByTestId('depart-button').closest('[inert]')).toBeNull();
  });

  it('the choice holds the keyboard and the pad: the Anvil behind it is inert', () => {
    useDelveStore.getState().resetProfile(99);
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('guided-jump'));
    const dialog = screen.getByRole('dialog', { name: 'Choose your mana' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // A kit dialog: in the zoomed UI layer, over the hub.
    expect(dialog.closest('#delve-ui-layer')).not.toBeNull();
    expect(screen.getByTestId('depart-button').closest('[inert]')).not.toBeNull();
    // In the app the UI layer follows the page; here an earlier test's layer may precede it.
    document.body.append(uiLayer());
    // jsdom lays nothing out: give every element a box so the pad sees them.
    const box = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
    try {
      moveFocus('down');
      expect(document.activeElement).toBe(screen.getByTestId('mana-choice-fire'));
    } finally {
      box.mockRestore();
    }
  });
});
