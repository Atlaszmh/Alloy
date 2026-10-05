import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import {
  applyTutorialEvents,
  startTutorial,
  tutorialSkippable,
  tutorialText,
  type DelveProfile,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { DelveCamp } from '@/pages/DelveCamp';
import { at, fakeText, withSteps } from './tutorial-fixture';

// The runner is the tutorial's B1: a guided start sets the step it is told, and its events change nothing.
const run = vi.hoisted(() => ({ first: 'welcome' }));
vi.mock('@alloy/engine', async (orig) => ({
  ...(await orig<typeof import('@alloy/engine')>()),
  startTutorial: vi.fn((_r: unknown, p: DelveProfile) => ({ ...p, tutorial: at(run.first) })),
  applyTutorialEvents: vi.fn((_r: unknown, p: DelveProfile) => p),
  tutorialText: vi.fn(),
  tutorialSkippable: vi.fn(),
}));

const renderCamp = () =>
  render(
    <MemoryRouter>
      <DelveCamp />
    </MemoryRouter>,
  );

describe('GuidedChoice', () => {
  beforeEach(() => {
    localStorage.clear();
    withSteps();
    run.first = 'welcome';
    vi.mocked(tutorialText).mockImplementation(fakeText);
    vi.mocked(tutorialSkippable).mockReturnValue(false);
    vi.mocked(startTutorial).mockClear();
    vi.mocked(applyTutorialEvents).mockClear();
    useDelveStore.getState().resetProfile(99); // a new save: no primary yet
  });
  afterEach(() => vi.restoreAllMocks());

  it('asks a new save first, as a forced kit dialog focused on Guided start', () => {
    renderCamp();
    const choice = screen.getByRole('dialog', { name: 'How do you want to begin?' });
    expect(choice.closest('#delve-ui-layer')).not.toBeNull();
    expect(within(choice).queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.getByTestId('guided-start')).toHaveFocus();
    expect(screen.getByTestId('guided-start')).toHaveTextContent('Recommended for new players');
    expect(screen.queryByTestId('mana-choice')).toBeNull();
    expect(screen.getByTestId('delve-button').closest('[inert]')).not.toBeNull();
  });

  it('Jump in leaves the save as it is and goes on to the mana choice, then How to delve', () => {
    renderCamp();
    fireEvent.click(screen.getByTestId('guided-jump'));
    expect(startTutorial).not.toHaveBeenCalled();
    expect(useDelveStore.getState().profile.tutorial).toBeNull();
    expect(screen.queryByTestId('guided-choice')).toBeNull();
    fireEvent.click(screen.getByTestId('mana-choice-fire'));
    expect(screen.getByTestId('delve-howto')).toBeInTheDocument();
  });

  it("Guided start starts the tutorial, then the mana choice; then Hesta's beat waits for Continue", () => {
    renderCamp();
    fireEvent.click(screen.getByTestId('guided-start'));
    expect(startTutorial).toHaveBeenCalledTimes(1);
    expect(useDelveStore.getState().profile.tutorial).toEqual(at('welcome'));
    expect(screen.queryByTestId('guided-choice')).toBeNull();
    fireEvent.click(screen.getByTestId('mana-choice-fire'));
    // Hesta in place of How to delve.
    expect(screen.queryByTestId('delve-howto')).toBeNull();
    const panel = screen.getByTestId('tutorial-panel');
    expect(panel).toHaveTextContent('Welcome to the Anvil.');
    // In the hub's own pad scope, focused on Continue.
    expect(panel.closest('[data-pad-scope]')).toBe(screen.getByTestId('hub-anvil'));
    expect(screen.getByTestId('tutorial-continue')).toHaveFocus();
    fireEvent.click(screen.getByTestId('tutorial-continue'));
    expect(applyTutorialEvents).toHaveBeenCalledWith(expect.anything(), expect.anything(), [
      { type: 'ack' },
    ]);
  });

  it('the Anvil shows its own steps and the Training step, never a floor step', () => {
    run.first = 'forge';
    renderCamp();
    fireEvent.click(screen.getByTestId('guided-start'));
    fireEvent.click(screen.getByTestId('mana-choice-fire'));
    expect(screen.getByTestId('tutorial-panel')).toHaveTextContent('Forge a cuirass.');
    expect(screen.queryByTestId('tutorial-continue')).toBeNull();
    const step = (id: string) =>
      act(() => {
        const s = useDelveStore.getState();
        s.setProfile({ ...s.profile, tutorial: at(id) });
      });
    step('raise');
    expect(screen.getByTestId('tutorial-panel')).toHaveAttribute('data-step', 'raise');
    step('cast');
    expect(screen.queryByTestId('tutorial-panel')).toBeNull();
  });
});
