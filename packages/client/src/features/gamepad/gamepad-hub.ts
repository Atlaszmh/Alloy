import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { useControlsStore } from '@/stores/controlsStore';
import {
  edges,
  firstPad,
  padClaims,
  readPad,
  restAfter,
  type PadButton,
  type PadRest,
  type PadState,
} from './gamepad';

/**
 * The one place the controller is read: once per animation frame. Each press
 * goes to exactly one owner, decided when it happens: the arena while a fight
 * is live (queued until its game loop takes it), otherwise the menu
 * navigation. Reading twice would let one press act twice (close a menu, then
 * reopen it). It also claims the input lock (`inputDeviceStore`) for the
 * pad on a change (`padClaims`), never on a steady state.
 */

type NavHandler = (state: PadState, pressed: Set<PadButton>, now: number) => void;

let prev: PadState | null = null;
let current: PadState | null = null;
const CENTRE = { x: 0, y: 0 };
let rest: PadRest = { left: CENTRE, right: CENTRE };
let arenaLive = false;
const arenaPresses = new Set<PadButton>();
let nav: NavHandler | null = null;
let capture: ((button: PadButton) => void) | null = null;
let raf = 0;

/**
 * The next button pressed goes to `onButton` (the Controls editor binding it)
 * instead of the arena or the menus. Returns a cancel function.
 */
export function capturePadButton(onButton: (button: PadButton) => void): () => void {
  capture = onButton;
  return () => {
    if (capture === onButton) capture = null;
  };
}

/** The arena owns the controller while a fight is live (not paused). */
export function setArenaLive(live: boolean): void {
  arenaLive = live;
  arenaPresses.clear();
}

/** The pad as of this frame (sticks and held buttons), or null with no pad. */
export function padState(): PadState | null {
  return current;
}

/** Presses since the arena last asked (only those made while it was live). */
export function takeArenaPresses(): Set<PadButton> {
  const out = new Set(arenaPresses);
  arenaPresses.clear();
  return out;
}

function frame(now: number): void {
  raf = requestAnimationFrame(frame);
  const pad = firstPad();
  if (!pad) {
    prev = current = null;
    rest = { left: CENTRE, right: CENTRE };
    return;
  }
  current = readPad(pad, useControlsStore.getState().config.deadzone);
  const pressed = edges(prev, current);
  prev = current;
  const lock = useInputDeviceStore.getState();
  if (lock.device !== 'gamepad' && padClaims(pressed, current, rest)) lock.setDevice('gamepad');
  rest = restAfter(rest, current, useInputDeviceStore.getState().device === 'gamepad');
  if (capture && pressed.size > 0) {
    const onButton = capture;
    capture = null;
    onButton([...pressed][0]);
    return;
  }
  if (arenaLive) for (const b of pressed) arenaPresses.add(b);
  else nav?.(current, pressed, now);
}

/** Start reading the controller; `onNav` gets presses made outside live combat. */
export function startGamepad(onNav: NavHandler): () => void {
  nav = onNav;
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    nav = null;
  };
}
