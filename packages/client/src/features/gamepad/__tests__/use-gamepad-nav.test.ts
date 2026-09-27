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
});
