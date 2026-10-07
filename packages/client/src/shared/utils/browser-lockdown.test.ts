import { describe, expect, it } from 'vitest';
import { blockedKey } from './browser-lockdown';

const key = (code: string, init: KeyboardEventInit = {}, target?: EventTarget) => {
  const e = new KeyboardEvent('keydown', { code, ...init });
  if (target) Object.defineProperty(e, 'target', { value: target });
  return e;
};

describe('blockedKey', () => {
  it('blocks the browser shortcuts the game never binds', () => {
    expect(blockedKey(key('KeyS', { ctrlKey: true }))).toBe(true);
    expect(blockedKey(key('KeyP', { metaKey: true }))).toBe(true);
    expect(blockedKey(key('Equal', { ctrlKey: true }))).toBe(true);
    expect(blockedKey(key('F3'))).toBe(true);
    expect(blockedKey(key('AltLeft'))).toBe(true);
  });

  it("leaves the game's keys and the player's bindings alone", () => {
    expect(blockedKey(key('KeyS'))).toBe(false);
    expect(blockedKey(key('KeyZ', { ctrlKey: true }))).toBe(false);
    expect(blockedKey(key('Enter', { ctrlKey: true }))).toBe(false);
    expect(blockedKey(key('F10'), ['F10'])).toBe(false);
  });

  it('leaves text entry alone', () => {
    const input = document.createElement('input');
    expect(blockedKey(key('KeyF', { ctrlKey: true }, input))).toBe(false);
  });
});
