import type { FormId, Vec } from '@alloy/engine';

/** A press shorter than this (and barely moved) is a tap: the ability auto-aims. */
export const TAP_MS = 150;
/** Pointer travel (px) that turns a press into a drag-to-aim. */
export const DRAG_PX = 12;

export function classifyPress(durationMs: number, dragPx: number): 'tap' | 'aim' {
  return durationMs < TAP_MS && dragPx < DRAG_PX ? 'tap' : 'aim';
}

export type AimMarker = 'circle' | 'line' | 'none';

const PLACED: FormId[] = ['burst', 'barrage', 'maelstrom'];
const DIRECTIONAL: FormId[] = ['bolt', 'volley', 'lance', 'strike', 'blink'];

/** What the arena shows while aiming: a circle where it lands, or a line where it goes. */
export function aimMarkerFor(form: FormId): AimMarker {
  if (PLACED.includes(form)) return 'circle';
  if (DIRECTIONAL.includes(form)) return 'line';
  return 'none';
}

/** Releasing back over the button (within its radius) cancels the aim. */
export function isCancelled(release: Vec, button: { x: number; y: number; r: number }): boolean {
  return Math.hypot(release.x - button.x, release.y - button.y) <= button.r;
}
