import { describe, it, expect } from 'vitest';
import {
  ACTION_LABELS,
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
    expect(DEFAULT_CONTROLS.pad.dodge).toBe('b');
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

  it('shows every loot label on hold Alt / L3 and opens the journal on J / View', () => {
    expect(DEFAULT_CONTROLS.keys).toMatchObject({ labels: 'AltLeft', journal: 'KeyJ' });
    expect(DEFAULT_CONTROLS.pad).toMatchObject({ labels: 'ls', journal: 'view' });
  });

  it("a saved setup gains a new action's default, unless it already uses it: then unbound", () => {
    const { labels: _l, journal: _j, ...pad } = { ...DEFAULT_CONTROLS.pad, primary: 'view' };
    const { labels: _k, journal: _m, ...keys } = { ...DEFAULT_CONTROLS.keys, primary: 'AltLeft' };
    const c = parseControls({ ...DEFAULT_CONTROLS, pad, keys });
    expect(c.pad).toMatchObject({ primary: 'view', labels: 'ls', journal: null });
    expect(c.keys).toMatchObject({ primary: 'AltLeft', labels: null, journal: 'KeyJ' });
    // An action saved unbound stays so, and a setup without them gains both.
    expect(parseControls({ pad: { journal: null } }).pad.journal).toBeNull();
    expect(parseControls({}).keys).toMatchObject({ labels: 'AltLeft', journal: 'KeyJ' });
  });

  it('exports text that parses back to the same setup', () => {
    const c = bindPad(bindKey(DEFAULT_CONTROLS, 'primary', 'KeyJ'), 'ultimate', 'y');
    expect(parseControls(JSON.parse(exportControls(c)))).toEqual(c);
  });

  it('reads holdToggle: false by default, a saved boolean kept, anything else the default', () => {
    expect(DEFAULT_CONTROLS.holdToggle).toBe(false);
    expect(parseControls({}).holdToggle).toBe(false);
    expect(parseControls({ holdToggle: true }).holdToggle).toBe(true);
    expect(parseControls({ holdToggle: 'yes' }).holdToggle).toBe(false);
    // An older setup, saved before the field, keeps its bindings and gets the default.
    const old = JSON.parse(exportControls(DEFAULT_CONTROLS));
    delete old.holdToggle;
    expect(parseControls(old)).toEqual(DEFAULT_CONTROLS);
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

describe('interact', () => {
  it('is A and C, left unbound where a saved setup already uses either', () => {
    expect([DEFAULT_CONTROLS.pad.interact, DEFAULT_CONTROLS.keys.interact]).toEqual(['a', 'KeyC']);
    const { interact: _p, ...pad } = DEFAULT_CONTROLS.pad;
    const { interact: _k, ...keys } = DEFAULT_CONTROLS.keys;
    expect(parseControls({ ...DEFAULT_CONTROLS, pad, keys })).toEqual(DEFAULT_CONTROLS);
    const taken = parseControls({
      ...DEFAULT_CONTROLS,
      pad: { ...pad, primary: 'a' },
      keys: { ...keys, potion: 'KeyC' },
    });
    expect([taken.pad.interact, taken.keys.interact]).toEqual([null, null]);
  });
});

describe('peek', () => {
  it('is D-pad up and M, labelled for the editor', () => {
    expect([DEFAULT_CONTROLS.pad.peek, DEFAULT_CONTROLS.keys.peek]).toEqual(['up', 'KeyM']);
    expect(ACTION_LABELS.peek).toBe('Peek: map, purse and finds');
  });

  it('a setup saved before it gains it, unless that setup already uses D-pad up or M: then unbound', () => {
    const { peek: _p, ...pad } = DEFAULT_CONTROLS.pad;
    const { peek: _k, ...keys } = DEFAULT_CONTROLS.keys;
    expect(parseControls({ ...DEFAULT_CONTROLS, pad, keys })).toEqual(DEFAULT_CONTROLS);
    const taken = parseControls({
      ...DEFAULT_CONTROLS,
      pad: { ...pad, potion: 'up' },
      keys: { ...keys, interact: 'KeyM' },
    });
    expect([taken.pad.peek, taken.keys.peek]).toEqual([null, null]);
  });
});
