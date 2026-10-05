import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
  applyTutorialEvents,
  createDelveProfile,
  settleDive,
  startDive,
  tutorialSkippable,
  tutorialText,
  type ArpgWorld,
  type DelveProfile,
  type TutorialEvent,
} from '@alloy/engine';
import { createArenaInput } from '@/features/delve/arena/input';
import { getDelveRegistry } from '@/features/delve/registry';
import { useDelveStore } from '@/stores/delveStore';
import type { PauseScreenProps } from '@/features/delve/hub/PauseScreen';
import type { ArenaUiEvent } from '@/features/delve/arena/useArena';
import { at, fakeText, withSteps } from '@/features/delve/tutorial/__tests__/tutorial-fixture';
import { DelveRun } from '../DelveRun';

/** What the mocks saw: the arena's `paused`, the pad's owner, the arena's calls and its world. */
const seen = vi.hoisted(() => ({
  pause: [] as PauseScreenProps[],
  paused: [] as boolean[],
  live: [] as boolean[],
  calls: [] as unknown[],
  onUi: null as null | ((e: ArenaUiEvent) => void),
  world: null as null | { tutorial: unknown },
  /** What the floor does with a tutorial event (the runner's, B1's). */
  advance: null as null | ((e: TutorialEvent) => void),
}));

// The runner is the tutorial's B1: here the step's own words, no skip, and events that change nothing.
vi.mock('@alloy/engine', async (orig) => ({
  ...(await orig<typeof import('@alloy/engine')>()),
  tutorialText: vi.fn(),
  tutorialSkippable: vi.fn(),
  applyTutorialEvents: vi.fn((_r: unknown, p: DelveProfile) => p),
  retryTutorialDepth: vi.fn((_r: unknown, p: DelveProfile) => p),
  skipTutorial: vi.fn((p: DelveProfile) => ({ ...p, tutorial: null })),
  settleDive: vi.fn((_r: unknown, p: DelveProfile) => p),
}));

vi.mock('@/features/gamepad/gamepad-hub', async (orig) => ({
  ...(await orig<object>()),
  setArenaLive: (on: boolean) => seen.live.push(on),
}));

// The arena (Pixi) stands still: its world is `seen.world` (read live), and its calls are recorded.
vi.mock('@/features/delve/arena/useArena', () => ({
  useArena: (_host: unknown, opts: { paused: boolean; onUi: (e: ArenaUiEvent) => void }) => {
    seen.paused.push(opts.paused);
    seen.onUi = opts.onUi;
    return {
      input: createArenaInput(),
      heroScreen: () => null,
      pixelsPerUnit: () => 30,
      hud: null,
      worldRef: {
        get current() {
          return seen.world;
        },
      },
      cast: () => {},
      potion: () => {},
      dodge: () => {},
      attack: () => {},
      flush: () => seen.calls.push('flush'),
      leave: () => {},
      alcove: () => ({ ok: true }),
      retry: (skip?: boolean) => seen.calls.push(skip ? 'retry, skipped' : 'retry'),
      tutorialEvent: (e: TutorialEvent) => {
        seen.calls.push(e);
        seen.advance?.(e);
      },
    };
  },
}));

// The pause as its contract: its tutorial props, Anvil and Abandon.
vi.mock('@/features/delve/hub/PauseScreen', () => ({
  PauseScreen: (props: PauseScreenProps) => {
    seen.pause.push(props);
    return (
      <div data-testid="pause-stub">
        <button type="button" onClick={props.onAnvil}>
          Anvil
        </button>
        <button type="button" onClick={props.onAbandon}>
          Abandon
        </button>
      </div>
    );
  },
}));

const registry = getDelveRegistry();
const renderRun = () =>
  render(
    <MemoryRouter initialEntries={['/delve/run']}>
      <Routes>
        <Route path="/delve/run" element={<DelveRun />} />
        <Route path="/delve" element={<div data-testid="anvil" />} />
      </Routes>
    </MemoryRouter>,
  );
/** The save mid-dive with the guided start at `step`; the floor's own state at `floorStep`. */
const guided = (step: string, floorStep: string | null = step) => {
  const p = startDive(registry, createDelveProfile(registry, 7, { primary: 'fire' }), 1);
  useDelveStore.setState({ profile: { ...p, tutorial: at(step) } });
  seen.world = floorStep ? { tutorial: { ...at(floorStep), tally: {} } } : null;
};
const toStop = () =>
  act(() => {
    const { profile } = useDelveStore.getState();
    useDelveStore.setState({
      profile: {
        ...profile,
        dive: { ...profile.dive!, phase: 'choosing', doorChoices: ['winding'], stop: null },
      },
    });
  });

describe('DelveRun: the guided start', () => {
  beforeAll(() => {
    if (!Element.prototype.animate)
      Element.prototype.animate = function () {
        return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
      };
  });
  beforeEach(() => {
    withSteps();
    vi.mocked(tutorialText).mockImplementation(fakeText);
    vi.mocked(tutorialSkippable).mockReturnValue(false);
    vi.mocked(applyTutorialEvents).mockClear();
    vi.mocked(settleDive).mockClear();
    for (const list of [seen.pause, seen.paused, seen.live, seen.calls]) list.length = 0;
    seen.advance = null;
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the floor's own step above the dock, ahead of the save's", () => {
    guided('walk', 'cast');
    renderRun();
    const panel = screen.getByTestId('tutorial-panel');
    expect(panel.closest('[data-hud="dock"]')).not.toBeNull();
    expect(panel).toHaveTextContent('Cast your Primary.');
    expect(tutorialText).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'cast',
      seen.world,
    );
    expect(seen.paused.at(-1)).toBe(false);
  });

  it('a reading beat holds the fight, no pause screen, until Continue goes to the floor', () => {
    guided('listen');
    // The floor's runner goes on to the next step on the ack.
    seen.advance = () => (seen.world = { tutorial: { ...at('cast'), tally: {} } });
    renderRun();
    expect(seen.paused.at(-1)).toBe(true);
    expect(seen.live.at(-1)).toBe(false);
    expect(screen.queryByTestId('pause-stub')).toBeNull();
    fireEvent.click(screen.getByTestId('tutorial-continue'));
    expect(seen.calls).toEqual([{ type: 'ack' }]);
    expect(applyTutorialEvents).not.toHaveBeenCalled();
    expect(seen.paused.at(-1)).toBe(false);
    expect(seen.live.at(-1)).toBe(true);
    expect(screen.getByTestId('tutorial-panel')).toHaveAttribute('data-step', 'cast');
  });

  it("at a stop the save's step shows over the stop, and its events go to the save", () => {
    guided('equip', null);
    renderRun();
    toStop();
    const panel = screen.getByTestId('tutorial-panel');
    expect(panel).toHaveTextContent('Better weapons carry more skills.');
    // Inside the stop's own pad scope, so the pad reaches it.
    expect(panel.closest('[data-pad-scope]')).toBe(screen.getByTestId('door-choice'));
    vi.mocked(tutorialSkippable).mockReturnValue(true);
    act(() => useDelveStore.setState({ profile: { ...useDelveStore.getState().profile } }));
    fireEvent.click(screen.getByTestId('tutorial-skip-step'));
    expect(applyTutorialEvents).toHaveBeenCalledWith(expect.anything(), expect.anything(), [
      { type: 'skipStep' },
    ]);
  });

  it('a fall shows the retry screen, not the summary; Retry restarts the depth', () => {
    guided('cast');
    renderRun();
    act(() => seen.onUi!({ kind: 'tutorialFell' }));
    expect(screen.getByTestId('tutorial-retry')).toBeInTheDocument();
    expect(screen.queryByTestId('dive-summary')).toBeNull();
    expect(screen.queryByTestId('tutorial-panel')).toBeNull();
    expect(seen.paused.at(-1)).toBe(true);
    fireEvent.click(screen.getByTestId('retry-depth'));
    expect(seen.calls).toEqual(['retry']);
    expect(screen.queryByTestId('tutorial-retry')).toBeNull();
    expect(seen.paused.at(-1)).toBe(false);
  });

  it("the retry screen's Skip tutorial, confirmed, restarts the depth as an ordinary floor", () => {
    guided('cast');
    renderRun();
    act(() => seen.onUi!({ kind: 'tutorialFell' }));
    fireEvent.click(screen.getByTestId('retry-skip-tutorial'));
    fireEvent.click(screen.getByTestId('skip-tutorial-confirm'));
    expect(seen.calls).toEqual(['retry, skipped']);
    expect(screen.queryByTestId('tutorial-retry')).toBeNull();
  });

  it("mid-floor the pause's Abandon and Anvil restart the depth as it was entered, banking nothing", () => {
    guided('cast');
    renderRun();
    fireEvent.click(screen.getByRole('button', { name: 'Dive menu' }));
    expect(seen.pause.at(-1)!.onSkipTutorial).toBeTypeOf('function');
    expect(seen.pause.at(-1)!.onSkipStep).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Abandon' }));
    expect(seen.calls).toEqual(['retry']);
    expect(settleDive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Dive menu' }));
    const retry = vi.spyOn(useDelveStore.getState(), 'retryTutorialDepth');
    fireEvent.click(screen.getByRole('button', { name: 'Anvil' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(seen.calls).toEqual(['retry']); // no flush
    expect(screen.getByTestId('anvil')).toBeInTheDocument();
  });

  it("the pause's Skip tutorial drops the floor's rails with the save's; Skip this step when allowed", () => {
    guided('cast');
    vi.mocked(tutorialSkippable).mockReturnValue(true);
    renderRun();
    fireEvent.click(screen.getByRole('button', { name: 'Dive menu' }));
    const { onSkipTutorial, onSkipStep } = seen.pause.at(-1)!;
    act(() => onSkipStep!());
    expect(seen.calls).toEqual([{ type: 'skipStep' }]);
    const skip = vi.spyOn(useDelveStore.getState(), 'skipTutorial');
    act(() => onSkipTutorial!());
    expect(skip).toHaveBeenCalledWith(seen.world as ArpgWorld);
  });

  it('an extract while the guided start runs ends on Return only: its next step waits at the Anvil', () => {
    guided('equip', null);
    renderRun();
    act(() => {
      const { profile } = useDelveStore.getState();
      useDelveStore.setState({
        profile: { ...profile, dive: { ...profile.dive!, phase: 'extracted' } },
      });
    });
    const summary = screen.getByTestId('dive-summary');
    expect(within(summary).getByTestId('return-camp')).toBeInTheDocument();
    expect(within(summary).queryByTestId('dive-again')).toBeNull();
  });
});
