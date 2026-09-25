import { describe, it, expect, beforeEach } from 'vitest';
import { CONTROLS_KEY, useControlsStore } from './controlsStore';
import { DEFAULT_CONTROLS } from '@/features/controls/controls';

describe('controlsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useControlsStore.getState().reset();
  });

  it('saves every change on this device', () => {
    const s = useControlsStore.getState();
    s.setPad('dodge', 'a');
    s.setKey('potion', 'KeyG');
    s.setRepeat('ultimate', true);
    s.setDeadzone('right', 0.25);
    s.setAimReach(0.6);
    const saved = JSON.parse(localStorage.getItem(CONTROLS_KEY)!);
    expect(saved.pad.dodge).toBe('a');
    expect(saved.keys.potion).toBe('KeyG');
    expect(saved.repeat.ultimate).toBe(true);
    expect(saved.deadzone.right).toBe(0.25);
    expect(saved.aimReach).toBe(0.6);
  });

  it('ignores out-of-range tuning and resets to the default', () => {
    const s = useControlsStore.getState();
    s.setDeadzone('left', 5);
    expect(useControlsStore.getState().config.deadzone.left).toBe(DEFAULT_CONTROLS.deadzone.left);
    s.setPad('primary', 'x');
    s.reset();
    expect(useControlsStore.getState().config).toEqual(DEFAULT_CONTROLS);
  });
});
