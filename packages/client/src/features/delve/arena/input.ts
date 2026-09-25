import type { Vec } from '@alloy/engine';
import { classifyPress } from './aim-gestures';

/** An ability press. `aim` is a screen point (client px), or null to auto-aim. */
export interface CastPress {
  slot: number;
  aim: Vec | null;
  /** An aim already in world units (the controller's right stick). */
  aimWorld?: Vec | null;
}

/** A press being held to aim: the marker follows `at` (client px), or the mouse when null. */
export interface Aiming {
  slot: number;
  since: number;
  at: Vec | null;
}

/** Live controller state shared between the controls and the game loop. */
export interface ArenaInput {
  /** Keyboard direction (WASD / arrows). */
  keys: Vec;
  /** Touch joystick or mouse-drag direction. */
  pointer: Vec;
  cast: CastPress | null;
  aiming: Aiming | null;
  /** Last mouse position (client px), for hold-to-aim on the keyboard. */
  mouse: Vec | null;
  potion: boolean;
  dodge: boolean;
  /** Manual basic attacks: held now, pressed since the last frame, and the aim (client px, or null to auto-aim). */
  attackHeld: boolean;
  attackTap: boolean;
  attackAim: Vec | null;
}

export function createArenaInput(): ArenaInput {
  return {
    keys: { x: 0, y: 0 },
    pointer: { x: 0, y: 0 },
    cast: null,
    aiming: null,
    mouse: null,
    potion: false,
    dodge: false,
    attackHeld: false,
    attackTap: false,
    attackAim: null,
  };
}

/** Combined move vector: keyboard wins when pressed. */
export function moveVector(input: ArenaInput): Vec {
  return input.keys.x !== 0 || input.keys.y !== 0 ? input.keys : input.pointer;
}

const DIRS: Record<string, Vec> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

const CAST_KEYS: Record<string, number> = {
  KeyQ: 0,
  Digit1: 0,
  KeyE: 1,
  Digit2: 1,
  KeyR: 2,
  Digit3: 2,
};

/**
 * Wire keyboard controls to `input`. Q/E/R: a quick tap auto-aims; holding
 * shows the aim marker at the mouse and releasing casts there. Returns a
 * cleanup function.
 */
export function attachKeyboard(input: ArenaInput, isEnabled: () => boolean): () => void {
  const held = new Set<string>();
  const recompute = () => {
    let x = 0;
    let y = 0;
    for (const code of held) {
      const d = DIRS[code];
      if (d) {
        x += d.x;
        y += d.y;
      }
    }
    const len = Math.hypot(x, y);
    input.keys = len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  };
  const down = (e: KeyboardEvent) => {
    if (!isEnabled() || e.target instanceof HTMLInputElement) return;
    if (DIRS[e.code]) {
      held.add(e.code);
      recompute();
      e.preventDefault();
    } else if (e.code in CAST_KEYS && !e.repeat) {
      // Another ability key is still held: use it now rather than drop it.
      if (input.aiming?.at === null) release();
      input.aiming = { slot: CAST_KEYS[e.code], since: performance.now(), at: null };
    } else if (e.code === 'Space' && !e.repeat) {
      input.dodge = true;
      e.preventDefault();
    } else if (e.code === 'KeyF' && !e.repeat) {
      input.potion = true;
      e.preventDefault();
    }
  };
  /** Cast the key-held ability: a tap auto-aims, a hold aims at the mouse. */
  const release = () => {
    const a = input.aiming;
    if (!a) return;
    input.aiming = null;
    const tap = classifyPress(performance.now() - a.since, 0) === 'tap' || !input.mouse;
    input.cast = { slot: a.slot, aim: tap ? null : input.mouse };
  };
  const up = (e: KeyboardEvent) => {
    if (held.delete(e.code)) recompute();
    const a = input.aiming;
    if (a && a.at === null && CAST_KEYS[e.code] === a.slot) release();
  };
  const move = (e: MouseEvent) => {
    input.mouse = { x: e.clientX, y: e.clientY };
  };
  const blur = () => {
    held.clear();
    recompute();
    input.aiming = null;
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('mousemove', move);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('mousemove', move);
    window.removeEventListener('blur', blur);
  };
}
