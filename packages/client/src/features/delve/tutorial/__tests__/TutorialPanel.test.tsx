import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { tutorialSkippable, tutorialText, type TutorialWhere } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { LINE_MS, TutorialPanel, type TutorialPlace } from '../TutorialPanel';
import { SHOWN_AT } from '../tutorial-view';
import { at, fakeText, withSteps } from './tutorial-fixture';

// See the pad-nav and guidance spec (2.1): Hesta's objective strip.

// The runner's text and skip rule are the tutorial's B1: here the step's own words, and no skip.
vi.mock('@alloy/engine', async (orig) => ({
  ...(await orig<typeof import('@alloy/engine')>()),
  tutorialText: vi.fn(),
  tutorialSkippable: vi.fn(),
}));

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
