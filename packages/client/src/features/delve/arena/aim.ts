import type { FormId } from '@alloy/engine';

/** A press shorter than this is a tap: the ability auto-aims. */
export const TAP_MS = 150;

export function classifyPress(durationMs: number): 'tap' | 'aim' {
  return durationMs < TAP_MS ? 'tap' : 'aim';
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
