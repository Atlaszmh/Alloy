import { describe, it, expect, afterEach } from 'vitest';
import {
  chainMove,
  computeHeroStats,
  createSandboxWorld,
  defaultChains,
  stepWorld,
  type Chain,
  type Vec,
} from '@alloy/engine';
import { attachKeyboard, createArenaInput, frameInput, holdingSlot } from '../arena/input';
import { TAP_MS } from '../arena/aim-gestures';
import { aimView } from '../arena/useArenaCore';
import { getDelveRegistry } from '../registry';
import { padMemory, type ArenaPadActions } from '@/features/gamepad/arena-pad';
import { useControlsStore } from '@/stores/controlsStore';

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

  it('an ability key held down is holding its slot (a hold move charges); its release casts', () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    key('keydown', 'KeyE');
    expect(holdingSlot(input)).toBe(1);
    expect(input.cast).toBeNull();
    key('keyup', 'KeyE');
    expect(holdingSlot(input)).toBeNull();
    expect(input.cast?.slot).toBe(1);
  });

  it("ignores a held key's repeats: its press keeps its start, and nothing casts", () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    key('keydown', 'KeyQ');
    const since = input.aiming!.since;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', repeat: true }));
    expect(input.aiming!.since).toBe(since);
    expect(input.cast).toBeNull();
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

  it('Space dodges and F drinks a potion', () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    key('keydown', 'Space');
    expect(input.dodge).toBe(true);
    expect(input.potion).toBe(false);
    key('keydown', 'KeyF');
    expect(input.potion).toBe(true);
  });

  it('follows the player key bindings, and the arrows always move', () => {
    useControlsStore.getState().setKey('primary', 'KeyJ');
    useControlsStore.getState().setKey('dodge', 'KeyK');
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    key('keydown', 'KeyJ');
    key('keyup', 'KeyJ');
    expect(input.cast).toEqual({ slot: 0, aim: null });
    key('keydown', 'KeyK');
    expect(input.dodge).toBe(true);
    key('keydown', 'ArrowLeft');
    expect(input.keys).toEqual({ x: -1, y: 0 });
    useControlsStore.getState().reset();
  });
});

describe('panel controls keep their keys', () => {
  let detach = () => {};
  afterEach(() => {
    detach();
    document.body.replaceChildren();
  });

  it('a slider or a list never moves, casts or dodges, but the menu key still works from them', () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    const slider = document.body.appendChild(document.createElement('input'));
    slider.type = 'range';
    const list = document.body.appendChild(document.createElement('select'));
    const menu = document.body.appendChild(document.createElement('button'));
    menu.setAttribute('data-pad-menu', '');
    let opened = 0;
    menu.addEventListener('click', () => opened++);
    // A key reaches the focused control.
    const press = (el: HTMLElement, code: string) => {
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    };

    press(slider, 'ArrowLeft');
    press(list, 'KeyW');
    press(list, 'KeyQ');
    press(slider, 'Space');
    expect(input.keys).toEqual({ x: 0, y: 0 });
    expect(input.aiming).toBeNull();
    expect(input.dodge).toBe(false);

    press(slider, 'Escape');
    press(list, 'Escape');
    expect(opened).toBe(2);

    // Buttons are not ignored: the dive's keyboard play is unchanged.
    press(menu, 'KeyW');
    expect(input.keys).toEqual({ x: 0, y: -1 });
  });

  it('a text field keeps every key, the menu key included', () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    const text = document.body.appendChild(document.createElement('input'));
    const menu = document.body.appendChild(document.createElement('button'));
    menu.setAttribute('data-pad-menu', '');
    let opened = 0;
    menu.addEventListener('click', () => opened++);
    text.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    text.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    expect(opened).toBe(0);
    expect(input.keys).toEqual({ x: 0, y: 0 });
  });
});

const registry = getDelveRegistry();
/** A sandbox hero on Fire's default chains, the Primary `primary` if given. */
const world = (primary?: Chain) =>
  createSandboxWorld(registry, {
    depth: 5,
    stats: computeHeroStats({}, registry),
    chains: { ...defaultChains(registry, 'fire', null), ...(primary ? { primary } : {}) },
    toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
  });

describe('the aim marker of a key or button held to aim', () => {
  const point = { x: 20, y: 10 };
  const aiming = { slot: 0, since: 0, at: { x: 1, y: 1 } };

  it("none before a tap's time, nor while a HUD press is still on its button; then at the pointer", () => {
    const w = world();
    expect(aimView(w, aiming, point, TAP_MS - 1)).toBeNull();
    expect(aimView(w, { ...aiming, onButton: true }, point, 1000)).toBeNull();
    expect(aimView(w, aiming, point, 1000)).toMatchObject({ marker: 'line', point });
  });

  it("a charging hold's circle has its stage's radius", () => {
    const w = world({
      moves: [{ kind: 'hold', form: 'burst', elements: ['fire'] }],
      payment: 'mana',
    });
    const STEP = registry.getDelveBalance().arena.step;
    for (let i = 0; i < Math.round(0.8 / STEP); i++)
      stepWorld(registry, w, { move: { x: 0, y: 0 }, holding: 0 }, STEP);
    expect(w.hero.hold?.slot).toBe(0);
    const view = aimView(w, aiming, point, 1000)!;
    expect(view.marker).toBe('circle');
    expect(view.radius).toBeCloseTo(chainMove(w.hero.chains[0], 0, 2).radius);
    expect(view.radius).toBeGreaterThan(w.hero.chains[0].moves[0].radius);
  });
});

describe("frameInput: each step's input from the keys, the HUD and the pad", () => {
  /** The pad this frame: nothing held, pressed or tilted but what's given. */
  const pad = (over: Partial<ArenaPadActions> = {}): ArenaPadActions => ({
    move: { x: 0, y: 0 },
    aimDir: null,
    aimTilt: 0,
    cast: null,
    castHeld: null,
    holding: null,
    dodge: false,
    potion: false,
    attackHeld: false,
    attackTap: false,
    menu: false,
    ...over,
  });
  /** Screen px to world units: a tenth. */
  const toWorld = (p: Vec) => ({ x: p.x / 10, y: p.y / 10 });
  const opts = { manual: true, aimReach: 1, toWorld };

  it('a key or HUD button held wins `holding` over the pad', () => {
    const w = world();
    const input = createArenaInput();
    const mem = padMemory();
    input.aiming = { slot: 1, since: 0, at: null };
    expect(frameInput(registry, w, input, pad({ holding: 0 }), mem, opts).holding).toBe(1);
    input.aiming = null;
    expect(frameInput(registry, w, input, pad({ holding: 0 }), mem, opts).holding).toBe(0);
    expect(frameInput(registry, w, input, null, mem, opts).holding).toBeNull();
  });

  it('sends each press once: cancelHold, a cast, a dodge, a potion and an attack tap', () => {
    const w = world();
    const input = createArenaInput();
    const mem = padMemory();
    Object.assign(input, {
      cancelHold: true,
      cast: { slot: 2, aim: { x: 30, y: 40 } },
      dodge: true,
      potion: true,
      attackTap: true,
    });
    const first = frameInput(registry, w, input, null, mem, opts);
    expect(first).toMatchObject({
      cancelHold: true,
      cast: { slot: 2, aim: { x: 3, y: 4 } },
      dodge: true,
      potion: true,
      attackTap: true,
    });
    const next = frameInput(registry, w, input, null, mem, opts);
    expect(next).toMatchObject({
      cancelHold: false,
      cast: null,
      dodge: false,
      potion: false,
      attackTap: false,
    });
  });

  it("the pad's release reaches padCast: a hold casts on the frame its button goes up", () => {
    const w = world({
      moves: [{ kind: 'hold', form: 'bolt', elements: ['fire'] }],
      payment: 'mana',
    });
    const input = createArenaInput();
    const mem = padMemory();
    expect(frameInput(registry, w, input, pad({ cast: 0, holding: 0 }), mem, opts).cast).toBeNull();
    expect(frameInput(registry, w, input, pad({ holding: 0 }), mem, opts).cast).toBeNull();
    expect(frameInput(registry, w, input, pad(), mem, opts).cast).toEqual({ slot: 0, aim: null });
  });

  it('the right stick aims the attack only while the pad drives it: RB held, or let go this frame', () => {
    const w = world();
    const h = w.hero;
    const input = createArenaInput();
    const mem = padMemory();
    input.attackHeld = true;
    input.attackAim = { x: 50, y: 60 };
    const stick = { aimDir: { x: 1, y: 0 }, aimTilt: 1 };
    const aim = (rb: boolean) =>
      frameInput(registry, w, input, pad({ ...stick, attackHeld: rb }), mem, opts).attackAim;
    // The mouse attacks, the stick tilted by the way: the mouse aims.
    expect(aim(false)).toEqual({ x: 5, y: 6 });
    // RB attacks: the stick aims, and on the frame RB lets go too.
    const along = { x: h.x + h.stats.weapon.range, y: h.y };
    expect(aim(true)).toEqual(along);
    expect(aim(false)).toEqual(along);
    expect(aim(false)).toEqual({ x: 5, y: 6 });
  });
});
