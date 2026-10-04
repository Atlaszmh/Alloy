import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
  applyTutorialEvents,
  tutorialSkippable,
  tutorialText,
  type DelveProfile,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useSandboxStore } from '@/stores/sandboxStore';
import { createArenaInput } from '@/features/delve/arena/input';
import { DamageMeter } from '@/features/delve/training/meter';
import { at, fakeText, withSteps } from '@/features/delve/tutorial/__tests__/tutorial-fixture';
import { DelveTraining } from '../DelveTraining';

const live = vi.hoisted(() => ({ paused: [] as boolean[] }));

// The runner is the tutorial's B1: here the step's own words, no skip, and events that change nothing.
vi.mock('@alloy/engine', async (orig) => ({
  ...(await orig<typeof import('@alloy/engine')>()),
  tutorialText: vi.fn(),
  tutorialSkippable: vi.fn(),
  applyTutorialEvents: vi.fn((_r: unknown, p: DelveProfile) => p),
}));

// The arena itself (Pixi) stands still.
vi.mock('@/features/delve/training/useTrainingArena', () => ({
  useTrainingArena: (_host: unknown, opts: { paused: boolean }) => {
    live.paused.push(opts.paused);
    return {
      input: createArenaInput(),
      heroScreen: () => null,
      pixelsPerUnit: () => 30,
      hud: null,
      meter: new DamageMeter().summary(0),
      actions: { resetMeter: () => {} },
      cast: () => {},
      potion: () => {},
      dodge: () => {},
      attack: () => {},
    };
  },
}));

vi.mock('@/features/delve/training/TrainingPanel', () => ({
  TrainingPanel: () => <aside data-testid="training-panel" />,
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/delve/training']}>
      <Routes>
        <Route path="/delve/training" element={<DelveTraining />} />
      </Routes>
    </MemoryRouter>,
  );
const onStep = (step: string | null) =>
  act(() => {
    const s = useDelveStore.getState();
    s.setProfile({ ...s.profile, tutorial: step ? at(step) : null });
  });

describe('DelveTraining: the guided start', () => {
  beforeEach(() => {
    localStorage.clear();
    withSteps();
    vi.mocked(tutorialText).mockImplementation(fakeText);
    vi.mocked(tutorialSkippable).mockReturnValue(false);
    vi.mocked(applyTutorialEvents).mockClear();
    live.paused.length = 0;
    useDelveStore.getState().resetProfile(1234, 'fire');
  });
  afterEach(() => vi.restoreAllMocks());

  it("on the Training step, opens on the hero's own build with Hesta's panel under the dock", () => {
    onStep('raise');
    const load = vi.spyOn(useSandboxStore.getState(), 'loadMyBuild');
    renderPage();
    expect(load).toHaveBeenCalledWith(useDelveStore.getState().profile);
    const panel = screen.getByTestId('tutorial-panel');
    const right = panel.closest('[data-hud="right"]')!;
    expect(right).not.toBeNull();
    expect(
      screen.getByTestId('training-panel').compareDocumentPosition(panel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(panel).toHaveTextContent('Raise your Defensive.');
    expect(live.paused.at(-1)).toBe(false);
    // With the dock closed, the panel still stands at the column's foot.
    fireEvent.click(screen.getByTestId('training-panel-toggle'));
    expect(screen.queryByTestId('training-panel')).toBeNull();
    expect(screen.getByTestId('tutorial-panel')).toBeInTheDocument();
  });

  it('an ordinary save, or another step, keeps the sandbox its own: no panel, no build loaded', () => {
    const load = vi.spyOn(useSandboxStore.getState(), 'loadMyBuild');
    renderPage();
    expect(screen.queryByTestId('tutorial-panel')).toBeNull();
    onStep('forge');
    expect(screen.queryByTestId('tutorial-panel')).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});
