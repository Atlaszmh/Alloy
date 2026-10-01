import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  abilityReady,
  computeHeroStats,
  createSandboxWorld,
  defaultChains,
  inBeat,
  makeCtx,
  spawnDummies,
  stepWorld,
  type ArpgEvent,
  type ArpgWorld,
  type Chain,
  type Chains,
  type FormId,
  type MoveKind,
} from '@alloy/engine';
import { edges, radialDeadzone, readPad, type GamepadLike } from '../gamepad';
import {
  padCast,
  padFrameCast,
  padMemory,
  padToArena,
  stickAimPoint,
  type PadMemory,
} from '../arena-pad';
import { getDelveRegistry } from '@/features/delve/registry';
import { DEFAULT_CONTROLS, bindPad } from '@/features/controls/controls';
import { pickNext, type NavRect } from '../spatial-nav';
import { startGamepad } from '../gamepad-hub';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';

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
    expect(act([7]).cast).toEqual([0]); // RT press
    expect(act([7]).held).toEqual([0]); // held (a hold move charges)
    expect(act([7]).repeat).toEqual([0]); // with hold-to-repeat on
    expect(act([4]).held).toEqual([1]);
    expect(act([4]).repeat).toEqual([]);
    expect(act([]).held).toEqual([]);
    expect(act([4]).cast).toEqual([1]); // LB
    expect(act([11]).cast).toEqual([2]); // R3
    // Every button pressed and held, in slot order.
    expect(act([11, 4]).cast).toEqual([1, 2]);
    expect(act([11, 4, 7]).held).toEqual([0, 1, 2]);
    expect(act([5]).attackHeld).toBe(true); // RB
    expect(act([13]).potion).toBe(true); // D-pad down
    expect(act([9]).menu).toBe(true);
    for (const face of [0, 1, 2, 3]) {
      const a = act([face]);
      expect([a.cast, a.dodge, a.potion, a.attackHeld]).toEqual([[], false, false, false]);
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
  const pressOf = (slot: number) => ({ slot, repeat: false });
  const repeatOf = (slot: number) => ({ slot, repeat: true });

  it('a press casts a non-hold next move; repeat presses early, whenever none of its slot waits', () => {
    const w = world();
    expect(padCast(registry, w, { cast: 0, castHeld: 0 }, null)).toEqual(pressOf(0));
    expect(padCast(registry, w, { cast: null, castHeld: 0 }, null)).toEqual(repeatOf(0));
    expect(padCast(registry, w, none, 0)).toBeNull(); // its release does nothing
    // On cooldown, repeat still presses: the press waits in the buffer. One waiting, it stops.
    w.hero.cooldowns[0][0] = w.t + 1;
    expect(padCast(registry, w, { cast: null, castHeld: 0 }, null)).toEqual(repeatOf(0));
    stepWorld(registry, w, { move: { x: 0, y: 0 }, cast: { slot: 0, repeat: true } }, STEP);
    expect(w.queuedCasts).toHaveLength(1);
    expect(padCast(registry, w, { cast: null, castHeld: 0 }, null)).toBeNull();
    expect(padCast(registry, w, { cast: 0, castHeld: 0 }, null)).toEqual(pressOf(0)); // a press always tries
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
    expect(padCast(registry, w, none, 0)).toEqual(pressOf(0));
    expect(padCast(registry, w, none, 1)).toBeNull(); // the Ward isn't a hold
  });

  it('repeat stops at a hold that fired by itself, while its button stays held', () => {
    const w = world();
    spawnDummies(registry, w, { layout: 'single', element: null });
    w.hero.comboStep[0] = 0;
    w.hero.comboAt[0] = w.t;
    // Held past holdMax, the Lance fires by itself, lands and waits out its beat; the button
    // stays held.
    const { holdMax } = registry.getDelveBalance().chains;
    const events: ArpgEvent[] = [];
    for (let i = 0; i < Math.round((holdMax + 1.5) / STEP); i++)
      events.push(...stepWorld(registry, w, { move: { x: 0, y: 0 }, holding: 0 }, STEP));
    expect(events.filter((e) => e.kind === 'cast')).toHaveLength(1);
    expect(w.holdDropped).toBe(0);
    // The next move, the light Bolt, is ready, but the held button doesn't repeat into it.
    expect(abilityReady(makeCtx(registry, w, []), 0)).toBe(true);
    expect(padCast(registry, w, { cast: null, castHeld: 0 }, null)).toBeNull();
  });

  /**
   * One frame on the pad: `pressed` go down, `held` are down (`repeat` of them with hold-to-repeat
   * on); its cast (`padFrameCast`) into a step of `w`, with its `holding`.
   */
  const frame = (
    w: ArpgWorld,
    mem: PadMemory,
    pressed: number[],
    held: number[],
    repeat: number[] = [],
  ) => {
    const f = padFrameCast(registry, w, { cast: pressed, held, repeat }, mem);
    const step = {
      move: { x: 0, y: 0 },
      holding: f.holding,
      cast: f.cast && { slot: f.cast.slot, aim: null, repeat: f.cast.repeat },
    };
    const events = stepWorld(registry, w, step, STEP);
    const casts = events.flatMap((e) => (e.kind === 'cast' ? [e.slot] : []));
    return {
      slot: f.cast?.slot ?? null,
      repeat: !!f.cast?.repeat,
      holding: f.holding,
      events,
      casts,
    };
  };
  /** A sandbox (mana enough for anything) with these chains over Fire's defaults. */
  const arena = (over: Partial<Chains> = {}) => {
    const w = createSandboxWorld(registry, {
      depth: 5,
      stats: computeHeroStats({}, registry),
      chains: { ...defaultChains(registry, 'fire', null), ...over },
      toggles: { infiniteMana: true, noCooldowns: false, invulnerable: false },
    });
    spawnDummies(registry, w, { layout: 'single', element: null });
    w.hero.charge = [100, 100, 100];
    return w;
  };
  /** A one-move Fire chain. */
  const one = (kind: MoveKind, form: FormId): Chain => ({
    moves: [{ kind, form, elements: ['fire'] }],
    payment: 'mana',
  });
  const HOLD_NOVA = one('hold', 'nova');
  const HOLD_WARD = one('hold', 'ward');
  const NOVA = one('medium', 'nova');

  it('padFrameCast: a hold casts on the frame its button goes up', () => {
    const w = world();
    spawnDummies(registry, w, { layout: 'single', element: null });
    w.hero.comboStep[0] = 0;
    w.hero.comboAt[0] = w.t;
    const mem = padMemory();
    const frames = [[0], [0], [0], []].map((held, i) => frame(w, mem, i === 0 ? [0] : [], held));
    expect(frames.map((f) => f.slot)).toEqual([null, null, null, 0]);
  });

  it("padFrameCast: a second button releases a charging hold, whichever slots they are; the first doesn't come back", () => {
    // R3's Nova charging, then LB; and LB's Ward charging, then R3.
    for (const [first, second, over] of [
      [2, 1, { ultimate: HOLD_NOVA }],
      [1, 2, { defensive: HOLD_WARD, ultimate: NOVA }],
    ] as const) {
      const w = arena(over);
      const mem = padMemory();
      for (let i = 0; i < 15; i++) frame(w, mem, i === 0 ? [first] : [], [first]);
      expect(w.hero.hold?.slot).toBe(first);
      // The second goes down with the first still held: the first's hold releases this frame,
      // and the second's press casts the next.
      const both = [first, second].sort();
      const frames = Array.from({ length: 60 }, (_, i) =>
        frame(w, mem, i === 0 ? [second] : [], both),
      );
      expect(frames.slice(0, 3).map((f) => f.slot)).toEqual([first, second, null]);
      expect(frames.flatMap((f) => f.casts)).toEqual([first, second]);
      // The second lets go, the first still held: it doesn't count again until pressed again.
      const after = Array.from({ length: 60 }, () => frame(w, mem, [], [first]));
      expect(after.every((f) => f.holding === null && f.slot === null)).toBe(true);
      expect(w.hero.hold).toBeNull();
    }
  });

  it('padFrameCast: two presses in one frame go in slot order, the higher holding', () => {
    // LB and R3 at once: the Ward now, the Nova next frame.
    const plain = arena({ ultimate: NOVA });
    const mem = padMemory();
    const first = frame(plain, mem, [1, 2], [1, 2]);
    expect([first.slot, first.holding]).toEqual([1, 2]);
    const rest = Array.from({ length: 60 }, () => frame(plain, mem, [], [1, 2]));
    expect([...first.casts, ...rest.flatMap((f) => f.casts)]).toEqual([1, 2]);

    // With a hold Nova, the held R3 charges it instead of pressing.
    const held = arena({ ultimate: HOLD_NOVA });
    const hmem = padMemory();
    frame(held, hmem, [1, 2], [1, 2]);
    const charging = Array.from({ length: 30 }, () => frame(held, hmem, [], [1, 2]));
    expect(charging.flatMap((f) => f.casts)).toEqual([1]);
    expect(held.hero.hold?.slot).toBe(2);

    // The lower's hold move taps at stage 0, as a key tap does.
    const tap = arena({ defensive: HOLD_WARD, ultimate: NOVA });
    const tmem = padMemory();
    expect(frame(tap, tmem, [1, 2], [1, 2]).slot).toBe(1);
    expect(tap.hero.windup?.slot).toBe(1);
    expect(tap.hero.windup?.stage).toBe(0);
  });

  it('padFrameCast: three presses in one frame all cast, one a frame; so do a release and two presses', () => {
    const all = arena({ ultimate: NOVA });
    const mem = padMemory();
    const frames = Array.from({ length: 60 }, (_, i) =>
      frame(all, mem, i === 0 ? [0, 1, 2] : [], [0, 1, 2]),
    );
    expect(frames.slice(0, 3).map((f) => f.slot)).toEqual([0, 1, 2]);
    expect(frames.flatMap((f) => f.casts).sort()).toEqual([0, 1, 2]);

    // RT's Bolt charging, then LB and R3 at once: the release, then each press.
    const chord = arena({ primary: one('hold', 'bolt'), ultimate: NOVA });
    const cmem = padMemory();
    for (let i = 0; i < 15; i++) frame(chord, cmem, i === 0 ? [0] : [], [0]);
    expect(chord.hero.hold?.slot).toBe(0);
    const after = Array.from({ length: 60 }, (_, i) =>
      frame(chord, cmem, i === 0 ? [1, 2] : [], [0, 1, 2]),
    );
    expect(after.slice(0, 3).map((f) => f.slot)).toEqual([0, 1, 2]);
    expect(after.flatMap((f) => f.casts).sort()).toEqual([0, 1, 2]);
  });

  it('hold-to-repeat follows the latest held repeat button, falling back to an earlier one still held', () => {
    const w = arena();
    const mem = padMemory();
    // Each frame's cast without stepping, so nothing waits: RT streams, LB (repeat off) is
    // pressed once, and RT streams on while LB is held and after.
    const cast = (pressed: number[], held: number[], repeat: number[]) =>
      padFrameCast(registry, w, { cast: pressed, held, repeat }, mem).cast;
    expect(cast([0], [0], [0])).toEqual(pressOf(0));
    expect(cast([], [0], [0])).toEqual(repeatOf(0));
    expect(cast([1], [0, 1], [0])).toEqual(pressOf(1));
    expect(cast([], [0, 1], [0])).toEqual(repeatOf(0));
    // With LB's repeat on too, the latest streams; let go, RT again.
    expect(cast([], [0, 1], [0, 1])).toEqual(repeatOf(1));
    expect(cast([], [0], [0])).toEqual(repeatOf(0));
  });

  it('a repeat button already held when the pad first sees it (pressed in a menu) repeats, but holds nothing', () => {
    const w = arena();
    const mem = padMemory();
    const f = padFrameCast(registry, w, { cast: [], held: [0, 1], repeat: [0] }, mem);
    expect(f).toEqual({ cast: repeatOf(0), holding: null });
  });

  it("repeat presses early: during a wind-up, and the press waits out the landing's beat", () => {
    const w = arena();
    const mem = padMemory();
    const rt = () => frame(w, mem, [], [0], [0]);
    frame(w, mem, [0], [0], [0]);
    expect(w.hero.windup?.slot).toBe(0);
    // During the wind-up, a marked press goes out and waits.
    const during = rt();
    expect(during.repeat).toBe(true);
    expect(w.queuedCasts.map((q) => q.cast)).toEqual([{ slot: 0, aim: null, repeat: true }]);
    // It waits through the landing and the beat, and fires at the beat's end.
    let end = 0;
    for (let i = 0; i < 60 && !inBeat(w.hero, 0, w.t); i++) rt();
    end = w.hero.beatUntil[0];
    expect(w.queuedCasts).toHaveLength(1);
    for (let i = 0; i < 60 && !w.hero.windup; i++) rt();
    expect(w.t).toBeGreaterThanOrEqual(end - 1e-6);
    expect(w.t).toBeLessThan(end + 2 * STEP);
  });

  it('RT held through a light-then-hold chain charges the hold', () => {
    const w = world();
    spawnDummies(registry, w, { layout: 'single', element: null });
    const mem = padMemory();
    const frames = [frame(w, mem, [0], [0], [0])];
    for (let i = 0; i < 60 && !w.hero.hold; i++) frames.push(frame(w, mem, [], [0], [0]));
    expect(w.hero.hold?.slot).toBe(0);
    // Only the light cast: the hold charges, then fires when RT lets go.
    expect(frames.flatMap((f) => f.casts)).toEqual([0]);
    expect(frame(w, mem, [], []).slot).toBe(0);
  });

  it('repeat on an empty pool stays quiet: no noMana, though a fresh press says so', () => {
    const w = createSandboxWorld(registry, {
      depth: 5,
      stats: computeHeroStats({}, registry),
      chains: defaultChains(registry, 'fire', null),
      toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
    });
    spawnDummies(registry, w, { layout: 'single', element: null });
    w.hero.mana = 0;
    w.hero.manaRegen = 0;
    w.hero.nextAttackAt = 1e9;
    const mem = padMemory();
    const first = frame(w, mem, [0], [0], [0]);
    expect(first.events.filter((e) => e.kind === 'noMana')).toHaveLength(1);
    const held = Array.from({ length: 30 }, () => frame(w, mem, [], [0], [0]));
    expect(held.some((f) => f.repeat)).toBe(true);
    expect(held.flatMap((f) => f.events).some((e) => e.kind === 'noMana')).toBe(false);
  });

  it("a pad press during a light's wind-up, with a hold next, starts the hold's charge rather than tapping it", () => {
    const w = world();
    spawnDummies(registry, w, { layout: 'single', element: null });
    // The light winds up (a key's press); RT goes down meanwhile and stays held.
    stepWorld(registry, w, { move: { x: 0, y: 0 }, cast: { slot: 0, aim: null } }, STEP);
    expect(w.hero.windup?.step).toBe(0);
    const mem = padMemory();
    const pressed = frame(w, mem, [0], [0]);
    expect(pressed.slot).toBeNull();
    const frames = [pressed];
    for (let i = 0; i < 60 && !w.hero.hold; i++) frames.push(frame(w, mem, [], [0]));
    expect(w.hero.hold).toMatchObject({ slot: 0, step: 1 });
    expect(frames.flatMap((f) => f.casts)).toEqual([0]); // the light's, and no tap
  });

  it("an RT tap that cast its light doesn't cast again on its release, though a hold is next", () => {
    const tapped = (chord: boolean) => {
      const w = world();
      spawnDummies(registry, w, { layout: 'single', element: null });
      w.hero.nextAttackAt = 1e9;
      const mem = padMemory();
      const frames = [frame(w, mem, [0], [0])];
      expect(w.hero.windup?.step).toBe(0);
      // Let go in the light's wind-up; or, a chord, LB goes down with RT still held.
      frames.push(chord ? frame(w, mem, [1], [0, 1]) : frame(w, mem, [], []));
      for (let i = 0; i < 90; i++) frames.push(frame(w, mem, [], chord ? [0, 1] : []));
      return frames.flatMap((f) => f.casts);
    };
    expect(tapped(false)).toEqual([0]);
    expect(tapped(true)).toEqual([0, 1]);

    // A press held back in the wind-up (the hold next) still taps the hold on a quick release.
    const w = world();
    spawnDummies(registry, w, { layout: 'single', element: null });
    w.hero.nextAttackAt = 1e9;
    stepWorld(registry, w, { move: { x: 0, y: 0 }, cast: { slot: 0, aim: null } }, STEP);
    const mem = padMemory();
    expect(frame(w, mem, [0], [0]).slot).toBeNull();
    expect(frame(w, mem, [], []).slot).toBe(0);
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
    expect(act([0]).cast).toEqual([0]); // A is now the Primary
    expect(act([0]).repeat).toEqual([]); // with repeat off
    expect(act([7]).cast).toEqual([]); // RT is unbound now
    expect(act([4]).repeat).toEqual([1]); // LB Defensive repeats
    expect(act([0]).held).toEqual([0]); // held, repeat or not
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

describe('the hub claims the input lock for the pad on a change, not a steady state', () => {
  let frames: FrameRequestCallback[] = [];
  let pad: GamepadLike | null = null;
  let stop = () => {};
  /** Run one animation frame: the hub reads the pad once. */
  const tick = () => {
    const run = frames;
    frames = [];
    for (const cb of run) cb(0);
  };
  const device = () => useInputDeviceStore.getState().device;
  const mouse = () => useInputDeviceStore.getState().setDevice('keyboard');
  /** RT resting half down (past its threshold), the left stick at `axes`. */
  const resting = (held: number[] = [], axes = [0, 0, 0, 0]): GamepadLike => ({
    ...fakePad(held, axes),
    buttons: fakePad(held).buttons.map((b, i) => (i === 7 ? { pressed: false, value: 0.6 } : b)),
  });

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => (pad ? [pad] : []),
    });
    pad = null;
    stop = startGamepad(() => {});
    tick(); // no pad: the hub forgets the last one
  });
  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
    mouse();
  });

  it('a button press claims it; a trigger or a stick held still does not', () => {
    pad = resting([], [0.7, 0, 0, 0]);
    tick(); // first seen: the pad is in use
    expect(device()).toBe('gamepad');
    mouse();
    tick();
    tick();
    expect(device()).toBe('keyboard');
    pad = resting([0], [0.7, 0, 0, 0]); // A pressed
    tick();
    expect(device()).toBe('gamepad');
    mouse();
    pad = resting([], [0.7, 0, 0, 0]); // A let go: no claim
    tick();
    expect(device()).toBe('keyboard');
  });

  it('a stick claims it moving out of its deadzone or well away from where it lay, not drifting a little', () => {
    pad = fakePad([], [0.7, 0, 0, 0]);
    tick();
    mouse();
    pad = fakePad([], [0.72, 0.05, 0, 0]); // a nudge
    tick();
    expect(device()).toBe('keyboard');
    pad = fakePad([], [0, 0.7, 0, 0]); // swung round
    tick();
    expect(device()).toBe('gamepad');
    mouse();
    pad = fakePad(); // let go to the centre: no claim
    tick();
    expect(device()).toBe('keyboard');
    pad = fakePad([], [0, 0, 0.4, 0]); // the right stick, just out of its deadzone
    tick();
    expect(device()).toBe('gamepad');
  });
});
