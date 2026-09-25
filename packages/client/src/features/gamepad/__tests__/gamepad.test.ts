import { describe, it, expect } from 'vitest';
import { edges, radialDeadzone, readPad, type GamepadLike } from '../gamepad';
import { padToArena } from '../arena-pad';
import { pickNext, type NavRect } from '../spatial-nav';

/** A standard-mapping pad with the given buttons held and stick axes. */
function fakePad(held: number[] = [], axes: number[] = [0, 0, 0, 0]): GamepadLike {
  return {
    connected: true,
    mapping: 'standard',
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: held.includes(i),
      value: held.includes(i) ? 1 : 0,
    })),
  };
}

describe('radialDeadzone', () => {
  it('zeroes small tilts and rescales the rest to 0..1', () => {
    expect(radialDeadzone(0.1, 0.1, 0.2)).toEqual({ x: 0, y: 0 });
    const full = radialDeadzone(1, 0, 0.2);
    expect(full.x).toBeCloseTo(1);
    const half = radialDeadzone(0.6, 0, 0.2);
    expect(half.x).toBeCloseTo(0.5);
    const diag = radialDeadzone(1, 1, 0.2);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1);
  });
});

describe('readPad', () => {
  it('names the standard buttons and deadzones both sticks', () => {
    const s = readPad(fakePad([0, 2, 7], [0.1, 0, 0.9, 0]));
    expect(s.buttons.a).toBe(true);
    expect(s.buttons.x).toBe(true);
    expect(s.buttons.rt).toBe(true);
    expect(s.buttons.b).toBe(false);
    expect(s.left).toEqual({ x: 0, y: 0 });
    expect(s.right.x).toBeGreaterThan(0.8);
  });

  it('counts a trigger as held past 0.4', () => {
    const withRt = (value: number): GamepadLike => ({
      ...fakePad(),
      buttons: fakePad().buttons.map((b, i) => (i === 7 ? { pressed: false, value } : b)),
    });
    expect(readPad(withRt(0.5)).buttons.rt).toBe(true);
    expect(readPad(withRt(0.2)).buttons.rt).toBe(false);
  });
});

describe('edges', () => {
  it('reports buttons that went down since the last read', () => {
    const before = readPad(fakePad([0]));
    const after = readPad(fakePad([0, 3]));
    expect([...edges(before, after)]).toEqual(['y']);
    expect([...edges(null, after)].sort()).toEqual(['a', 'y']);
  });
});

describe('padToArena (triggers fire, bumpers support)', () => {
  it('keeps both thumbs on the sticks: every action is a shoulder, a stick click or the D-pad', () => {
    const prev = readPad(fakePad());
    const act = (held: number[]) => {
      const next = readPad(fakePad(held));
      return padToArena(next, edges(prev, next));
    };
    expect(act([6]).dodge).toBe(true); // LT
    expect(act([7]).cast).toBe(0); // RT press
    expect(act([7]).castHeld).toBe(0); // RT held keeps casting
    expect(act([4]).cast).toBe(1); // LB
    expect(act([11]).cast).toBe(2); // R3
    expect(act([5]).attackHeld).toBe(true); // RB
    expect(act([13]).potion).toBe(true); // D-pad down
    expect(act([9]).menu).toBe(true);
    for (const face of [0, 1, 2, 3]) {
      const a = act([face]);
      expect([a.cast, a.dodge, a.potion, a.attackHeld]).toEqual([null, false, false, false]);
    }
  });

  it('moves with the left stick and aims with the right, centred meaning auto-aim', () => {
    const next = readPad(fakePad([], [0, -1, 0, 0]));
    const a = padToArena(next, new Set());
    expect(a.move.y).toBeCloseTo(-1);
    expect(a.aimDir).toBeNull();
    const aimed = padToArena(readPad(fakePad([], [0, 0, 1, 0])), new Set());
    expect(aimed.aimDir!.x).toBeCloseTo(1);
    expect(aimed.aimTilt).toBeCloseTo(1);
  });
});

describe('pickNext (spatial focus)', () => {
  const r = (id: string, x: number, y: number): NavRect => ({ id, x, y, w: 40, h: 20 });
  const grid = [r('a', 0, 0), r('b', 100, 0), r('c', 0, 100), r('d', 100, 100), r('e', 300, 10)];

  it('moves to the nearest control in the pressed direction', () => {
    expect(pickNext(grid[0], grid, 'right')?.id).toBe('b');
    expect(pickNext(grid[0], grid, 'down')?.id).toBe('c');
    expect(pickNext(grid[3], grid, 'up')?.id).toBe('b');
    expect(pickNext(grid[1], grid, 'right')?.id).toBe('e');
  });

  it('stays put at the edge', () => {
    expect(pickNext(grid[0], grid, 'left')).toBeNull();
  });
});
