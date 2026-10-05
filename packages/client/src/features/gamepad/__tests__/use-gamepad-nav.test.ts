import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import { createElement as h, Fragment, useState } from 'react';
import {
  candidates,
  claimDevices,
  isCandidate,
  keepFocus,
  moveFocus,
  nextFocus,
  useGamepadNav,
} from '../use-gamepad-nav';
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

describe('moveFocus in a wrapping list', () => {
  afterEach(() => document.body.replaceChildren());

  /** A column of buttons 40 px tall, 10 px apart, inside `parent`. */
  const column = (parent: HTMLElement, n: number, left = 0): HTMLButtonElement[] =>
    Array.from({ length: n }, (_, i) => {
      const b = parent.appendChild(document.createElement('button'));
      b.textContent = `row ${i}`;
      b.getBoundingClientRect = () =>
        DOMRect.fromRect({ x: left, y: i * 50, width: 200, height: 40 });
      return b;
    });
  const boxed = (el: HTMLElement) => {
    el.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 400 });
    return el;
  };

  it('down from the last row goes to the first, and up from the first to the last', () => {
    const list = boxed(document.body.appendChild(document.createElement('div')));
    list.setAttribute('data-pad-wrap', '');
    const rows = column(list, 4);
    rows[3].focus();
    moveFocus('down');
    expect(document.activeElement).toBe(rows[0]);
    moveFocus('up');
    expect(document.activeElement).toBe(rows[3]);
  });

  it('does not wrap without the attribute', () => {
    const list = boxed(document.body.appendChild(document.createElement('div')));
    const rows = column(list, 3);
    rows[2].focus();
    moveFocus('down');
    expect(document.activeElement).toBe(rows[2]);
  });

  it('never wraps sideways', () => {
    const list = boxed(document.body.appendChild(document.createElement('div')));
    list.setAttribute('data-pad-wrap', '');
    const rows = column(list, 3);
    rows[1].focus();
    moveFocus('right');
    expect(document.activeElement).toBe(rows[1]);
  });

  it('prefers a real neighbour: a control below the list, outside it, takes the press', () => {
    const list = boxed(document.body.appendChild(document.createElement('div')));
    list.setAttribute('data-pad-wrap', '');
    const rows = column(list, 2);
    const below = document.body.appendChild(document.createElement('button'));
    below.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 0, y: 300, width: 200, height: 40 });
    rows[1].focus();
    moveFocus('down');
    expect(document.activeElement).toBe(below);
  });

  it('leaves nextFocus alone: the audit sees an edge', () => {
    const list = boxed(document.body.appendChild(document.createElement('div')));
    list.setAttribute('data-pad-wrap', '');
    const rows = column(list, 2);
    expect(nextFocus(rows[1], 'down', { memory: false })).toBeNull();
  });
});

describe('candidates: a control scrolled out of its list', () => {
  afterEach(() => document.body.replaceChildren());
  /** `el` with a box `w` × `h` at `left`, `top`. */
  const at = <T extends HTMLElement>(el: T, left: number, top: number, w = 10, h = 10): T => {
    el.getBoundingClientRect = () =>
      ({ left, top, width: w, height: h, right: left + w, bottom: top + h }) as DOMRect;
    return el;
  };
  /**
   * A scrolling list 100 × 100 at 0, 0 holding a row in view (at its top) and one scrolled below
   * it, and a button outside, level with the hidden row.
   */
  const scene = () => {
    const list = at(document.body.appendChild(document.createElement('div')), 0, 0, 100, 100);
    list.style.overflowY = 'auto';
    const shown = at(list.appendChild(document.createElement('button')), 0, 0);
    const hidden = at(list.appendChild(document.createElement('button')), 0, 140);
    const outside = at(document.body.appendChild(document.createElement('button')), 200, 140);
    return { shown, hidden, outside };
  };

  it('is no candidate from outside the list, and is one from inside it', () => {
    const { shown, hidden, outside } = scene();
    expect(candidates(outside)).toEqual([shown, outside]);
    expect(candidates(shown)).toEqual([shown, hidden, outside]);
    expect(candidates(null)).toEqual([shown, outside]);
  });

  it('is never the D-pad\'s pick from outside, and is the next row from inside', () => {
    const { shown, hidden, outside } = scene();
    outside.focus();
    expect(isCandidate(hidden)).toBe(false);
    moveFocus('left');
    // The row scrolled out lies straight to the left: the press finds nothing there.
    expect(document.activeElement).toBe(outside);
    shown.focus();
    moveFocus('down');
    expect(document.activeElement).toBe(hidden);
  });
});

const device = () => useInputDeviceStore.getState().device;
const setDevice = (d: InputDevice) => useInputDeviceStore.getState().setDevice(d);

describe('groups: the focus stays in a pane while it can, and comes back to where it left', () => {
  afterEach(() => {
    document.body.replaceChildren();
    setDevice('keyboard');
  });
  const at = <T extends HTMLElement>(el: T, left: number, top: number, w = 10, h = 10): T => {
    el.getBoundingClientRect = () =>
      ({ left, top, width: w, height: h, right: left + w, bottom: top + h }) as DOMRect;
    return el;
  };
  /** A pane (a group) 100 × 200 at `left`, 0. */
  const pane = (left: number) => {
    const p = at(document.body.appendChild(document.createElement('div')), left, 0, 100, 200);
    p.setAttribute('data-pad-group', '');
    return p;
  };
  const button = (parent: HTMLElement, left: number, top: number) =>
    at(parent.appendChild(document.createElement('button')), left, top);
  /** Two panes side by side: `a1` above `a2` on the left; `b1` far down on the right, `b2` level with `a1`. */
  const scene = () => {
    const [a, b] = [pane(0), pane(200)];
    const [a1, a2] = [button(a, 80, 0), button(a, 80, 100)];
    const [b1, b2] = [button(b, 200, 180), button(b, 200, 0)];
    return { a1, a2, b1, b2 };
  };

  it('picks inside the group first: a nearer control in the next pane waits', () => {
    const { a1, a2, b1, b2 } = scene();
    // b1 is nearer a2's row than a1 is, but down from a1 stays in the pane.
    expect(nextFocus(a1, 'down')).toBe(a2);
    expect(nextFocus(b1, 'up')).toBe(b2);
  });

  it('crosses to the pane that lies that way, even when none of its controls lines up', () => {
    const { a2, b1, b2 } = scene();
    // Nothing of the right pane is in a2's row or its cone; the pane's box is.
    b2.remove();
    expect(nextFocus(a2, 'right')).toBe(b1);
  });

  it('enters a pane at the control in line, and with a memory at the one it last held', () => {
    const { a1, a2, b1, b2 } = scene();
    expect(nextFocus(a1, 'right')).toBe(b2);
    // The player was on b1, then went left and comes back.
    b1.focus();
    keepFocus();
    a1.focus();
    keepFocus();
    expect(nextFocus(a1, 'right')).toBe(b1);
    expect(nextFocus(a1, 'right', { memory: false })).toBe(b2);
    // And the way back lands on a1, whatever lies level with b1.
    b1.focus();
    moveFocus('left');
    expect(document.activeElement).toBe(a1);
    expect(nextFocus(b1, 'left', { memory: false })).toBe(a2);
  });

  it('remembers the control a move leaves, though no frame saw it focused', () => {
    const { a1, a2, b1, b2 } = scene();
    a2.focus();
    keepFocus();
    // Focused by a click or by code in the frame the D-pad moves: no keepFocus between.
    a1.focus();
    moveFocus('right');
    expect(document.activeElement).toBe(b2);
    moveFocus('down');
    expect(document.activeElement).toBe(b1);
    moveFocus('left');
    expect(document.activeElement).toBe(a1);
  });

  it('straight back across panes returns to the control left, whatever pane lies over the one entered', () => {
    // A bag (left) and a sheet (right) over a footer whose only button sits under the sheet.
    const [bag, sheet] = [pane(0), pane(200)];
    const [tile, equip] = [button(bag, 0, 0), button(sheet, 200, 0)];
    const foot = at(document.body.appendChild(document.createElement('div')), 0, 300, 300, 40);
    foot.setAttribute('data-pad-group', '');
    const delve = at(foot.appendChild(document.createElement('button')), 250, 300, 50, 40);
    tile.focus();
    moveFocus('down');
    expect(document.activeElement).toBe(delve);
    // By the picks alone, up from Delve is the sheet over it.
    expect(nextFocus(delve, 'up', { memory: false })).toBe(equip);
    moveFocus('up');
    expect(document.activeElement).toBe(tile);
    // It is the crossing that is remembered, not the bag: from the sheet, the way back is the sheet.
    equip.focus();
    moveFocus('down');
    expect(document.activeElement).toBe(delve);
    moveFocus('up');
    expect(document.activeElement).toBe(equip);
  });

  it('a neighbour inside the pane entered still takes the opposite press', () => {
    const [a, b] = [pane(0), pane(200)];
    const a1 = button(a, 80, 0);
    const [c, d] = [button(b, 200, 0), button(b, 260, 0)];
    // The right pane last held d, so a1's press enters it there, with c between.
    d.focus();
    keepFocus();
    a1.focus();
    moveFocus('right');
    expect(document.activeElement).toBe(d);
    moveFocus('left');
    expect(document.activeElement).toBe(c);
  });

  it('a control in no group is a group of one', () => {
    const lone = at(document.body.appendChild(document.createElement('button')), 400, 0);
    const { b2 } = scene();
    expect(nextFocus(b2, 'right')).toBe(lone);
    expect(nextFocus(lone, 'left')).toBe(b2);
  });

  it('under the pad, a vanished control passes the focus to the nearest one in its pane', () => {
    setDevice('gamepad');
    const { a1, a2, b2 } = scene();
    // With a2 moved to the pane's foot, b2 (120 px from a1) is nearer than a2 (190 px): the pane still wins.
    at(a2, 80, 190);
    a1.focus();
    keepFocus();
    a1.remove();
    keepFocus();
    expect(document.activeElement).toBe(a2);
    expect(document.activeElement).not.toBe(b2);
  });
});

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
const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, menu: 9, up: 12, right: 15 } as const;

describe('the pad outside combat: scopes, tab lists and prompts', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let lastFrame = 0;
  const realGetGamepads = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
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
    const run = [...frames.values()];
    frames.clear();
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
    frames.clear();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.set(++lastFrame, cb);
      return lastFrame;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad()] });
    stop = renderHook(() => useGamepadNav()).unmount;
    tick();
  });
  afterEach(() => {
    stop();
    expect(frames.size).toBe(0); // the pad loop stopped with the hook
    if (realGetGamepads) Object.defineProperty(navigator, 'getGamepads', realGetGamepads);
    else delete (navigator as { getGamepads?: unknown }).getGamepads;
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
    // A tab list the D-pad can reach (not the kit's): the stepped tab takes the focus.
    expect(document.activeElement?.id).toBe('forge');
    tap(PAD.rb);
    expect(top()).toBe('loadout');
    tap(PAD.lb);
    expect(top()).toBe('forge');
    expect(sub()).toBe('basic');
    tap(PAD.rt);
    expect(sub()).toBe('primary');
    expect(document.activeElement?.id).toBe('primary');
    tap(PAD.lt);
    tap(PAD.lt);
    expect(sub()).toBe('defensive');
    expect(top()).toBe('forge');
  });

  it('a skipped tab list (the kit\'s) puts the focus in the content, or leaves it where it survived', () => {
    const list = el('div', { role: 'tablist', 'data-pad-tabs': '', 'data-pad-skip': '' });
    const main = el('div');
    const foot = el('div', { 'data-screen-section': 'screen-foot' });
    const delve = el('button', {}, foot, 0, 100);
    /** Each tab swaps the main's content for its own two controls. */
    const tab = (name: string, selected: boolean) => {
      const t = el('button', { role: 'tab', 'aria-selected': String(selected) }, list);
      t.addEventListener('click', () => {
        for (const o of list.querySelectorAll('[role="tab"]')) o.setAttribute('aria-selected', 'false');
        t.setAttribute('aria-selected', 'true');
        main.replaceChildren();
        el('button', { 'data-name': `${name}-first` }, main, 0, 20);
        el('button', { 'data-name': `${name}-second` }, main, 0, 40);
      });
      return t;
    };
    const [, forge] = [tab('loadout', true), tab('forge', false)];
    const stale = el('button', {}, main, 0, 20);
    const name = () => (document.activeElement as HTMLElement).getAttribute('data-name');
    // The focused control goes with the old tab: the new tab's first control takes the focus.
    stale.focus();
    tap(PAD.rb);
    expect(forge.getAttribute('aria-selected')).toBe('true');
    expect(name()).toBe('forge-first');
    // The focused control survives the switch (the footer's): it keeps the focus.
    delve.focus();
    tap(PAD.rb);
    expect(name()).toBeNull();
    expect(document.activeElement).toBe(delve);
    // And the D-pad never lands on a tab.
    (main.firstElementChild as HTMLElement).focus();
    tap(PAD.up);
    expect((document.activeElement as HTMLElement).getAttribute('role')).not.toBe('tab');
  });

  it("a stepped tab's focus goes to its [data-pad-first] control when it has one, else its first", () => {
    const list = el('div', { role: 'tablist', 'data-pad-tabs': '', 'data-pad-skip': '' });
    const main = el('div');
    /** Whether tab B's second control says the focus lands on it. */
    let marked = true;
    /** Each tab swaps the main's content for its own controls. */
    const tab = (selected: boolean, fill: () => void) => {
      const t = el('button', { role: 'tab', 'aria-selected': String(selected) }, list);
      t.addEventListener('click', () => {
        for (const o of list.querySelectorAll('[role="tab"]')) o.setAttribute('aria-selected', 'false');
        t.setAttribute('aria-selected', 'true');
        main.replaceChildren();
        fill();
      });
      return t;
    };
    const content = (text: string, top: number, attrs: Record<string, string> = {}) => {
      el('button', attrs, main, 0, top).textContent = text;
    };
    tab(true, () => content('only', 20));
    tab(false, () => {
      content('one', 20);
      content('two', 40, marked ? { 'data-pad-first': '' } : {});
      content('three', 60);
    });
    el('button', {}, main, 0, 20).focus();
    tap(PAD.rb);
    expect(document.activeElement?.textContent).toBe('two');
    // And with no [data-pad-first] in the content (step away and back): its first control.
    marked = false;
    tap(PAD.rb);
    expect(document.activeElement?.textContent).toBe('only');
    tap(PAD.rb);
    expect(document.activeElement?.textContent).toBe('one');
  });

  it("a React tab list's switch is rendered before the focus is placed: the new tab's first control", async () => {
    // Boxes by `data-top`: b-second lies where a-only was, so a focus left to fall goes there.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const top = Number(this.dataset.top ?? 0);
      return { left: 0, top, width: 10, height: 10, right: 10, bottom: top + 10 } as DOMRect;
    });
    function Hub() {
      const [tab, setTab] = useState<'a' | 'b'>('a');
      const tabFor = (t: 'a' | 'b') =>
        h('button', { role: 'tab', 'aria-selected': tab === t, onClick: () => setTab(t) });
      return h(
        Fragment,
        null,
        h('div', { role: 'tablist', 'data-pad-tabs': '', 'data-pad-skip': '' }, tabFor('a'), tabFor('b')),
        ...(tab === 'a'
          ? [h('button', { key: 'a', 'data-name': 'a-only', 'data-top': '40' })]
          : [
              h('button', { key: 'b1', 'data-name': 'b-first', 'data-top': '0' }),
              h('button', { key: 'b2', 'data-name': 'b-second', 'data-top': '40' }),
            ]),
      );
    }
    render(h(Hub));
    (document.querySelector('[data-name="a-only"]') as HTMLElement).focus();
    tap(PAD.rb);
    await Promise.resolve();
    tick();
    expect((document.activeElement as HTMLElement).getAttribute('data-name')).toBe('b-first');
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
