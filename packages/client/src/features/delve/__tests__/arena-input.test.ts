import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createElement } from 'react';
import { act, render, screen } from '@testing-library/react';
import {
  abilityReady,
  beginFloor,
  chainMove,
  computeHeroStats,
  createDelveProfile,
  createSandboxWorld,
  defaultChains,
  makeCtx,
  moveNumbers,
  spawnDummies,
  startDive,
  stepWorld,
  type Chain,
  type Move,
  type Vec,
} from '@alloy/engine';
import {
  attachKeyboard,
  createArenaInput,
  frameInput,
  holdingSlot,
  labelsHeld,
  pressJournal,
  pressPeek,
  pressMenu,
} from '../arena/input';
import { TAP_MS } from '../arena/aim';
import { aimView } from '../arena/useArenaCore';
import { getDelveRegistry } from '../registry';
import { armed } from './armed';
import { padMemory, padToArena, REPEAT_DELAY, type ArenaPadActions } from '@/features/gamepad/arena-pad';
import { PAD_BUTTONS, type PadButton } from '@/features/gamepad/gamepad';
import { useControlsStore } from '@/stores/controlsStore';
import { setArenaLive } from '@/features/gamepad/gamepad-hub';
import { ArenaControls } from '../arena/ArenaControls';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';

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
  // The menu key is the arena's only while the fight is live.
  beforeEach(() => setArenaLive(true));
  afterEach(() => {
    detach();
    setArenaLive(false);
    document.body.replaceChildren();
  });
  /** Give `el` a box, so the scoped lookup sees it. */
  const shown = <T extends HTMLElement>(el: T): T => {
    el.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 });
    return el;
  };

  it('a slider or a list never moves, casts or dodges, but the menu key still works from them', () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    const slider = document.body.appendChild(document.createElement('input'));
    slider.type = 'range';
    const list = document.body.appendChild(document.createElement('select'));
    const menu = document.body.appendChild(shown(document.createElement('button')));
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

  it("the menu key acts only while the fight is live, on the topmost scope's menu, and never on a handled key", () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    const opened: string[] = [];
    const menu = (name: string, parent: HTMLElement = document.body) => {
      const b = parent.appendChild(shown(document.createElement('button')));
      b.setAttribute('data-pad-menu', '');
      b.addEventListener('click', () => opened.push(name));
    };
    const esc = () => {
      const e = new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true });
      window.dispatchEvent(e);
      return e;
    };
    menu('purse');
    const dock = document.body.appendChild(shown(document.createElement('div')));
    dock.setAttribute('data-pad-scope', '');
    menu('dock', dock);
    expect(esc().defaultPrevented).toBe(true);
    expect(opened).toEqual(['dock']);
    // Paused, the prompt runtime owns the key: the arena leaves it alone.
    setArenaLive(false);
    expect(esc().defaultPrevented).toBe(false);
    setArenaLive(true);
    const handled = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', handled, true);
    esc();
    window.removeEventListener('keydown', handled, true);
    expect(opened).toEqual(['dock']);
    // The pad's Menu while live (useArenaCore's padFrame) presses the same one.
    pressMenu();
    expect(opened).toEqual(['dock', 'dock']);
  });
});

describe('loot labels and the journal', () => {
  let detach = () => {};
  afterEach(() => {
    detach();
    document.body.replaceChildren();
  });

  it('Alt held shows every loot label, its default prevented; its keyup or a blur lets go', () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    const alt = new KeyboardEvent('keydown', { code: 'AltLeft', cancelable: true });
    window.dispatchEvent(alt);
    expect(alt.defaultPrevented).toBe(true);
    expect(input.labels).toBe(true);
    key('keyup', 'AltLeft');
    expect(input.labels).toBe(false);
    // Alt+Tab: the window loses focus and the keyup never comes.
    key('keydown', 'AltLeft');
    window.dispatchEvent(new Event('blur'));
    expect(input.labels).toBe(false);
  });

  it('a game key pressed with Alt held has its default prevented (no browser menu)', () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    const send = (code: string, repeat = false) => {
      const e = new KeyboardEvent('keydown', { code, altKey: true, repeat, cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(send('AltLeft')).toBe(true);
    expect(send('KeyE')).toBe(true);
    expect(send('KeyE', true)).toBe(true);
    expect(send('KeyZ')).toBe(false); // unbound
  });

  it("J and the pad's View press the topmost scope's Journal", () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    const journal = document.body.appendChild(document.createElement('button'));
    journal.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 });
    journal.setAttribute('data-pad-journal', '');
    let opened = 0;
    journal.addEventListener('click', () => opened++);
    key('keydown', 'KeyJ');
    expect(opened).toBe(1);
    pressJournal(); // useArenaCore's padFrame, on the pad's View
    expect(opened).toBe(2);
  });

  it("M and the pad's D-pad up press the topmost scope's Map (the peek), only while the fight is live", () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    const map = document.body.appendChild(document.createElement('button'));
    map.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 });
    map.setAttribute('data-pad-peek', '');
    let peeks = 0;
    map.addEventListener('click', () => peeks++);
    key('keydown', 'KeyM');
    expect(peeks).toBe(1);
    pressPeek(); // useArenaCore's padFrame, on the pad's D-pad up
    expect(peeks).toBe(2);
    detach();
    detach = attachKeyboard(createArenaInput(), () => false); // paused
    key('keydown', 'KeyM');
    expect(peeks).toBe(2);
  });

  it("the labels follow the input lock: the keys' Alt under the keys, the pad's L3 under the pad", () => {
    const input = createArenaInput();
    const l3 = { labels: true } as ArenaPadActions;
    expect(labelsHeld('keyboard', input, l3)).toBe(false);
    input.labels = true;
    expect(labelsHeld('keyboard', input, null)).toBe(true);
    expect(labelsHeld('gamepad', input, null)).toBe(false);
    expect(labelsHeld('gamepad', input, l3)).toBe(true);
  });

  it('the pad reports L3 held as labels, a View press as the journal and D-pad up as the peek', () => {
    const state = (...held: PadButton[]) => ({
      left: { x: 0, y: 0 },
      right: { x: 0, y: 0 },
      buttons: Object.fromEntries(PAD_BUTTONS.map((b) => [b, held.includes(b)])) as Record<
        PadButton,
        boolean
      >,
    });
    expect(padToArena(state('ls'), new Set())).toMatchObject({ labels: true, journal: false });
    expect(padToArena(state('view'), new Set(['view']))).toMatchObject({
      labels: false,
      journal: true,
    });
    expect(padToArena(state('up'), new Set(['up']))).toMatchObject({ peek: true, potion: false });
    expect(padToArena(state('down'), new Set(['down']))).toMatchObject({ peek: false, potion: true });
  });
});

describe('the move hint', () => {
  afterEach(() => useInputDeviceStore.getState().setDevice('keyboard'));

  it("names the device's way to move until the hero first moves; no joystick", () => {
    const input = createArenaInput();
    const controls = () =>
      createElement(ArenaControls, { input, heroScreen: () => null, pixelsPerUnit: () => 40 });
    const { rerender } = render(controls());
    expect(screen.getByTestId('move-hint')).toHaveTextContent('WASD or hold click to move');
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    expect(screen.getByTestId('move-hint')).toHaveTextContent('Left stick to move');
    input.moved = true; // any device moved the hero (frameInput)
    rerender(controls());
    expect(screen.queryByTestId('move-hint')).toBeNull();
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

  it("none for a skill the weapon doesn't carry", () => {
    // An uncommon sword: no Defensive.
    const hero = armed(createDelveProfile(registry, 99));
    const w = beginFloor(registry, startDive(registry, hero, 1));
    expect(aimView(w, { ...aiming, slot: 1 }, point, 1000)).toBeNull();
    expect(aimView(w, aiming, point, 1000)).toMatchObject({ marker: 'line' });
  });

  it("none before a tap's time; then at the pointer", () => {
    const w = world();
    expect(aimView(w, aiming, point, TAP_MS - 1)).toBeNull();
    expect(aimView(w, aiming, point, 1000)).toMatchObject({ marker: 'line', point });
  });

  it("a charging hold's circle has its stage's radius", () => {
    const w = world({
      moves: [{ kind: 'hold', form: 'burst', elements: ['fire'] }],
      payment: 'mana',
    });
    const STEP = registry.getDelveBalance().arena.step;
    // Charged fully: stage 2.
    for (let i = 0; i < Math.round(1.1 / STEP); i++)
      stepWorld(registry, w, { move: { x: 0, y: 0 }, holding: 0 }, STEP);
    expect(w.hero.hold?.slot).toBe(0);
    const view = aimView(w, aiming, point, 1000)!;
    expect(view.marker).toBe('circle');
    expect(view.radius).toBeCloseTo(chainMove(w.hero.chains[0]!, 0, 2).radius);
    expect(view.radius).toBeGreaterThan(w.hero.chains[0]!.moves[0].radius);
  });

  it("a later move's circle has its step's size: a Burst as move 4", () => {
    const burst: Move = { kind: 'medium', form: 'burst', elements: ['fire'] };
    const w = world({ moves: [burst, burst, burst, burst], payment: 'mana' });
    // Pressed to its third move: the next press is its fourth.
    w.hero.comboStep[0] = 2;
    w.hero.comboAt[0] = w.t;
    const fourth = w.hero.chains[0]!.moves[3];
    const view = aimView(w, aiming, point, 1000)!;
    expect(view.marker).toBe('circle');
    expect(view.radius).toBeCloseTo(
      moveNumbers(w.hero.stats, registry.getDelveBalance(), fourth).radius,
    );
    expect(view.radius).toBeGreaterThan(fourth.radius);
  });

  it("during the slot's own wind-up, the move a press then casts: the one after the winding one", () => {
    const w = world({
      moves: [
        { kind: 'medium', form: 'bolt', elements: ['fire'] },
        { kind: 'medium', form: 'burst', elements: ['fire'] },
      ],
      payment: 'mana',
    });
    spawnDummies(registry, w, { layout: 'single', element: null });
    const STEP = registry.getDelveBalance().arena.step;
    stepWorld(registry, w, { move: { x: 0, y: 0 }, cast: { slot: 0, aim: null } }, STEP);
    expect(w.hero.windup?.step).toBe(0);
    expect(aimView(w, aiming, point, 1000)?.marker).toBe('circle');
  });
});

describe("frameInput: each step's input from the keys, the HUD and the pad", () => {
  /** The pad this frame: nothing held, pressed or tilted but what's given. */
  const pad = (over: Partial<ArenaPadActions> = {}): ArenaPadActions => ({
    move: { x: 0, y: 0 },
    aimDir: null,
    aimTilt: 0,
    cast: [],
    held: [],
    repeat: [],
    dodge: false,
    potion: false,
    interact: false,
    attackHeld: false,
    attackTap: false,
    menu: false,
    labels: false,
    journal: false,
    peek: false,
    ...over,
  });
  /** Screen px to world units: a tenth. */
  const toWorld = (p: Vec) => ({ x: p.x / 10, y: p.y / 10 });
  /** The pad has the input lock (most of these drive it); `keys` has the keyboard. */
  const opts = { manual: true, aimReach: 1, toWorld, device: 'gamepad' as const };
  const keys = { ...opts, device: 'keyboard' as const };

  it('respects only the device with the input lock: the pad, or the keys, mouse and HUD', () => {
    const w = world();
    const input = createArenaInput();
    const mem = padMemory();
    input.keys = { x: 1, y: 0 };
    input.aiming = { slot: 1, since: 0, at: null };
    input.attackHeld = true;
    input.attackAim = { x: 50, y: 60 };
    const acts = pad({ move: { x: 0, y: -1 }, cast: [0], held: [0], attackHeld: true });
    // The keyboard's: the pad's stick and buttons count for nothing.
    expect(frameInput(registry, w, input, acts, mem, keys)).toMatchObject({
      move: { x: 1, y: 0 },
      cast: null,
      holding: 1,
      attackAim: { x: 5, y: 6 },
    });
    // The pad's: the keys' movement and aiming count for nothing, and are let go.
    const out = frameInput(registry, w, input, acts, mem, opts);
    expect(out).toMatchObject({ move: { x: 0, y: -1 }, cast: { slot: 0, aim: null }, holding: 0 });
    expect(out.attackAim).toBeNull();
    expect(input).toMatchObject({ keys: { x: 0, y: 0 }, aiming: null, attackHeld: false });
    // A key's press meanwhile goes nowhere (a real one takes the lock first).
    input.cast = { slot: 2, aim: null };
    input.dodge = true;
    const next = frameInput(registry, w, input, pad({ held: [0] }), mem, opts);
    expect(next).toMatchObject({ cast: null, dodge: false });
    expect(input.cast).toBeNull();
  });

  it('a switch drops a charging hold unpaid and lets go of what the other side held: no surprise cast', () => {
    const w = world({
      moves: [{ kind: 'hold', form: 'bolt', elements: ['fire'] }],
      payment: 'mana',
    });
    const STEP = registry.getDelveBalance().arena.step;
    const input = createArenaInput();
    const mem = padMemory();
    /** One frame with the lock on `o.device`, stepped: its input, and the casts it made. */
    const frame = (acts: Partial<ArenaPadActions>, o: typeof opts | typeof keys) => {
      const out = frameInput(registry, w, input, pad(acts), mem, o);
      const casts = stepWorld(registry, w, out, STEP).filter((e) => e.kind === 'cast');
      return { out, casts };
    };
    // Q held on the keyboard charges the Primary's hold...
    input.aiming = { slot: 0, since: 0, at: null };
    for (let i = 0; i < 5; i++) frame({}, keys);
    expect(w.hero.hold?.slot).toBe(0);
    // ...the pad takes the lock: the hold drops unpaid, nothing casts, and Q's release later is quiet.
    const switched = frame({ move: { x: 1, y: 0 } }, opts);
    expect(switched.out).toMatchObject({ cast: null, holding: null });
    expect(switched.casts).toEqual([]);
    expect(w.hero.hold).toBeNull();
    expect(input.aiming).toBeNull();
    // RT charges it on the pad...
    frame({ cast: [0], held: [0] }, opts);
    for (let i = 0; i < 5; i++) frame({ held: [0] }, opts);
    expect(w.hero.hold?.slot).toBe(0);
    // ...the mouse takes the lock with RT still down: dropped, nothing casts.
    const back = frame({ held: [0] }, keys);
    expect(back.out).toMatchObject({ cast: null, holding: null });
    expect(back.casts).toEqual([]);
    expect(w.hero.hold).toBeNull();
    // The pad takes it back with RT still down (a stick moved): RT counts as already seen,
    // so it holds nothing, and its release casts nothing.
    expect(frame({ held: [0], move: { x: 1, y: 0 } }, opts).out.holding).toBeNull();
    expect(frame({}, opts).casts).toEqual([]);
  });

  it("a switch's dropped hold never swallows the new device's own hold of that slot", () => {
    const w = world({
      moves: [{ kind: 'hold', form: 'bolt', elements: ['fire'] }],
      payment: 'mana',
    });
    const STEP = registry.getDelveBalance().arena.step;
    const input = createArenaInput();
    const mem = padMemory();
    const frame = (acts: Partial<ArenaPadActions>, o: typeof opts | typeof keys) =>
      stepWorld(registry, w, frameInput(registry, w, input, pad(acts), mem, o), STEP);
    // Q charges the Primary's hold; RT pressed takes the lock and charges a fresh one.
    input.aiming = { slot: 0, since: 0, at: null };
    for (let i = 0; i < 5; i++) frame({}, keys);
    const first = w.hero.hold?.start;
    frame({ cast: [0], held: [0] }, opts);
    for (let i = 0; i < 3; i++) frame({ held: [0] }, opts);
    expect(w.hero.hold?.slot).toBe(0);
    expect(w.hero.hold?.start).toBeGreaterThan(first!);
    // ...and back: Q pressed with RT still down charges a fresh one too.
    const second = w.hero.hold!.start;
    input.aiming = { slot: 0, since: 0, at: null };
    for (let i = 0; i < 3; i++) frame({ held: [0] }, keys);
    expect(w.hero.hold?.slot).toBe(0);
    expect(w.hero.hold?.start).toBeGreaterThan(second);
  });

  it('sends each press once: a cast, a dodge, a potion and an attack tap', () => {
    const w = world();
    const input = createArenaInput();
    const mem = padMemory();
    Object.assign(input, {
      cast: { slot: 2, aim: { x: 30, y: 40 } },
      dodge: true,
      potion: true,
      attackTap: true,
    });
    const first = frameInput(registry, w, input, null, mem, keys);
    expect(first).toMatchObject({
      cast: { slot: 2, aim: { x: 3, y: 4 } },
      dodge: true,
      potion: true,
      attackTap: true,
    });
    const next = frameInput(registry, w, input, null, mem, keys);
    expect(next).toMatchObject({
      cast: null,
      dodge: false,
      potion: false,
      attackTap: false,
    });
  });

  it('marks the first move by any device, for the move hint', () => {
    const w = world();
    const input = createArenaInput();
    const mem = padMemory();
    frameInput(registry, w, input, pad(), mem, opts);
    expect(input.moved).toBe(false);
    frameInput(registry, w, input, pad({ move: { x: 0, y: 1 } }), mem, opts);
    expect(input.moved).toBe(true);
  });

  it("the pad's button of a skill the weapon doesn't carry casts nothing", () => {
    // An uncommon sword: no Defensive.
    const hero = armed(createDelveProfile(registry, 99));
    const w = beginFloor(registry, startDive(registry, hero, 1));
    const input = createArenaInput();
    expect(frameInput(registry, w, input, pad({ cast: [1] }), padMemory(), opts).cast).toBeNull();
    expect(frameInput(registry, w, input, pad({ cast: [0] }), padMemory(), opts).cast).toEqual({
      slot: 0,
      aim: null,
    });
  });

  it("the pad's release reaches padCast: a hold casts on the frame its button goes up", () => {
    const w = world({
      moves: [{ kind: 'hold', form: 'bolt', elements: ['fire'] }],
      payment: 'mana',
    });
    const input = createArenaInput();
    const mem = padMemory();
    expect(
      frameInput(registry, w, input, pad({ cast: [0], held: [0] }), mem, opts).cast,
    ).toBeNull();
    expect(frameInput(registry, w, input, pad({ held: [0] }), mem, opts).cast).toBeNull();
    expect(frameInput(registry, w, input, pad(), mem, opts).cast).toEqual({ slot: 0, aim: null });
  });

  it("hold-to-repeat's press says so", () => {
    const w = world();
    const input = createArenaInput();
    const mem = padMemory();
    const frame = (acts: Partial<ArenaPadActions>) =>
      frameInput(registry, w, input, pad(acts), mem, opts).cast;
    expect(frame({ cast: [1], held: [1], repeat: [1] })).toEqual({ slot: 1, aim: null });
    w.t += REPEAT_DELAY;
    expect(frame({ held: [1], repeat: [1] })).toEqual({ slot: 1, aim: null, repeat: true });
  });

  it('the right stick aims the attack only while the pad drives it: RB held, or let go this frame', () => {
    const w = world();
    const h = w.hero;
    const input = createArenaInput();
    const mem = padMemory();
    const stick = { aimDir: { x: 1, y: 0 }, aimTilt: 1 };
    const aim = (rb: boolean) =>
      frameInput(registry, w, input, pad({ ...stick, attackHeld: rb }), mem, opts).attackAim;
    // The stick tilted by the way, RB not held: the basics auto-aim.
    expect(aim(false)).toBeNull();
    // RB attacks: the stick aims, and on the frame RB lets go too.
    const along = { x: h.x + h.stats.weapon.range, y: h.y };
    expect(aim(true)).toEqual(along);
    expect(aim(false)).toEqual(along);
    expect(aim(false)).toBeNull();
  });

  it("the pad's attack stays held through a held blow, not through its leap", () => {
    const w = world();
    const input = createArenaInput();
    const mem = padMemory();
    /** RB let go on a frame whose hero holds a blow at its strike point, released or not. */
    const stillHeld = (released: number | null) => {
      w.hero.swing = {
        step: 0,
        dir: { x: 0, y: -1 },
        targetId: null,
        start: 0,
        strikeAt: 0,
        cycle: 1,
        committed: true,
        held: 0,
        released,
      };
      mem.attackHeld = true;
      frameInput(registry, w, input, pad(), mem, opts);
      return mem.attackHeld;
    };
    expect(stillHeld(null)).toBe(true);
    expect(stillHeld(2)).toBe(false);
  });

  it('RB let go on a frame that runs no tick: the next frame still aims with the stick, and the held blow strikes along it', () => {
    const w = createSandboxWorld(registry, {
      depth: 5,
      stats: computeHeroStats({}, registry, { basic: [{ kind: 'hold', element: 'fire' }] }),
      chains: defaultChains(registry, 'fire', null),
      toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
    });
    const h = w.hero;
    // A foe just above the hero: a held blow let go with no aim turns to it.
    Object.assign(spawnDummies(registry, w, { layout: 'single', element: null })[0], {
      x: h.x,
      y: h.y - 1.5,
    });
    const input = createArenaInput();
    const mem = padMemory();
    const STEP = registry.getDelveBalance().arena.step;
    /** One frame with the stick to the left, RB held or not, running `dt` of sim time. */
    const frame = (rb: boolean, dt: number) => {
      const acts = pad({ aimDir: { x: -1, y: 0 }, aimTilt: 1, attackHeld: rb });
      const out = frameInput(registry, w, input, acts, mem, opts);
      return { out, events: stepWorld(registry, w, out, dt) };
    };
    // RB held until the blow holds at its strike point, then let go on a frame with no tick.
    for (let i = 0; i < 60 && h.swing?.held == null; i++) frame(true, STEP);
    frame(false, 0);
    expect(h.swing?.held).toBeTypeOf('number');
    const along = { x: h.x - h.stats.weapon.range, y: h.y };
    const next = frame(false, STEP);
    expect(next.out.attackAim).toEqual(along);
    expect(next.events.find((e) => e.kind === 'basic')).toMatchObject({
      dir: { x: expect.closeTo(-1), y: expect.closeTo(0) },
    });
  });

  describe('press-to-toggle hold moves on the pad', () => {
    const toggle = { ...opts, holdToggle: true };
    const holdBolt = {
      moves: [{ kind: 'hold', form: 'bolt', elements: ['fire'] }],
      payment: 'mana',
    } as Chain;
    /** One frame of the pad under the toggle, stepped: its input, and the casts it made. */
    const run = (w: ReturnType<typeof world>, mem = padMemory()) => {
      const input = createArenaInput();
      const STEP = registry.getDelveBalance().arena.step;
      return (acts: Partial<ArenaPadActions>) => {
        const out = frameInput(registry, w, input, pad(acts), mem, toggle);
        return { out, casts: stepWorld(registry, w, out, STEP).filter((e) => e.kind === 'cast') };
      };
    };

    it('a press starts a hold charging, the button let go keeps it, and the next press releases it', () => {
      const w = world(holdBolt);
      const frame = run(w);
      expect(frame({ cast: [0], held: [0] }).casts).toEqual([]);
      for (let i = 0; i < 5; i++) expect(frame({}).out.holding).toBe(0); // RT up: still charging
      expect(w.hero.hold?.slot).toBe(0);
      const fired = frame({ cast: [0], held: [0] });
      expect(fired.out).toMatchObject({ cast: { slot: 0, aim: null }, holding: null });
      // RT still down after the second press, then let go: nothing more charges or casts.
      expect(frame({ held: [0] }).out).toMatchObject({ cast: null, holding: null });
      expect(frame({}).out).toMatchObject({ cast: null, holding: null });
      expect(w.hero.hold).toBeNull();
    });

    it('any other move casts on the press, as without the toggle', () => {
      const w = world(); // the default Primary: no hold
      const mem = padMemory();
      expect(run(w, mem)({ cast: [0], held: [0] }).out.cast).toEqual({ slot: 0, aim: null });
      expect(mem.latch).toBeNull();
    });

    it("another ability's press releases the charging one first, as a chord does", () => {
      const w = world(holdBolt);
      const mem = padMemory();
      const frame = run(w, mem);
      frame({ cast: [0], held: [0] });
      for (let i = 0; i < 5; i++) frame({});
      expect(frame({ cast: [1], held: [1] }).out.cast).toEqual({ slot: 0, aim: null });
      expect(mem.latch).toBeNull();
    });

    it('a hold that fires by itself at full charge lets go: the next press starts a new one', () => {
      const w = world(holdBolt);
      // Something to aim at: with nothing, a full charge ends unpaid and casts nothing.
      spawnDummies(registry, w, { layout: 'single', element: null });
      const mem = padMemory();
      const frame = run(w, mem);
      frame({ cast: [0], held: [0] });
      let fired = false;
      for (let i = 0; i < 600 && !fired; i++) fired = frame({}).casts.length > 0;
      expect(fired).toBe(true); // auto-fire at holdMax × the tempo
      // The latch lets go quietly: no second cast as the slot stops being held.
      const after = frame({});
      expect(after.out).toMatchObject({ cast: null, holding: null });
      expect(after.casts).toEqual([]);
      expect(mem.latch).toBeNull();
      // Wait out the move's cooldown and beat, then a press charges anew rather than releasing.
      for (let i = 0; i < 300 && !abilityReady(makeCtx(registry, w, []), 0); i++) frame({});
      const again = frame({ cast: [0], held: [0] });
      expect(again.out).toMatchObject({ cast: null, holding: 0 });
    });

    it('off by default: the button let go releases the hold, as ever', () => {
      const w = world(holdBolt);
      const input = createArenaInput();
      const mem = padMemory();
      frameInput(registry, w, input, pad({ cast: [0], held: [0] }), mem, opts);
      expect(frameInput(registry, w, input, pad(), mem, opts).cast).toEqual({ slot: 0, aim: null });
    });
  });
});

describe('interact', () => {
  let detach = () => {};
  afterEach(() => detach());

  it('C interacts, and frameInput sends the press once', () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    key('keydown', 'KeyC');
    expect(input.interact).toBe(true);
    const w = world();
    const mem = padMemory();
    const o = { manual: false, aimReach: 1, toWorld: (p: Vec) => p, device: 'keyboard' as const };
    expect(frameInput(registry, w, input, null, mem, o).interact).toBe(true);
    expect(frameInput(registry, w, input, null, mem, o).interact).toBe(false);
  });
});
