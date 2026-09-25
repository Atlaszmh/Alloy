import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONTROLS,
  bindKey,
  bindPad,
  exportControls,
  keyLabel,
  padLabel,
  parseControls,
} from '../controls';

describe('controls config', () => {
  it('binding a button that another action uses swaps them', () => {
    const c = bindPad(DEFAULT_CONTROLS, 'dodge', 'rt');
    expect(c.pad.dodge).toBe('rt');
    expect(c.pad.primary).toBe(DEFAULT_CONTROLS.pad.dodge);
    expect(DEFAULT_CONTROLS.pad.dodge).toBe('lt');
  });

  it('binding a key swaps too, including move keys', () => {
    const c = bindKey(DEFAULT_CONTROLS, 'dodge', 'KeyW');
    expect(c.keys.dodge).toBe('KeyW');
    expect(c.keys.up).toBe('Space');
  });

  it('parsing keeps valid fields and falls back per field', () => {
    const c = parseControls({
      version: 1,
      pad: { primary: 'a', dodge: 'not-a-button' },
      keys: { potion: 'KeyG', up: 42 },
      repeat: { defensive: true },
      deadzone: { left: 0.3, right: 9 },
      aimReach: 0.5,
    });
    expect(c.pad.primary).toBe('a');
    expect(c.pad.dodge).toBe(DEFAULT_CONTROLS.pad.dodge);
    expect(c.keys.potion).toBe('KeyG');
    expect(c.keys.up).toBe(DEFAULT_CONTROLS.keys.up);
    expect(c.repeat).toEqual({ ...DEFAULT_CONTROLS.repeat, defensive: true });
    expect(c.deadzone).toEqual({ left: 0.3, right: DEFAULT_CONTROLS.deadzone.right });
    expect(c.aimReach).toBe(0.5);
    expect(parseControls('garbage')).toEqual(DEFAULT_CONTROLS);
  });

  it('exports text that parses back to the same setup', () => {
    const c = bindPad(bindKey(DEFAULT_CONTROLS, 'primary', 'KeyJ'), 'ultimate', 'y');
    expect(parseControls(JSON.parse(exportControls(c)))).toEqual(c);
  });

  it('names buttons and keys for people', () => {
    expect(padLabel('rs')).toBe('R3');
    expect(padLabel('down')).toBe('D-pad ▼');
    expect(padLabel(null)).toBe('—');
    expect(keyLabel('KeyQ')).toBe('Q');
    expect(keyLabel('Space')).toBe('Space');
    expect(keyLabel('Escape')).toBe('Esc');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('Digit2')).toBe('2');
  });
});
