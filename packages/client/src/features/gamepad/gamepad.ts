import type { Vec } from '@alloy/engine';

/**
 * Reading a controller through the browser's "standard" gamepad mapping (an
 * Xbox pad, or anything the browser maps the same way).
 */

/** The parts of the DOM `Gamepad` we read (so tests can pass plain objects). */
export interface GamepadLike {
  connected: boolean;
  mapping: string;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
  vibrationActuator?: {
    playEffect?: (type: string, params: Record<string, number>) => Promise<unknown>;
  } | null;
}

export const PAD_BUTTONS = [
  'a',
  'b',
  'x',
  'y',
  'lb',
  'rb',
  'lt',
  'rt',
  'view',
  'menu',
  'ls',
  'rs',
  'up',
  'down',
  'left',
  'right',
] as const;
export type PadButton = (typeof PAD_BUTTONS)[number];

export interface PadState {
  /** Sticks after their deadzones, magnitude 0..1. */
  left: Vec;
  right: Vec;
  buttons: Record<PadButton, boolean>;
}

export const LEFT_DEADZONE = 0.2;
export const RIGHT_DEADZONE = 0.35;
const TRIGGER_THRESHOLD = 0.4;

/** Zero a stick inside the deadzone and rescale the rest so the edge of it is 0 and full tilt is 1. */
export function radialDeadzone(x: number, y: number, deadzone: number): Vec {
  const len = Math.hypot(x, y);
  if (len <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (len - deadzone) / (1 - deadzone));
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}

export function readPad(
  pad: GamepadLike,
  deadzone: { left: number; right: number } = { left: LEFT_DEADZONE, right: RIGHT_DEADZONE },
): PadState {
  const axis = (i: number) => pad.axes[i] ?? 0;
  const buttons = {} as Record<PadButton, boolean>;
  PAD_BUTTONS.forEach((name, i) => {
    const b = pad.buttons[i];
    const trigger = name === 'lt' || name === 'rt';
    buttons[name] = !!b && (b.pressed || (trigger && b.value > TRIGGER_THRESHOLD));
  });
  return {
    left: radialDeadzone(axis(0), axis(1), deadzone.left),
    right: radialDeadzone(axis(2), axis(3), deadzone.right),
    buttons,
  };
}

/** Buttons that went down since `prev` (all held buttons when there is no `prev`). */
export function edges(prev: PadState | null, next: PadState): Set<PadButton> {
  const out = new Set<PadButton>();
  for (const name of PAD_BUTTONS) if (next.buttons[name] && !prev?.buttons[name]) out.add(name);
  return out;
}

/** How far (0..1) a stick out of its deadzone must move from where it lay to claim the input lock. */
export const STICK_CLAIM = 0.25;

/** Where each stick lay: followed while the pad has the input lock, else back at the centre when let go. */
export type PadRest = Pick<PadState, 'left' | 'right'>;

const centred = (v: Vec) => v.x === 0 && v.y === 0;

/**
 * Whether the pad claims the input lock this frame: a button pressed
 * (`pressed`), or a stick pushed out of its deadzone or moved well away from
 * where it lay (`rest`). A stick held still, or a trigger resting half down,
 * doesn't, so the mouse or the keys keep the lock.
 */
export function padClaims(pressed: Set<PadButton>, next: PadState, rest: PadRest): boolean {
  const moved = (from: Vec, to: Vec) =>
    !centred(to) && (centred(from) || Math.hypot(to.x - from.x, to.y - from.y) > STICK_CLAIM);
  return pressed.size > 0 || moved(rest.left, next.left) || moved(rest.right, next.right);
}

/** Where the sticks lie after this frame (see `PadRest`). */
export function restAfter(rest: PadRest, next: PadState, locked: boolean): PadRest {
  const settle = (from: Vec, to: Vec) => (locked || centred(to) ? to : from);
  return { left: settle(rest.left, next.left), right: settle(rest.right, next.right) };
}

/** The first connected pad with the standard mapping, if any. */
export function firstPad(): GamepadLike | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  for (const pad of navigator.getGamepads()) {
    if (pad && pad.connected && pad.mapping === 'standard') return pad as unknown as GamepadLike;
  }
  return null;
}
