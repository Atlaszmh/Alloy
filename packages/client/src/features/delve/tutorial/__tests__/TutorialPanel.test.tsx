import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { tutorialSkippable, tutorialText, type TutorialWhere } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { TutorialPanel } from '../TutorialPanel';
import { SHOWN_AT } from '../tutorial-view';
import { at, fakeText, withSteps } from './tutorial-fixture';

// The runner's text and skip rule are the tutorial's B1: here the step's own words, and no skip.
vi.mock('@alloy/engine', async (orig) => ({
  ...(await orig<typeof import('@alloy/engine')>()),
  tutorialText: vi.fn(),
  tutorialSkippable: vi.fn(),
}));

const onEvent = vi.fn();
const panel = (step: string, where: readonly TutorialWhere[] = SHOWN_AT.dive, count = 0) =>
  render(<TutorialPanel state={at(step, count)} where={where} context="hud" onEvent={onEvent} />);

describe('TutorialPanel', () => {
  beforeEach(() => {
    withSteps();
    vi.mocked(tutorialText).mockImplementation(fakeText);
    vi.mocked(tutorialSkippable).mockReturnValue(false);
    onEvent.mockReset();
    useDelveStore.getState().resetProfile(1234, 'fire');
    useInputDeviceStore.setState({ device: 'keyboard' });
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows Hesta, her line and the objective, the input drawn for the device in hand', () => {
    panel('cast');
    const p = screen.getByTestId('tutorial-panel');
    expect(p).toHaveAccessibleName('Hesta');
    expect(p.querySelector('[data-sprite="hesta"]')).not.toBeNull();
    expect(screen.getByTestId('tutorial-line')).toHaveTextContent('Cast your Primary.');
    const objective = screen.getByTestId('tutorial-objective');
    expect(objective).toHaveTextContent('Cast with Q');
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
    panel('walk');
    expect(screen.getByTestId('tutorial-objective')).toHaveTextContent('Walk with WASD');
    act(() => useInputDeviceStore.setState({ device: 'gamepad' }));
    expect(screen.getByTestId('tutorial-objective')).toHaveTextContent('Walk with Left stick');
  });

  it("counts a step that needs more than one, and shows nothing for another screen's step", () => {
    panel('cast', SHOWN_AT.dive, 1);
    expect(screen.getByTestId('tutorial-objective')).toHaveTextContent('1 / 2');
    panel('forge', SHOWN_AT.dive);
    expect(screen.getAllByTestId('tutorial-panel')).toHaveLength(1);
  });

  it('a reading beat focuses Continue, which sends the ack, as Enter does; the panel is never a scope', () => {
    panel('listen');
    expect(screen.getByTestId('tutorial-panel')).not.toHaveAttribute('data-pad-scope');
    const go = screen.getByTestId('tutorial-continue');
    expect(go).toHaveFocus();
    expect(go).toHaveAttribute('data-pad-first');
    fireEvent.click(go);
    expect(onEvent).toHaveBeenCalledWith({ type: 'ack' });
    // With nothing focused, Enter continues too.
    go.blur();
    fireEvent.keyDown(document.body, { code: 'Enter' });
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('a step to do has no Continue, and Enter is left alone; Skip this step shows when allowed', () => {
    panel('cast');
    expect(screen.queryByTestId('tutorial-continue')).toBeNull();
    fireEvent.keyDown(document.body, { code: 'Enter' });
    expect(onEvent).not.toHaveBeenCalled();
    expect(screen.queryByTestId('tutorial-skip-step')).toBeNull();
    vi.mocked(tutorialSkippable).mockReturnValue(true);
    panel('cast');
    fireEvent.click(screen.getByTestId('tutorial-skip-step'));
    expect(onEvent).toHaveBeenCalledWith({ type: 'skipStep' });
  });
});
