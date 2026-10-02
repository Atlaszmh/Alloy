import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { HowTo } from '../HowTo';
import { useControlsStore } from '@/stores/controlsStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';

describe('HowTo', () => {
  beforeEach(() => {
    localStorage.clear();
    useControlsStore.getState().reset();
    act(() => useInputDeviceStore.getState().setDevice('keyboard'));
  });

  it('speaks mouse and keys with the keys in hand, and names the Skills tab', () => {
    render(<HowTo />);
    const howto = screen.getByTestId('delve-howto');
    expect(howto).toHaveTextContent('hold one to aim with the mouse');
    expect(howto).not.toHaveTextContent('left stick');
    expect(howto).toHaveTextContent('Skills');
    expect(howto).not.toHaveTextContent('Abilities');
  });

  it('speaks the controller once the pad has the input lock', () => {
    render(<HowTo />);
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    const howto = screen.getByTestId('delve-howto');
    expect(howto).toHaveTextContent('The left stick moves and the right stick aims');
    expect(howto).not.toHaveTextContent('hold one to aim with the mouse');
  });

  it("draws the player's own bindings", () => {
    act(() => useControlsStore.getState().setKey('dodge', 'KeyZ'));
    render(<HowTo />);
    expect(screen.getByTestId('delve-howto')).toHaveTextContent('Z dodges');
  });
});
