import type { Vec } from '@alloy/engine';
import { classifyPress } from './aim-gestures';
import { useControlsStore } from '@/stores/controlsStore';
import type { KeyAction, MoveKey } from '@/features/controls/controls';

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

/** The arrow keys always move, whatever else is bound. */
const ARROWS: Record<string, Vec> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

const MOVE_DIRS: Record<MoveKey, Vec> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const ABILITY_SLOT: Partial<Record<KeyAction, number>> = { primary: 0, defensive: 1, ultimate: 2 };

/** Which action a key is bound to in the player's setup, if any. */
function keyAction(code: string): KeyAction | null {
  const keys = useControlsStore.getState().config.keys;
  return (Object.keys(keys) as KeyAction[]).find((a) => keys[a] === code) ?? null;
}

function moveDir(code: string): Vec | null {
  if (ARROWS[code]) return ARROWS[code];
  const action = keyAction(code);
  return action && action in MOVE_DIRS ? MOVE_DIRS[action as MoveKey] : null;
}

/**
 * Wire keyboard controls to `input`, following the player's key bindings.
 * Ability keys: a quick tap auto-aims; holding shows the aim marker at the
 * mouse and releasing casts there. Returns a cleanup function.
 */
export function attachKeyboard(input: ArenaInput, isEnabled: () => boolean): () => void {
  const held = new Set<string>();
  const recompute = () => {
    let x = 0;
    let y = 0;
    for (const code of held) {
      const d = moveDir(code);
      if (d) {
        x += d.x;
        y += d.y;
      }
    }
    const len = Math.hypot(x, y);
    input.keys = len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  };
  const down = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    // The menu key works while paused too, so it can close the dive menu.
    if (!e.repeat && keyAction(e.code) === 'menu') {
      (document.querySelector('[data-pad-menu]') as HTMLElement | null)?.click();
      return;
    }
    if (!isEnabled()) return;
    if (moveDir(e.code)) {
      held.add(e.code);
      recompute();
      e.preventDefault();
      return;
    }
    const action = keyAction(e.code);
    if (!action || e.repeat) return;
    const slot = ABILITY_SLOT[action];
    if (slot !== undefined) {
      // Another ability key is still held: use it now rather than drop it.
      if (input.aiming?.at === null) release();
      input.aiming = { slot, since: performance.now(), at: null };
    } else if (action === 'dodge') {
      input.dodge = true;
      e.preventDefault();
    } else if (action === 'potion') {
      input.potion = true;
      e.preventDefault();
    } else if (action === 'attack') {
      input.attackHeld = true;
      input.attackTap = true;
      input.attackAim = input.mouse;
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
    const action = keyAction(e.code);
    if (action === 'attack') input.attackHeld = false;
    const a = input.aiming;
    if (a && a.at === null && action && ABILITY_SLOT[action] === a.slot) release();
  };
  const move = (e: MouseEvent) => {
    input.mouse = { x: e.clientX, y: e.clientY };
    if (input.attackHeld) input.attackAim = input.mouse;
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
