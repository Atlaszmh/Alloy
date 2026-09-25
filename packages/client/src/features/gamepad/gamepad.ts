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

export function readPad(pad: GamepadLike): PadState {
  const axis = (i: number) => pad.axes[i] ?? 0;
  const buttons = {} as Record<PadButton, boolean>;
  PAD_BUTTONS.forEach((name, i) => {
    const b = pad.buttons[i];
    const trigger = name === 'lt' || name === 'rt';
    buttons[name] = !!b && (b.pressed || (trigger && b.value > TRIGGER_THRESHOLD));
  });
  return {
    left: radialDeadzone(axis(0), axis(1), LEFT_DEADZONE),
    right: radialDeadzone(axis(2), axis(3), RIGHT_DEADZONE),
    buttons,
  };
}

/** Buttons that went down since `prev` (all held buttons when there is no `prev`). */
export function edges(prev: PadState | null, next: PadState): Set<PadButton> {
  const out = new Set<PadButton>();
  for (const name of PAD_BUTTONS) if (next.buttons[name] && !prev?.buttons[name]) out.add(name);
  return out;
}

/** Any input at all (a held button or a tilted stick): the pad is in use. */
export function isActive(state: PadState): boolean {
  return (
    state.left.x !== 0 ||
    state.left.y !== 0 ||
    state.right.x !== 0 ||
    state.right.y !== 0 ||
    PAD_BUTTONS.some((b) => state.buttons[b])
  );
}

/** The first connected pad with the standard mapping, if any. */
export function firstPad(): GamepadLike | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  for (const pad of navigator.getGamepads()) {
    if (pad && pad.connected && pad.mapping === 'standard') return pad as unknown as GamepadLike;
  }
  return null;
}
