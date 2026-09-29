import { describe, it, expect } from 'vitest';
import { computeHeroStats, createSandboxWorld, defaultChains, stepWorld } from '@alloy/engine';
import { edges, radialDeadzone, readPad, type GamepadLike } from '../gamepad';
import { padCast, padToArena, releaseEdge, stickAimPoint } from '../arena-pad';
import { getDelveRegistry } from '@/features/delve/registry';
import { DEFAULT_CONTROLS, bindPad } from '@/features/controls/controls';
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
    expect(act([7]).holding).toBe(0); // and charges a hold move
    expect(act([4]).holding).toBe(1);
    expect(act([]).holding).toBeNull();
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

  it('reports a tap of the attack button on its press edge only', () => {
    const prev = readPad(fakePad());
    const next = readPad(fakePad([5]));
    expect(padToArena(next, edges(prev, next)).attackTap).toBe(true);
    expect(padToArena(next, edges(next, next)).attackTap).toBe(false);
  });
});

describe('releaseEdge', () => {
  it('reports the slot held the frame before and not now', () => {
    const release = releaseEdge();
    const frames: (number | null)[] = [0, 0, null, 1, 2, null];
    expect(frames.map((held) => release(held))).toEqual([null, null, 0, null, 1, 2]);
  });
});

describe('padCast (a hold casts on its release, read from the world)', () => {
  const registry = getDelveRegistry();
  const STEP = registry.getDelveBalance().arena.step;
  /** A light Bolt then a held Lance on the Primary, the Defensive a single Ward. */
  const world = () =>
    createSandboxWorld(registry, {
      depth: 5,
      stats: computeHeroStats({}, registry),
      chains: {
        ...defaultChains(registry, 'fire', null),
        primary: {
          moves: [
            { kind: 'light', form: 'bolt', elements: ['fire'] },
            { kind: 'hold', form: 'lance', elements: ['fire'] },
          ],
          payment: 'mana',
        },
      },
      toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
    });
  const none = { cast: null, castHeld: null };

  it('a press casts a non-hold next move, and repeat casts it again once ready', () => {
    const w = world();
    expect(padCast(registry, w, { cast: 0, castHeld: 0 }, null)).toBe(0);
    expect(padCast(registry, w, { cast: null, castHeld: 0 }, null)).toBe(0);
    expect(padCast(registry, w, none, 0)).toBeNull(); // its release does nothing
    w.hero.cooldowns[0][0] = w.t + 1;
    expect(padCast(registry, w, { cast: null, castHeld: 0 }, null)).toBeNull();
    expect(padCast(registry, w, { cast: 0, castHeld: 0 }, null)).toBe(0); // a press always tries
  });

  it("a hold next move ignores the press and repeat, and casts on the button's release", () => {
    const w = world();
    // The light Bolt landed: the next move is the held Lance.
    w.hero.comboStep[0] = 0;
    w.hero.comboAt[0] = w.t;
    expect(padCast(registry, w, { cast: 0, castHeld: 0 }, null)).toBeNull();
    expect(padCast(registry, w, { cast: null, castHeld: 0 }, null)).toBeNull();
    stepWorld(registry, w, { move: { x: 0, y: 0 }, holding: 0 }, STEP);
    expect(w.hero.hold?.slot).toBe(0);
    expect(padCast(registry, w, none, 0)).toBe(0);
    expect(padCast(registry, w, none, 1)).toBeNull(); // the Ward isn't a hold
  });
});

describe('custom controls', () => {
  it('follows the bindings and per-ability repeat', () => {
    let cfg = bindPad(DEFAULT_CONTROLS, 'primary', 'a');
    cfg = { ...cfg, repeat: { primary: false, defensive: true, ultimate: false } };
    const prev = readPad(fakePad());
    const act = (held: number[]) => {
      const next = readPad(fakePad(held));
      return padToArena(next, edges(prev, next), cfg);
    };
    expect(act([0]).cast).toBe(0); // A is now the Primary
    expect(act([0]).castHeld).toBeNull(); // with repeat off
    expect(act([7]).cast).toBeNull(); // RT is unbound now
    expect(act([4]).castHeld).toBe(1); // LB Defensive repeats
    expect(act([0]).holding).toBe(0); // held, repeat or not
  });

  it('reads the sticks with the configured deadzones', () => {
    const pad = fakePad([], [0.3, 0, 0, 0]);
    expect(readPad(pad).left.x).toBeGreaterThan(0);
    expect(readPad(pad, { left: 0.4, right: 0.35 }).left.x).toBe(0);
  });

  it('aim reach scales how far placed abilities land at full tilt', () => {
    const hero = { x: 0, y: 0 };
    expect(stickAimPoint(hero, { x: 1, y: 0 }, 1, 8, true).x).toBeCloseTo(8);
    expect(stickAimPoint(hero, { x: 1, y: 0 }, 1, 8, true, 0.5).x).toBeCloseTo(4);
    expect(stickAimPoint(hero, { x: 1, y: 0 }, 0.1, 8, true, 0.5).x).toBeCloseTo(2.4);
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
