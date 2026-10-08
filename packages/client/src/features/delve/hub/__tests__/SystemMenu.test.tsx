import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import {
  applyTutorialEvents,
  skipTutorial,
  tutorialSkippable,
  type DelveProfile,
} from '@alloy/engine';
import { SystemMenu } from '../SystemMenu';
import { UNSOCKET_KEY, useDelveStore } from '@/stores/delveStore';

// Skipping is the tutorial's B1: here it clears the save's tutorial.
vi.mock('@alloy/engine', async (orig) => ({
  ...(await orig<typeof import('@alloy/engine')>()),
  skipTutorial: vi.fn((p: DelveProfile) => ({ ...p, tutorial: null })),
  // The skip rule and the runner are B1's too: each test says whether the step may be skipped.
  tutorialSkippable: vi.fn(),
  applyTutorialEvents: vi.fn((_r: unknown, p: DelveProfile) => p),
}));

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderMenu = (props: Partial<Parameters<typeof SystemMenu>[0]> = {}) =>
  render(
    <MemoryRouter>
      <SystemMenu onClose={() => {}} {...props} />
    </MemoryRouter>,
  );

describe('SystemMenu', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    vi.mocked(tutorialSkippable).mockReturnValue(false);
    vi.mocked(applyTutorialEvents).mockClear();
    useDelveStore.getState().resetProfile(1234, 'fire');
  });

  it('is a kit dialog: Resume closes it, Title screen leaves for the title screen', () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(menu.closest('#delve-ui-layer')).not.toBeNull();
    fireEvent.click(screen.getByTestId('menu-resume'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('menu-main')).toHaveTextContent('Title screen');
    fireEvent.click(screen.getByTestId('menu-main'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('opens focused on Resume', () => {
    renderMenu();
    expect(screen.getByTestId('menu-resume')).toHaveFocus();
  });

  it('wraps for the pad: the dialog is a [data-pad-wrap] list, its Back included', () => {
    renderMenu();
    const list = screen.getByTestId('system-menu');
    expect(list).toHaveAttribute('data-pad-wrap');
    expect(list).toContainElement(screen.getByTestId('menu-main'));
    expect(list.querySelector('[data-pad-back]')).not.toBeNull();
  });

  it('opens Controls and Settings in its place, and their Close comes back to it', () => {
    renderMenu();
    fireEvent.click(screen.getByTestId('open-controls'));
    expect(screen.getByTestId('controls-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('system-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('controls-close'));
    expect(screen.getByTestId('system-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('open-settings'));
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-close'));
    expect(screen.getByTestId('system-menu')).toBeInTheDocument();
  });

  it('Help opens How to delve in its place, and its Back comes back to the menu', () => {
    renderMenu();
    fireEvent.click(screen.getByTestId('open-help'));
    expect(screen.getByTestId('help-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('system-menu')).toBeNull();
    fireEvent.click(within(screen.getByTestId('help-dialog')).getByRole('button', { name: /back/i }));
    expect(screen.queryByTestId('help-dialog')).toBeNull();
    expect(screen.getByTestId('system-menu')).toBeInTheDocument();
  });

  it("lists a screen's extra entries", () => {
    const onSelect = vi.fn();
    renderMenu({ extra: [{ id: 'anvil', label: 'Anvil', onSelect }] });
    fireEvent.click(screen.getByTestId('menu-anvil'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('while the guided start runs, Skip tutorial asks first: Back keeps it, the confirm drops it', () => {
    act(() => {
      const s = useDelveStore.getState();
      s.setProfile({ ...s.profile, tutorial: { step: 'welcome', count: 0, misses: 0 } });
    });
    const onClose = vi.fn();
    renderMenu({ onClose });
    fireEvent.click(screen.getByTestId('menu-skip-tutorial'));
    const confirm = screen.getByRole('dialog', { name: 'Skip the guided start?' });
    expect(screen.queryByTestId('system-menu')).toBeNull();
    const back = within(confirm).getByRole('button', { name: 'Back' });
    expect(back).toHaveFocus();
    fireEvent.click(back);
    expect(screen.getByTestId('system-menu')).toBeInTheDocument();
    expect(skipTutorial).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('menu-skip-tutorial'));
    fireEvent.click(screen.getByTestId('skip-tutorial-confirm'));
    expect(skipTutorial).toHaveBeenCalledTimes(1);
    expect(useDelveStore.getState().profile.tutorial).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('an ordinary save has no Skip tutorial', () => {
    renderMenu();
    expect(screen.queryByTestId('menu-skip-tutorial')).toBeNull();
  });

  it('Skip this step shows only while the engine allows it, for an Anvil or Training step, and skips through the save', () => {
    const on = (step: string) =>
      act(() => {
        const s = useDelveStore.getState();
        s.setProfile({ ...s.profile, tutorial: { step, count: 0, misses: 0 } });
      });
    on('l1-forge');
    const onClose = vi.fn();
    renderMenu({ onClose });
    expect(screen.queryByTestId('menu-skip-step')).toBeNull();
    vi.mocked(tutorialSkippable).mockReturnValue(true);
    // A floor's step is the dive's to skip (the pause), never this menu's.
    on('d1-rats');
    expect(screen.queryByTestId('menu-skip-step')).toBeNull();
    on('l1-forge');
    fireEvent.click(screen.getByTestId('menu-skip-step'));
    expect(applyTutorialEvents).toHaveBeenCalledWith(expect.anything(), expect.anything(), [
      { type: 'skipStep' },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Restart Delve (dev) wipes the save on a second press, and closes the menu', () => {
    const s = useDelveStore.getState();
    s.startDive(1);
    s.setProfile({ ...useDelveStore.getState().profile, scrap: 500 });
    const onClose = vi.fn();
    renderMenu({ onClose });
    fireEvent.click(screen.getByTestId('restart-delve'));
    // The first press only asks.
    expect(useDelveStore.getState().profile.scrap).toBe(500);
    expect(screen.getByTestId('restart-delve')).toHaveTextContent(/wipe/i);
    fireEvent.click(screen.getByTestId('restart-delve'));
    const p = useDelveStore.getState().profile;
    expect(p).toMatchObject({ scrap: 50, dive: null, pair: { primary: null } }); // the starter kit's scrap
    expect(p.stats.dives).toBe(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the dev chip flips the pull rule and keeps it on this device', () => {
    act(() => useDelveStore.setState({ unsocket: null }));
    renderMenu();
    const chip = screen.getByTestId('unsocket-chip');
    expect(chip).toHaveTextContent('Pull: pays'); // the balance's rule
    fireEvent.click(chip);
    expect(chip).toHaveTextContent('Pull: destroys');
    expect(useDelveStore.getState().unsocket).toBe('destroy');
    expect(localStorage.getItem(UNSOCKET_KEY)).toBe('destroy');
    fireEvent.click(chip);
    expect(chip).toHaveTextContent('Pull: pays');
  });

  it('a production build shows neither Restart nor the pull chip', () => {
    const dev = import.meta.env.DEV;
    import.meta.env.DEV = false as unknown as boolean;
    try {
      renderMenu();
      expect(screen.queryByTestId('restart-delve')).toBeNull();
      expect(screen.queryByTestId('unsocket-chip')).toBeNull();
    } finally {
      import.meta.env.DEV = dev;
    }
  });
});
