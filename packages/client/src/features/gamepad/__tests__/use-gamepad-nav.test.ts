import { describe, it, expect, afterEach } from 'vitest';
import { moveFocus } from '../use-gamepad-nav';

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
