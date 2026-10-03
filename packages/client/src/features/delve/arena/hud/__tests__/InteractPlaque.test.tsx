import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ArpgWorld } from '@alloy/engine';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { useControlsStore } from '@/stores/controlsStore';
import { DEFAULT_CONTROLS } from '@/features/controls/controls';
import { InteractPlaque } from '../InteractPlaque';
import type { InteractHud } from '../../useArenaCore';

const CHEST: InteractHud = {
  id: '2:1',
  interactable: 'chest',
  text: 'Treasure vault',
  x: 12,
  y: 10,
  channel: null,
};
/** The hero at (10, 10), drawn at (400, 300) at 30 px a unit. */
const world = { current: { hero: { x: 10, y: 10 } } as ArpgWorld };
const plaque = (prompt: InteractHud) => (
  <InteractPlaque
    prompt={prompt}
    world={world}
    heroScreen={() => ({ x: 400, y: 300 })}
    pixelsPerUnit={() => 30}
  />
);

describe('InteractPlaque', () => {
  afterEach(() => {
    act(() => useInputDeviceStore.getState().setDevice('keyboard'));
    useControlsStore.setState({ config: DEFAULT_CONTROLS });
  });

  it("names the interact input for the device holding the lock, and what it does: 'C Open', 'A Pray'", () => {
    const { rerender } = render(plaque(CHEST));
    const el = screen.getByTestId('interact-plaque');
    expect(el).toHaveAttribute('data-interactable', 'chest');
    expect(el).toHaveTextContent(/^COpenTreasure vault$/);
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    rerender(plaque({ ...CHEST, interactable: 'shrine', text: 'Shrine of Vigor: +20% damage' }));
    expect(screen.getByRole('img', { name: 'A' })).toBeInTheDocument();
    expect(el).toHaveTextContent('Pray');
    expect(el).toHaveTextContent('Shrine of Vigor: +20% damage');
  });

  it("follows the player's binding, and says what the alcove and the gate do", () => {
    useControlsStore.setState({
      config: { ...DEFAULT_CONTROLS, keys: { ...DEFAULT_CONTROLS.keys, interact: 'KeyG' } },
    });
    const { rerender } = render(plaque({ ...CHEST, interactable: 'alcove', text: '' }));
    expect(screen.getByTestId('interact-plaque')).toHaveTextContent(/^GForge$/);
    rerender(plaque({ ...CHEST, interactable: 'gate', text: '' }));
    expect(screen.getByTestId('interact-plaque')).toHaveTextContent(/^GLeave$/);
  });

  it("shows a shrine's prayer as it goes", () => {
    render(plaque({ ...CHEST, interactable: 'shrine', channel: 0.5 }));
    expect(screen.getByTestId('interact-plaque')).toHaveTextContent('Praying');
    expect(screen.getByTestId('interact-channel')).toHaveAttribute('aria-valuenow', '50');
  });

  it('stands over its prop on screen: the prop lifts it by its size', () => {
    render(plaque({ ...CHEST, interactable: 'shrine' }));
    // (12, 10 − 1.4): 60 px right of the hero and 42 px up.
    expect(screen.getByTestId('interact-plaque').style.transform).toBe('translate(460px, 258px)');
  });
});
