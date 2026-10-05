import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import {
  captureNav,
  hudScaleFor,
  navCapture,
  orderPrompts,
  padPrompts,
  scopedLast,
  topScope,
  uiScaleFor,
  usePrompts,
  useUiScale,
} from '../prompts';
import type { Prompt } from '../types';
import { setArenaLive } from '@/features/gamepad/gamepad-hub';
import { PAD_BUTTONS, type PadButton } from '@/features/gamepad/gamepad';
import { useUIStore } from '@/stores/uiStore';

/** Give `el` a box, so it counts as visible. */
function shown<T extends HTMLElement>(el: T): T {
  el.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 });
  return el;
}

function add<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  parent: HTMLElement = document.body,
): HTMLElementTagNameMap[K] {
  const el = parent.appendChild(shown(document.createElement(tag)));
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const keydown = (code: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  const e = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};
const keyup = (code: string) =>
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));

/** The pad's buttons, with `down` held. */
const held = (...down: PadButton[]) =>
  Object.fromEntries(PAD_BUTTONS.map((b) => [b, down.includes(b)])) as Record<PadButton, boolean>;

afterEach(() => {
  setArenaLive(false);
  document.body.replaceChildren();
  (document.activeElement as HTMLElement | null)?.blur?.();
});

describe('topScope and scopedLast', () => {
  it('take the last visible scope, and the last visible match inside it', () => {
    expect(topScope()).toBe(document);
    const a = add('div', { 'data-pad-scope': '' });
    const b = add('div', { 'data-pad-scope': '' });
    const hidden = document.body.appendChild(document.createElement('div'));
    hidden.setAttribute('data-pad-scope', ''); // no box: not visible
    expect(topScope()).toBe(b);
    add('button', { 'data-pad-back': '' }, a);
    const first = add('button', { 'data-pad-back': '' }, b);
    const last = add('button', { 'data-pad-back': '' }, b);
    expect(scopedLast('[data-pad-back]')).toBe(last);
    last.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
    expect(scopedLast('[data-pad-back]')).toBe(first);
    b.remove();
    expect(scopedLast('[data-pad-menu]')).toBeNull();
  });
});

describe('usePrompts on the keyboard', () => {
  it('chords: Ctrl+Enter and Alt+Arrow fire only with their modifiers; a key list fires on any', () => {
    const apply = vi.fn();
    const left = vi.fn();
    const next = vi.fn();
    renderHook(() =>
      usePrompts([
        { id: 'apply', label: 'Apply', binding: { key: 'Enter', ctrl: true }, onPress: apply },
        { id: 'left', label: 'Left', binding: { key: 'ArrowLeft', alt: true }, onPress: left },
        { id: 'next', label: 'Next', binding: { key: ['BracketRight', 'KeyN'] }, onPress: next },
      ]),
    );
    keydown('Enter');
    keydown('ArrowLeft');
    expect(apply).not.toHaveBeenCalled();
    expect(left).not.toHaveBeenCalled();
    expect(keydown('Enter', { ctrlKey: true }).defaultPrevented).toBe(true);
    keydown('ArrowLeft', { altKey: true });
    keydown('KeyN');
    keydown('BracketRight', { ctrlKey: true }); // an extra modifier: not this binding
    expect([apply.mock.calls.length, left.mock.calls.length, next.mock.calls.length]).toEqual([
      1, 1, 1,
    ]);
    keydown('KeyN', { repeat: true });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('only the topmost scope binds: a scope opened over the screen silences its prompts', () => {
    const screen = add('div', { 'data-pad-scope': '' });
    const inner = add('div', {}, screen);
    const ref: RefObject<HTMLElement | null> = { current: inner };
    const salvage = vi.fn();
    const pageWide = vi.fn();
    renderHook(() => {
      usePrompts(
        [{ id: 's', label: 'Salvage', binding: { key: 'Delete' }, onPress: salvage }],
        ref,
      );
      usePrompts([{ id: 'p', label: 'Page', binding: { key: 'KeyP' }, onPress: pageWide }]);
    });
    keydown('Delete');
    expect(salvage).toHaveBeenCalledTimes(1);
    keydown('KeyP'); // bound to the document, but a scope is open
    expect(pageWide).not.toHaveBeenCalled();
    const dialog = add('div', { 'data-pad-scope': '' });
    keydown('Delete');
    expect(salvage).toHaveBeenCalledTimes(1);
    dialog.remove();
    screen.remove();
    keydown('KeyP');
    expect(pageWide).toHaveBeenCalledTimes(1);
  });

  it('a prompt whose ref is unmounted binds nothing', () => {
    const press = vi.fn();
    renderHook(() =>
      usePrompts([{ id: 'x', label: 'X', binding: { key: 'KeyX' }, onPress: press }], createRef()),
    );
    keydown('KeyX');
    expect(press).not.toHaveBeenCalled();
  });

  it('ignores keys typed into an input, a disabled or display-only prompt, and a key already handled', () => {
    const lock = vi.fn();
    const off = vi.fn();
    renderHook(() =>
      usePrompts([
        { id: 'show', label: 'Select', binding: { key: 'KeyS' } },
        { id: 'off', label: 'Off', binding: { key: 'KeyO' }, onPress: off, disabled: true },
        { id: 'lock', label: 'Lock', binding: { key: 'KeyL' }, onPress: lock },
      ]),
    );
    const field = add('input');
    field.focus();
    keydown('KeyL', {}, field);
    expect(lock).not.toHaveBeenCalled();
    field.blur();
    const prevent = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', prevent, true);
    keydown('KeyL');
    window.removeEventListener('keydown', prevent, true);
    expect(lock).not.toHaveBeenCalled();
    expect(keydown('KeyS').defaultPrevented).toBe(false);
    keydown('KeyO');
    expect(off).not.toHaveBeenCalled();
    keydown('KeyL');
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('leaves every key to a focused select or contentEditable element', () => {
    const lock = vi.fn();
    renderHook(() =>
      usePrompts([{ id: 'lock', label: 'Lock', binding: { key: 'KeyL' }, onPress: lock }]),
    );
    const select = add('select');
    const editor = add('div', { contenteditable: 'true' });
    Object.defineProperty(editor, 'isContentEditable', { value: true }); // jsdom lacks it
    keydown('KeyL', {}, select);
    keydown('KeyL', {}, editor);
    expect(lock).not.toHaveBeenCalled();
  });

  it('is inert while the arena is live, Esc and Enter included', () => {
    const lock = vi.fn();
    const back = add('button', { 'data-pad-back': '' });
    const clicks = vi.fn();
    back.addEventListener('click', clicks);
    renderHook(() =>
      usePrompts([{ id: 'lock', label: 'Lock', binding: { key: 'KeyL' }, onPress: lock }]),
    );
    setArenaLive(true);
    keydown('KeyL');
    expect(keydown('Escape').defaultPrevented).toBe(false);
    expect(lock).not.toHaveBeenCalled();
    expect(clicks).not.toHaveBeenCalled();
    setArenaLive(false);
    keydown('Escape');
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it('a held key: onHold(true) on down, onHold(false) on up or a window blur', () => {
    const compare = vi.fn();
    renderHook(() =>
      usePrompts([
        {
          id: 'compare',
          label: 'Full compare',
          binding: { key: 'ShiftLeft', whileHeld: true, pad: 'lt' },
          onHold: compare,
        },
      ]),
    );
    keydown('ShiftLeft', { shiftKey: true });
    keyup('ShiftLeft');
    keydown('ShiftLeft', { shiftKey: true });
    window.dispatchEvent(new Event('blur'));
    expect(compare.mock.calls).toEqual([[true], [false], [true], [false]]);
  });
});

describe('the Esc and Enter rules', () => {
  it("Esc presses the topmost scope's back, else its menu; a prompt bound to Esc takes it instead", () => {
    const clicks: string[] = [];
    const button = (name: string, attr: string, parent?: HTMLElement) =>
      add('button', { [attr]: '' }, parent).addEventListener('click', () => clicks.push(name));
    button('page-back', 'data-pad-back');
    const stop = add('div', { 'data-pad-scope': '' });
    button('stop-menu', 'data-pad-menu', stop);
    const { unmount } = renderHook(() => usePrompts([]));
    keydown('Escape');
    expect(clicks).toEqual(['stop-menu']);
    button('stop-back', 'data-pad-back', stop);
    keydown('Escape');
    expect(clicks).toEqual(['stop-menu', 'stop-back']);
    unmount();
    const mine = vi.fn();
    renderHook(() =>
      usePrompts([{ id: 'esc', label: 'Back', binding: { key: 'Escape' }, onPress: mine }], {
        current: stop,
      }),
    );
    keydown('Escape');
    expect(mine).toHaveBeenCalledTimes(1);
    expect(clicks).toHaveLength(2);
  });

  it('Enter presses the menu only while no control has focus, and never fights a focused button', () => {
    const delve = vi.fn();
    const menu = add('button', { 'data-pad-menu': '' });
    menu.addEventListener('click', delve);
    const plainEnter = vi.fn();
    renderHook(() =>
      usePrompts([{ id: 'go', label: 'Go', binding: { key: 'Enter' }, onPress: plainEnter }]),
    );
    const other = add('button');
    other.focus();
    expect(keydown('Enter', {}, other).defaultPrevented).toBe(false);
    other.blur();
    expect(plainEnter).not.toHaveBeenCalled();
    expect(delve).not.toHaveBeenCalled();
    keydown('Enter');
    expect(plainEnter).toHaveBeenCalledTimes(1); // the screen's own Enter prompt comes first
  });

  it('Enter with nothing focused and no Enter prompt presses the menu', () => {
    const delve = vi.fn();
    add('button', { 'data-pad-menu': '' }).addEventListener('click', delve);
    renderHook(() => usePrompts([]));
    keydown('Enter');
    keydown('Enter', { ctrlKey: true });
    expect(delve).toHaveBeenCalledTimes(1);
  });
});

describe('padPrompts: the tap and the hold', () => {
  const remove = vi.fn();
  const apply = vi.fn();
  const prompts: Prompt[] = [
    { id: 'remove', label: 'Remove', binding: { key: 'Delete', pad: 'y' }, onPress: remove },
    {
      id: 'apply',
      label: 'Apply',
      binding: { key: 'Enter', ctrl: true, pad: 'y', padHold: 600 },
      onHold: apply,
    },
  ];
  const none = new Set<PadButton>();
  const y = new Set<PadButton>(['y']);

  afterEach(() => {
    remove.mockReset();
    apply.mockReset();
  });

  it('a tap fires on its release under 400 ms; a hold at 600 ms; a release between fires neither', () => {
    renderHook(() => usePrompts(prompts));
    expect(padPrompts(y, held('y'), 1000)).toEqual(y);
    expect(remove).not.toHaveBeenCalled(); // not on the press: it might become a hold
    padPrompts(none, held(), 1300);
    expect(remove).toHaveBeenCalledTimes(1);

    padPrompts(y, held('y'), 2000);
    padPrompts(none, held('y'), 2599);
    expect(apply).not.toHaveBeenCalled();
    padPrompts(none, held('y'), 2600);
    padPrompts(none, held('y'), 2700);
    padPrompts(none, held(), 2800);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(true);
    expect(remove).toHaveBeenCalledTimes(1);

    padPrompts(y, held('y'), 3000);
    padPrompts(none, held(), 3500);
    expect([remove.mock.calls.length, apply.mock.calls.length]).toEqual([1, 1]);
  });

  it('a tap alone fires on its press; a display-only prompt takes nothing', () => {
    const salvage = vi.fn();
    renderHook(() =>
      usePrompts([
        { id: 'salvage', label: 'Salvage', binding: { pad: 'x' }, onPress: salvage },
        { id: 'select', label: 'Select', binding: { pad: 'view' } },
      ]),
    );
    const pressed = new Set<PadButton>(['x', 'view']);
    expect(padPrompts(pressed, held('x', 'view'), 0)).toEqual(new Set(['x']));
    expect(salvage).toHaveBeenCalledTimes(1);
    padPrompts(none, held(), 100);
  });

  it('a held trigger: onHold(true) on the press, onHold(false) on the release', () => {
    const compare = vi.fn();
    renderHook(() =>
      usePrompts([
        {
          id: 'compare',
          label: 'Full compare',
          binding: { key: 'ShiftLeft', pad: 'lt', whileHeld: true },
          onHold: compare,
        },
      ]),
    );
    padPrompts(new Set(['lt']), held('lt'), 0);
    padPrompts(none, held('lt'), 900);
    padPrompts(none, held(), 1000);
    expect(compare.mock.calls).toEqual([[true], [false]]);
  });

  it('answers only the topmost scope', () => {
    const scope = add('div', { 'data-pad-scope': '' });
    renderHook(() => usePrompts(prompts, { current: scope }));
    add('div', { 'data-pad-scope': '' });
    expect(padPrompts(y, held('y'), 0).size).toBe(0);
    padPrompts(none, held(), 100);
    expect(remove).not.toHaveBeenCalled();
  });

  it('a press whose screen went away fires nothing: no tap on the release, no hold', () => {
    const first = renderHook(() => usePrompts(prompts));
    padPrompts(y, held('y'), 0);
    first.unmount();
    padPrompts(none, held(), 100);
    const second = renderHook(() => usePrompts(prompts));
    padPrompts(y, held('y'), 1000);
    second.unmount();
    padPrompts(none, held('y'), 1700);
    padPrompts(none, held(), 1800);
    expect([remove.mock.calls.length, apply.mock.calls.length]).toEqual([0, 0]);
  });

  it('the arena going live lets go of every held prompt: held ones hear the release, taps never fire', () => {
    const compare = vi.fn();
    renderHook(() =>
      usePrompts([
        ...prompts,
        {
          id: 'compare',
          label: 'Full compare',
          binding: { key: 'ShiftLeft', pad: 'lt', whileHeld: true },
          onHold: compare,
        },
      ]),
    );
    keydown('ShiftLeft', { shiftKey: true });
    padPrompts(new Set<PadButton>(['y', 'lt']), held('y', 'lt'), 0);
    setArenaLive(true);
    expect(compare.mock.calls).toEqual([[true], [true], [false], [false]]);
    setArenaLive(false);
    keyup('ShiftLeft');
    padPrompts(none, held(), 100);
    expect(compare).toHaveBeenCalledTimes(4);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('captureNav', () => {
  it('holds the handler until released; an older release leaves a newer one', () => {
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = captureNav(first);
    expect(navCapture()).toBe(first);
    const releaseSecond = captureNav(second);
    releaseFirst();
    expect(navCapture()).toBe(second);
    releaseSecond();
    expect(navCapture()).toBeNull();
  });
});

describe('the UI scale', () => {
  it('--ui-scale fits 1920×1080 in quarter steps, rounding down, from 0.75 to 2', () => {
    expect(uiScaleFor(1280, 720)).toBe(0.75);
    expect(uiScaleFor(1600, 900)).toBe(0.75);
    expect(uiScaleFor(1920, 1080)).toBe(1);
    expect(uiScaleFor(1920, 1200)).toBe(1);
    expect(uiScaleFor(2560, 1440)).toBe(1.25);
    expect(uiScaleFor(2560, 1080)).toBe(1);
    expect(uiScaleFor(3840, 2160)).toBe(2);
    expect(uiScaleFor(7680, 4320)).toBe(2);
  });

  it('--hud-scale is the UI scale times the HUD setting, to the nearest quarter, at least 0.75', () => {
    expect(hudScaleFor(1, 1)).toBe(1);
    expect(hudScaleFor(1, 1.25)).toBe(1.25);
    expect(hudScaleFor(1.25, 1.25)).toBe(1.5);
    expect(hudScaleFor(0.75, 0.8)).toBe(0.75);
    expect(hudScaleFor(2, 0.8)).toBe(1.5);
  });

  it('useUiScale reads the mirrored UI scale and the HUD setting', () => {
    const { result } = renderHook(() => useUiScale());
    act(() => {
      useUIStore.getState().setUiScale(1.25);
      useUIStore.getState().setHudScale(1.25);
    });
    expect(result.current).toEqual({ ui: 1.25, hud: 1.5 });
    act(() => {
      useUIStore.getState().setUiScale(1);
      useUIStore.getState().setHudScale(1);
    });
    localStorage.removeItem('alloy:delve:hudScale');
  });
});

describe('orderPrompts', () => {
  const p = (id: string, binding: Prompt['binding']): Prompt => ({ id, label: id, binding });

  it('sorts by the pad button: A, X, Y, the bumpers, the triggers, the sticks, View, Menu, then B', () => {
    const mixed = [
      p('back', { pad: 'b' }),
      p('menu', { key: 'Escape', pad: 'menu' }),
      p('filter', { pad: 'rt' }),
      p('lock', { key: 'KeyL', pad: 'y' }),
      p('tabs', { pad: 'lb' }),
      p('salvage', { key: 'Delete', pad: 'x' }),
      p('depart', { pad: 'view' }),
      p('scroll', { pad: 'rs' }),
      p('equip', { pad: 'a' }),
    ];
    expect(orderPrompts(mixed).map((x) => x.id)).toEqual([
      'equip', 'salvage', 'lock', 'tabs', 'filter', 'scroll', 'depart', 'menu', 'back',
    ]);
  });

  it('keeps the given order among prompts of one button, and puts a prompt with no pad button before B', () => {
    const list = [
      p('back', { pad: 'b' }),
      p('keys-only', { key: 'KeyT' }),
      p('select', { mouse: 'click', pad: 'a' }),
      p('equip', { mouse: 'rmb', pad: 'a' }),
    ];
    expect(orderPrompts(list).map((x) => x.id)).toEqual(['select', 'equip', 'keys-only', 'back']);
  });

  it('returns a new array and leaves its input alone', () => {
    const list = [p('back', { pad: 'b' }), p('equip', { pad: 'a' })];
    const out = orderPrompts(list);
    expect(out).not.toBe(list);
    expect(list.map((x) => x.id)).toEqual(['back', 'equip']);
  });
});
