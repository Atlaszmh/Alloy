import { describe, it, expect } from 'vitest';
import { useInputDeviceStore } from './inputDeviceStore';

describe('inputDeviceStore', () => {
  it('tracks the most recent input device and marks the page for the focus ring', () => {
    const { setDevice } = useInputDeviceStore.getState();
    setDevice('gamepad');
    expect(useInputDeviceStore.getState().device).toBe('gamepad');
    expect(document.documentElement.dataset.input).toBe('gamepad');
    setDevice('keyboard');
    expect(useInputDeviceStore.getState().device).toBe('keyboard');
    expect(document.documentElement.dataset.input).toBe('keyboard');
  });
});
