import { describe, it, expect, afterEach } from 'vitest';
import { attachKeyboard, createArenaInput } from '../arena/input';

const key = (type: 'keydown' | 'keyup', code: string) =>
  window.dispatchEvent(new KeyboardEvent(type, { code }));

describe('ability keys', () => {
  let detach = () => {};
  afterEach(() => detach());

  it('a quick tap casts with auto-aim', () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    key('keydown', 'KeyQ');
    key('keyup', 'KeyQ');
    expect(input.cast).toEqual({ slot: 0, aim: null });
  });

  it('pressing a second ability key while one is held casts the first instead of dropping it', () => {
    const input = createArenaInput();
    const cast = () => input.cast;
    detach = attachKeyboard(input, () => true);
    key('keydown', 'KeyQ');
    key('keydown', 'KeyE');
    expect(input.cast?.slot).toBe(0);
    input.cast = null;
    key('keyup', 'KeyE');
    expect(cast()?.slot).toBe(1);
    input.cast = null;
    key('keyup', 'KeyQ');
    expect(cast()).toBeNull();
    expect(input.aiming).toBeNull();
  });
});
