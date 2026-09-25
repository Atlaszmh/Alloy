import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { PadButton } from '@/features/gamepad/gamepad';

let padCapture: ((b: PadButton) => void) | null = null;
vi.mock('@/features/gamepad/gamepad-hub', () => ({
  capturePadButton: (cb: (b: PadButton) => void) => {
    padCapture = cb;
    return () => {
      padCapture = null;
    };
  },
}));

import { ControlsPanel } from '../ControlsPanel';
import { DEFAULT_CONTROLS, exportControls } from '../controls';
import { useControlsStore } from '@/stores/controlsStore';

const config = () => useControlsStore.getState().config;
const key = (code: string) => fireEvent.keyDown(window, { code });

describe('ControlsPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useControlsStore.getState().reset();
    padCapture = null;
  });

  it('rebinds a key by pressing it, swapping with the action that had it', () => {
    render(<ControlsPanel onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('bind-key-dodge'));
    expect(screen.getByTestId('bind-key-dodge')).toHaveTextContent('Press');
    key('KeyW');
    expect(config().keys.dodge).toBe('KeyW');
    expect(config().keys.up).toBe('Space');
    expect(screen.getByTestId('bind-key-dodge')).toHaveTextContent('W');
  });

  it('Esc cancels a key capture', () => {
    render(<ControlsPanel onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('bind-key-potion'));
    key('Escape');
    expect(config().keys.potion).toBe(DEFAULT_CONTROLS.keys.potion);
    expect(screen.getByTestId('bind-key-potion')).toHaveTextContent('F');
  });

  it('rebinds a controller button with the next pad press', () => {
    render(<ControlsPanel onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('bind-pad-dodge'));
    expect(padCapture).not.toBeNull();
    act(() => padCapture!('a'));
    expect(config().pad.dodge).toBe('a');
    expect(screen.getByTestId('bind-pad-dodge')).toHaveTextContent('A');
  });

  it('toggles hold-to-repeat and tunes the sticks', () => {
    render(<ControlsPanel onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('repeat-defensive'));
    expect(config().repeat.defensive).toBe(true);
    fireEvent.change(screen.getByTestId('deadzone-right'), { target: { value: '0.25' } });
    expect(config().deadzone.right).toBeCloseTo(0.25);
    fireEvent.change(screen.getByTestId('aim-reach'), { target: { value: '0.6' } });
    expect(config().aimReach).toBeCloseTo(0.6);
  });

  it('resets to the default, and copies the setup to send over', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ControlsPanel onClose={() => {}} />);
    useControlsStore.getState().setPad('primary', 'x');
    fireEvent.click(screen.getByTestId('controls-copy'));
    expect(writeText).toHaveBeenCalledWith(exportControls(config()));
    expect((screen.getByTestId('controls-text') as HTMLTextAreaElement).value).toBe(
      exportControls(config()),
    );
    fireEvent.click(screen.getByTestId('controls-reset'));
    expect(config()).toEqual(DEFAULT_CONTROLS);
  });

  it('closes with its Close button or Esc', () => {
    const onClose = vi.fn();
    render(<ControlsPanel onClose={onClose} />);
    key('Escape');
    fireEvent.click(screen.getByTestId('controls-close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
