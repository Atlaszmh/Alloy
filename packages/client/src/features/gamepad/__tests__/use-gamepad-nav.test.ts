import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { claimDevices, keepFocus, moveFocus, useGamepadNav } from '../use-gamepad-nav';
import type { GamepadLike } from '../gamepad';
import { useInputDeviceStore, type InputDevice } from '@/stores/inputDeviceStore';
import { captureNav, usePrompts } from '@/features/delve/kit/prompts';

describe('moveFocus on a list', () => {
  afterEach(() => document.body.replaceChildren());

  it('left and right step a focused select, clamped at its ends, with a change event', () => {
    const list = document.body.appendChild(document.createElement('select'));
    for (const v of ['a', 'b', 'c']) list.appendChild(new Option(v, v));
    let changes = 0;
    list.addEventListener('change', () => changes++);
    list.focus();

    moveFocus('right');
    expect(list.value).toBe('b');
    moveFocus('right');
    moveFocus('right'); // already at the end: no change
    expect(list.value).toBe('c');
    expect(changes).toBe(2);
    moveFocus('left');
    expect(list.value).toBe('b');
    expect(changes).toBe(3);
    expect(document.activeElement).toBe(list);
  });

  it('steps over disabled options, and stays put when only disabled ones lie ahead', () => {
    const list = document.body.appendChild(document.createElement('select'));
    for (const v of ['a', 'b', 'c', 'd']) list.appendChild(new Option(v, v));
    list.options[1].disabled = true;
    list.options[3].disabled = true;
    list.focus();

    moveFocus('right');
    expect(list.value).toBe('c');
    moveFocus('right'); // only a disabled option ahead
    expect(list.value).toBe('c');
    moveFocus('left');
    expect(list.value).toBe('a');
  });
});

describe('moveFocus between buttons', () => {
  afterEach(() => document.body.replaceChildren());

  it('skips a button a disabled fieldset turns off', () => {
    const button = (left: number) => {
      const b = document.createElement('button');
      b.getBoundingClientRect = () =>
        ({ left, top: 0, width: 10, height: 10, right: left + 10, bottom: 10 }) as DOMRect;
      return b;
    };
    const locked = document.createElement('fieldset');
    locked.disabled = true;
    const first = button(0);
    const last = button(40);
    locked.appendChild(button(20));
    document.body.append(first, locked, last);
    first.focus();
    moveFocus('right');
    expect(document.activeElement).toBe(last);
  });

  it('skips a field or a list a disabled fieldset turns off, as it does a button', () => {
    const at = <T extends HTMLElement>(el: T, left: number): T => {
      el.getBoundingClientRect = () =>
        ({ left, top: 0, width: 10, height: 10, right: left + 10, bottom: 10 }) as DOMRect;
      return el;
    };
    const locked = document.createElement('fieldset');
    locked.disabled = true;
    const first = at(document.createElement('button'), 0);
    const last = at(document.createElement('button'), 60);
    locked.append(
      at(document.createElement('input'), 20),
      at(document.createElement('select'), 40),
    );
    document.body.append(first, locked, last);
    first.focus();
    moveFocus('right');
    expect(document.activeElement).toBe(last);
  });

  it('never lands on a [data-pad-skip] control (a prompt bar button)', () => {
    const at = (left: number, skip = false) => {
      const b = document.body.appendChild(document.createElement('button'));
      if (skip) b.setAttribute('data-pad-skip', '');
      b.getBoundingClientRect = () =>
        ({ left, top: 0, width: 10, height: 10, right: left + 10, bottom: 10 }) as DOMRect;
      return b;
    };
    const first = at(0);
    at(20, true);
    const last = at(40);
    first.focus();
    moveFocus('right');
    expect(document.activeElement).toBe(last);
  });
});

const device = () => useInputDeviceStore.getState().device;
const setDevice = (d: InputDevice) => useInputDeviceStore.getState().setDevice(d);

describe('keys, the mouse and touch claim the input lock', () => {
  let stop = () => {};
  beforeEach(() => {
    stop = claimDevices();
    setDevice('gamepad');
  });
  afterEach(() => {
    stop();
    setDevice('keyboard');
  });
  const move = (x: number, y: number, pointerType = 'mouse') =>
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType }));

  it('a key press claims the keyboard', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
    expect(device()).toBe('keyboard');
  });

  it('the mouse claims it moving past a few pixels, not bumped; a touch drag never', () => {
    move(100, 100);
    move(108, 106); // 10 px: a bump on the desk
    expect(device()).toBe('gamepad');
    move(400, 400, 'touch');
    expect(device()).toBe('gamepad');
    move(112, 112); // 17 px from where it lay
    expect(device()).toBe('keyboard');
  });

  it('a click or the wheel claims the keyboard, a touch claims touch', () => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }));
    expect(device()).toBe('keyboard');
    window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' }));
    expect(device()).toBe('touch');
    window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse' }));
    expect(device()).toBe('keyboard');
  });

  it('the travel counts from where the mouse lay when another device took the lock', () => {
    move(100, 100);
    setDevice('keyboard');
    move(300, 300);
    setDevice('gamepad');
    move(310, 300); // 10 px from 300,300, not from 100,100
    expect(device()).toBe('gamepad');
  });
});

describe('keepFocus: the pad never loses the focus', () => {
  afterEach(() => {
    document.body.replaceChildren();
    setDevice('keyboard');
  });
  /** A button whose box sits at `left`, `top`. */
  const button = (left: number, top = 0, parent: HTMLElement = document.body) => {
    const b = parent.appendChild(document.createElement('button'));
    b.getBoundingClientRect = () =>
      ({ left, top, width: 10, height: 10, right: left + 10, bottom: top + 10 }) as DOMRect;
    return b;
  };

  it('under the pad, a focused control that vanishes passes the focus to the nearest one', () => {
    setDevice('gamepad');
    const [, mid, near] = [button(0), button(100), button(120)];
    mid.focus();
    keepFocus();
    mid.remove();
    expect(document.activeElement).toBe(document.body);
    keepFocus();
    expect(document.activeElement).toBe(near);
  });

  it('under the keyboard or the mouse, it leaves the focus alone', () => {
    const [, mid] = [button(0), button(100), button(120)];
    mid.focus();
    keepFocus();
    mid.remove();
    keepFocus();
    expect(document.activeElement).toBe(document.body);
  });

  it('a pad scope opening takes the focus inside, to its first control', () => {
    setDevice('gamepad');
    const outside = button(0);
    outside.focus();
    keepFocus();
    const sheet = document.body.appendChild(document.createElement('div'));
    sheet.setAttribute('data-pad-scope', '');
    sheet.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }) as DOMRect;
    const first = button(50, 50, sheet);
    button(10, 60, sheet);
    keepFocus();
    expect(document.activeElement).toBe(first);
  });

  it("a scope with no remembered focus starts on its [data-pad-first] (the hub's Delve button)", () => {
    setDevice('gamepad');
    const hub = document.body.appendChild(document.createElement('div'));
    hub.setAttribute('data-pad-scope', '');
    hub.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }) as DOMRect;
    button(0, 0, hub);
    const delve = button(100, 150, hub);
    delve.setAttribute('data-pad-first', '');
    keepFocus();
    expect(document.activeElement).toBe(delve);
  });

  it('never scrolls to the control it focuses: a sheet still sliding in would drag the page under it', () => {
    setDevice('gamepad');
    const b = button(0, 2000);
    let scrolled = false;
    b.scrollIntoView = () => (scrolled = true);
    const focus = b.focus.bind(b);
    let opts: FocusOptions | undefined;
    b.focus = (o?: FocusOptions) => {
      opts = o;
      focus(o);
    };
    keepFocus();
    expect(document.activeElement).toBe(b);
    expect(scrolled).toBe(false);
    expect(opts).toEqual({ preventScroll: true });
  });
});

/** The standard mapping's button indices. */
const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, menu: 9, right: 15 } as const;

describe('the pad outside combat: scopes, tab lists and prompts', () => {
  let frames: FrameRequestCallback[] = [];
  let down: number[] = [];
  let now = 0;
  let stop = () => {};
  const pad = (): GamepadLike => ({
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: down.includes(i),
      value: down.includes(i) ? 1 : 0,
    })),
  });
  /** One animation frame, 16 ms on: the hub reads the pad once. */
  const tick = () => {
    const run = frames;
    frames = [];
    now += 16;
    for (const cb of run) cb(now);
  };
  /** Press a button for one frame, then let it go. */
  const tap = (button: number) => {
    down = [button];
    tick();
    down = [];
    tick();
  };
  /** A visible element with a box at `left`, `top`. */
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Record<string, string> = {},
    parent: HTMLElement = document.body,
    left = 0,
    top = 0,
  ): HTMLElementTagNameMap[K] => {
    const e = parent.appendChild(document.createElement(tag));
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    e.getBoundingClientRect = () =>
      ({ left, top, width: 10, height: 10, right: left + 10, bottom: top + 10 }) as DOMRect;
    return e;
  };
  const clicks: string[] = [];
  const named = (e: HTMLElement, name: string) => {
    e.addEventListener('click', () => clicks.push(name));
    return e;
  };

  beforeEach(() => {
    clicks.length = 0;
    down = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad()] });
    stop = renderHook(() => useGamepadNav()).unmount;
    tick();
  });
  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    setDevice('keyboard');
  });

  it("B presses the topmost scope's back, never the page's; Menu its menu, else its back", () => {
    named(el('button', { 'data-pad-back': '' }), 'page-back');
    named(el('button', { 'data-pad-menu': '' }), 'page-menu');
    const sheet = el('div', { 'data-pad-scope': '' });
    named(el('button', { 'data-pad-back': '' }, sheet), 'sheet-back');
    tap(PAD.b);
    tap(PAD.menu);
    expect(clicks).toEqual(['sheet-back', 'sheet-back']);
    named(el('button', { 'data-pad-menu': '' }, sheet), 'sheet-menu');
    tap(PAD.menu);
    sheet.remove();
    tap(PAD.menu);
    tap(PAD.b);
    expect(clicks).toEqual(['sheet-back', 'sheet-back', 'sheet-menu', 'page-menu', 'page-back']);
  });

  it('RB steps the top-level tabs and RT the sub list, both past disabled tabs', () => {
    const list = (attrs: Record<string, string>, ids: string[], off: string[] = []) => {
      const l = el('div', { role: 'tablist', ...attrs });
      for (const [i, id] of ids.entries()) {
        const t = el('button', { role: 'tab', 'aria-selected': String(i === 0) }, l);
        t.id = id;
        if (off.includes(id)) t.setAttribute('aria-disabled', 'true');
        t.addEventListener('click', () => {
          for (const o of l.querySelectorAll('[role="tab"]'))
            o.setAttribute('aria-selected', 'false');
          t.setAttribute('aria-selected', 'true');
        });
      }
      return () => l.querySelector('[aria-selected="true"]')?.id;
    };
    const top = list({ 'data-pad-tabs': '' }, ['loadout', 'skills', 'forge'], ['skills']);
    const sub = list({ 'data-pad-tabs': 'sub' }, ['basic', 'primary', 'defensive']);
    tap(PAD.rb);
    expect(top()).toBe('forge');
    tap(PAD.rb);
    expect(top()).toBe('loadout');
    tap(PAD.lb);
    expect(top()).toBe('forge');
    expect(sub()).toBe('basic');
    tap(PAD.rt);
    expect(sub()).toBe('primary');
    tap(PAD.lt);
    tap(PAD.lt);
    expect(sub()).toBe('defensive');
    expect(top()).toBe('forge');
  });

  it("a screen's prompt takes its button first; A still presses the focused control", () => {
    const salvage = vi.fn();
    const back = vi.fn();
    const select = vi.fn();
    renderHook(() =>
      usePrompts([
        { id: 'salvage', label: 'Salvage', binding: { pad: 'x' }, onPress: salvage },
        { id: 'back', label: 'Back', binding: { pad: 'b' }, onPress: back },
        { id: 'select', label: 'Select', binding: { pad: 'a' }, onPress: select },
      ]),
    );
    named(el('button', { 'data-pad-back': '' }), 'page-back');
    const focused = named(el('button'), 'focused');
    focused.focus();
    tap(PAD.x);
    tap(PAD.b);
    tap(PAD.a);
    expect([salvage.mock.calls.length, back.mock.calls.length, select.mock.calls.length]).toEqual([
      1, 1, 0,
    ]);
    expect(clicks).toEqual(['focused']);
  });

  it('holding Y past its hold fires the hold prompt, and never the tap', () => {
    const remove = vi.fn();
    const apply = vi.fn();
    renderHook(() =>
      usePrompts([
        { id: 'remove', label: 'Remove', binding: { pad: 'y' }, onPress: remove },
        { id: 'apply', label: 'Apply', binding: { pad: 'y', padHold: 600 }, onHold: apply },
      ]),
    );
    down = [PAD.y];
    for (let i = 0; i < 40; i++) tick(); // 640 ms
    down = [];
    tick();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    tap(PAD.y);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('while a card is carried, the D-pad and A, B and X go to it, not the focus or the back', () => {
    named(el('button', { 'data-pad-back': '' }), 'page-back');
    const first = el('button', {}, document.body, 0, 0);
    el('button', {}, document.body, 40, 0);
    first.focus();
    const heard: string[] = [];
    const release = captureNav((input) => heard.push(input));
    tap(PAD.right);
    tap(PAD.x);
    tap(PAD.a);
    tap(PAD.b);
    expect(heard).toEqual(['right', 'x', 'a', 'b']);
    expect(clicks).toEqual([]);
    expect(document.activeElement).toBe(first);
    release();
    tap(PAD.right);
    expect(document.activeElement).not.toBe(first);
  });
});
