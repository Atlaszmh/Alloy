import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { claimDevices, keepFocus, moveFocus } from '../use-gamepad-nav';
import { useInputDeviceStore, type InputDevice } from '@/stores/inputDeviceStore';

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
});
