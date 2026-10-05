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
  isArenaLive: () => false,
}));

import { ControlsPanel } from '../ControlsPanel';
import { DEFAULT_CONTROLS, exportControls } from '../controls';
import { useControlsStore } from '@/stores/controlsStore';
import { MANUAL_ATTACK_KEY, useDelveStore } from '@/stores/delveStore';
import { attachPromptKeys } from '@/features/delve/kit/prompts';

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

  it('lists the peek, D-pad up and M, and rebinding it swaps on a clash', () => {
    render(<ControlsPanel onClose={() => {}} />);
    expect(screen.getByTestId('bind-pad-peek')).toHaveTextContent('D-pad ▲');
    expect(screen.getByTestId('bind-key-peek')).toHaveTextContent('M');
    fireEvent.click(screen.getByTestId('bind-pad-peek'));
    act(() => padCapture!('down'));
    expect([config().pad.peek, config().pad.potion]).toEqual(['down', 'up']);
    fireEvent.click(screen.getByTestId('bind-key-peek'));
    key('KeyF');
    expect([config().keys.peek, config().keys.potion]).toEqual(['KeyF', 'KeyM']);
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

  it("switches the basic attack between Auto and Manual, this device's preference", () => {
    useDelveStore.getState().setManualAttack(false);
    render(<ControlsPanel onClose={() => {}} />);
    const toggle = screen.getByTestId('attack-mode-toggle');
    expect(toggle).toHaveTextContent('Basic attack: Auto');
    fireEvent.click(toggle);
    expect(useDelveStore.getState().manualAttack).toBe(true);
    expect(localStorage.getItem(MANUAL_ATTACK_KEY)).toBe('1');
    expect(toggle).toHaveTextContent('Basic attack: Manual');
    fireEvent.click(toggle);
    expect(useDelveStore.getState().manualAttack).toBe(false);
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

  it('opens as a kit dialog: a modal named Controls, in the UI layer, holding the pad', () => {
    render(<ControlsPanel onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Controls' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.closest('[data-pad-scope]')).not.toBeNull();
    expect(dialog.closest('#delve-ui-layer')).not.toBeNull();
  });

  it('closes with its Close button, or once with Esc (the Delve routes press its Back)', () => {
    const release = attachPromptKeys(); // as AppShell does on every Delve route
    const box = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(DOMRect.fromRect({ width: 10, height: 10 }));
    try {
      const onClose = vi.fn();
      render(<ControlsPanel onClose={onClose} />);
      key('Escape');
      expect(onClose).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByTestId('bind-key-potion'));
      key('Escape'); // cancels the capture, never closes
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('bind-key-potion')).toHaveTextContent('F');
      fireEvent.click(screen.getByTestId('controls-close'));
      expect(onClose).toHaveBeenCalledTimes(2);
    } finally {
      box.mockRestore();
      release();
    }
  });
});

describe('ControlsPanel: an unbound action', () => {
  beforeEach(() => useControlsStore.getState().reset());

  it('is flagged, and nothing is while every action is bound', () => {
    render(<ControlsPanel onClose={() => {}} />);
    expect(screen.queryByTestId('controls-unbound')).toBeNull();
    act(() =>
      useControlsStore.setState({
        config: { ...DEFAULT_CONTROLS, pad: { ...DEFAULT_CONTROLS.pad, interact: null } },
      }),
    );
    expect(screen.getByTestId('controls-unbound')).toHaveTextContent('Not bound: Interact.');
  });
});
