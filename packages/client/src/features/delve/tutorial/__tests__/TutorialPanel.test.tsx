import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { tutorialSkippable, tutorialText, type TutorialWhere } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { playSound } from '@/shared/utils/sound-manager';
import { STEP_HOLD_MS, LINE_MS, TutorialPanel, type TutorialPlace } from '../TutorialPanel';
import { SHOWN_AT } from '../tutorial-view';
import { at, fakeText, withSteps } from './tutorial-fixture';

// See the pad-nav and guidance spec (2.1): Hesta's objective strip.

// The runner's text and skip rule are the tutorial's B1: here the step's own words, and no skip.
vi.mock('@alloy/engine', async (orig) => ({
  ...(await orig<typeof import('@alloy/engine')>()),
  tutorialText: vi.fn(),
  tutorialSkippable: vi.fn(),
}));

vi.mock('@/shared/utils/sound-manager', () => ({ playSound: vi.fn() }));

const onEvent = vi.fn();
/** The strip at `step`: in the HUD, showing the dive's steps, unless `over` says otherwise. */
const strip = (
  step: string,
  over: { where?: readonly TutorialWhere[]; count?: number; place?: TutorialPlace } = {},
) => (
  <TutorialPanel
    state={at(step, over.count)}
    where={over.where ?? SHOWN_AT.dive}
    place={over.place ?? 'hud'}
    onEvent={onEvent}
  />
);

beforeEach(() => {
  withSteps();
  vi.mocked(tutorialText).mockImplementation(fakeText);
  vi.mocked(tutorialSkippable).mockReturnValue(false);
  onEvent.mockReset();
  vi.mocked(playSound).mockClear();
  useDelveStore.getState().resetProfile(1234, 'fire');
  useInputDeviceStore.setState({ device: 'keyboard' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TutorialPanel (the objective strip)', () => {
  it('is one strip: Hesta, the objective with its inputs for the device in hand, then her line', () => {
    render(strip('cast'));
    const p = screen.getByTestId('tutorial-panel');
    expect(p).toHaveAccessibleName('Hesta');
    expect(p).toHaveAttribute('data-place', 'hud');
    expect(p).toHaveAttribute('data-step', 'cast');
    expect(p).toHaveAttribute('data-pad-group');
    expect(p).not.toHaveAttribute('data-pad-scope');
    expect(p.querySelector('[data-sprite="hesta"]')).not.toBeNull();
    const objective = screen.getByTestId('tutorial-objective');
    const line = screen.getByTestId('tutorial-line');
    expect(objective).toHaveTextContent('Cast with Q');
    expect(line).toHaveTextContent('Cast your Primary.');
    expect(objective.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tutorialText).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'cast',
      undefined,
    );
    act(() => useInputDeviceStore.setState({ device: 'gamepad' }));
    expect(within(objective).getByRole('img', { name: 'RT' })).toBeInTheDocument();
  });

  it('draws moving as the four keys, or the left stick under the pad', () => {
    render(strip('walk'));
    expect(screen.getByTestId('tutorial-objective')).toHaveTextContent('Walk with WASD');
    act(() => useInputDeviceStore.setState({ device: 'gamepad' }));
    expect(screen.getByTestId('tutorial-objective')).toHaveTextContent('Walk with Left stick');
  });

  it("counts a step that needs more than one, and shows nothing for another screen's step", () => {
    render(strip('cast', { count: 1 }));
    expect(screen.getByTestId('tutorial-objective')).toHaveTextContent('1 / 2');
    render(strip('forge'));
    expect(screen.getAllByTestId('tutorial-panel')).toHaveLength(1);
  });

  it('in the HUD her line folds away LINE_MS after a step begins, staying in the DOM; a new step brings it back', () => {
    vi.useFakeTimers();
    const { rerender } = render(strip('cast'));
    const line = () => screen.getByTestId('tutorial-line');
    expect(line()).toBeVisible();
    act(() => vi.advanceTimersByTime(LINE_MS));
    expect(line()).not.toBeVisible();
    expect(line()).toHaveTextContent('Cast your Primary.');
    rerender(strip('walk'));
    act(() => vi.advanceTimersByTime(1000)); // past the step's hold (Task 4), well short of LINE_MS
    expect(line()).toBeVisible();
    expect(line()).toHaveTextContent('Walk to the light.');
  });

  it('her line stays through a beat, and always at the stop and the Anvil', () => {
    vi.useFakeTimers();
    render(strip('listen'));
    render(strip('equip', { place: 'stop' }));
    render(strip('forge', { where: SHOWN_AT.anvil, place: 'anvil' }));
    act(() => vi.advanceTimersByTime(LINE_MS * 2));
    const lines = screen.getAllByTestId('tutorial-line');
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line).toBeVisible();
  });

  it('a reading beat has Continue, which sends the ack, as Enter does', () => {
    render(strip('listen'));
    const go = screen.getByTestId('tutorial-continue');
    fireEvent.click(go);
    expect(onEvent).toHaveBeenCalledWith({ type: 'ack' });
    // With nothing focused, Enter continues too.
    go.blur();
    fireEvent.keyDown(document.body, { code: 'Enter' });
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('a step to do has no Continue, and Enter is left alone', () => {
    render(strip('cast'));
    expect(screen.queryByTestId('tutorial-continue')).toBeNull();
    fireEvent.keyDown(document.body, { code: 'Enter' });
    expect(onEvent).not.toHaveBeenCalled();
    expect(screen.queryByTestId('tutorial-skip-step')).toBeNull();
  });

  it('Skip this step, when allowed, is a mouse button the D-pad passes by, with the way to it from the Menu', () => {
    vi.mocked(tutorialSkippable).mockReturnValue(true);
    render(strip('cast'));
    const skip = screen.getByTestId('tutorial-skip-step');
    expect(skip.closest('[data-pad-skip]')).not.toBeNull();
    expect(skip).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('tutorial-panel')).toHaveTextContent(
      /Stuck\? Skip this step from the\s*Esc\s*Menu/,
    );
    fireEvent.click(skip);
    expect(onEvent).toHaveBeenCalledWith({ type: 'skipStep' });
  });
});

describe("the strip's hold on a finished step", () => {
  beforeEach(() => vi.useFakeTimers());
  const objective = () => screen.getByTestId('tutorial-objective');

  it('holds the finished objective, ticked, for STEP_HOLD_MS with a chime; then the current step, the ones passed meanwhile not replayed', () => {
    const { rerender } = render(strip('cast', { count: 1 }));
    expect(playSound).not.toHaveBeenCalled();
    rerender(strip('listen'));
    expect(screen.getByTestId('tutorial-panel')).toHaveAttribute('data-step', 'listen');
    expect(objective()).toHaveTextContent('Cast with Q');
    expect(within(objective()).getByRole('img', { name: 'Done' })).toBeInTheDocument();
    expect(objective()).not.toHaveTextContent('/ 2');
    expect(playSound).toHaveBeenCalledExactlyOnceWith('orbConfirm');
    act(() => vi.advanceTimersByTime(STEP_HOLD_MS - 100));
    rerender(strip('walk'));
    expect(objective()).toHaveTextContent('Cast with Q');
    act(() => vi.advanceTimersByTime(100));
    expect(objective()).toHaveTextContent('Walk with WASD');
    expect(within(objective()).queryByRole('img', { name: 'Done' })).toBeNull();
    expect(playSound).toHaveBeenCalledTimes(1);
  });

  it('a beat shows Continue only after the hold, and Enter waits with it', () => {
    const { rerender } = render(strip('cast'));
    rerender(strip('listen'));
    expect(screen.queryByTestId('tutorial-continue')).toBeNull();
    fireEvent.keyDown(document.body, { code: 'Enter' });
    expect(onEvent).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(STEP_HOLD_MS));
    expect(screen.getByTestId('tutorial-continue')).toBeInTheDocument();
  });

  it('Skip this step waits out the hold too', () => {
    vi.mocked(tutorialSkippable).mockReturnValue(true);
    const { rerender } = render(strip('cast'));
    rerender(strip('walk'));
    expect(screen.queryByTestId('tutorial-skip-step')).toBeNull();
    act(() => vi.advanceTimersByTime(STEP_HOLD_MS));
    expect(screen.getByTestId('tutorial-skip-step')).toBeInTheDocument();
  });

  it("a screen change drops the hold: the screen's next step shows at once", () => {
    const { rerender } = render(strip('cast'));
    rerender(strip('forge')); // the Anvil's step: this screen shows nothing
    expect(screen.queryByTestId('tutorial-panel')).toBeNull();
    rerender(strip('walk'));
    expect(objective()).toHaveTextContent('Walk with WASD');
    expect(playSound).not.toHaveBeenCalled();
  });

  it('pops the current step in and pulses a count going up; under reduced motion neither moves', () => {
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    try {
      const { rerender } = render(strip('cast'));
      expect(animate).not.toHaveBeenCalled();
      rerender(strip('cast', { count: 1 }));
      expect(animate).toHaveBeenCalledTimes(1);
      expect(animate.mock.contexts[0]).toBe(screen.getByTestId('tutorial-count'));
      rerender(strip('walk'));
      expect(animate).toHaveBeenCalledTimes(1);
      act(() => vi.advanceTimersByTime(STEP_HOLD_MS));
      expect(animate).toHaveBeenCalledTimes(2);
      expect(animate.mock.contexts[1]).toBe(objective());
      vi.stubGlobal('matchMedia', () => ({ matches: true }));
      rerender(strip('cast'));
      act(() => vi.advanceTimersByTime(STEP_HOLD_MS));
      expect(objective()).toHaveTextContent('Cast with Q');
      expect(animate).toHaveBeenCalledTimes(2);
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
      vi.unstubAllGlobals();
    }
  });
});
