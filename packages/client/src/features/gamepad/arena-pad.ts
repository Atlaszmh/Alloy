import type { Vec } from '@alloy/engine';
import type { PadButton, PadState } from './gamepad';

/** What the controller asks of the arena this frame (Hades-style layout). */
export interface ArenaPadActions {
  /** Left stick, 0..1 per axis after the deadzone. */
  move: Vec;
  /** Right stick direction when tilted past its deadzone, else null (auto-aim). */
  aimDir: Vec | null;
  /** How far the right stick is tilted, 0..1. */
  aimTilt: number;
  /** Ability slot pressed this frame: X Primary, B Defensive, Y Ultimate. */
  cast: number | null;
  dodge: boolean;
  potion: boolean;
  /** RT held: manual basic attacks. */
  attackHeld: boolean;
  menu: boolean;
}

const CAST_BUTTONS: [PadButton, number][] = [
  ['x', 0],
  ['b', 1],
  ['y', 2],
];

export function padToArena(state: PadState, pressed: Set<PadButton>): ArenaPadActions {
  const tilt = Math.hypot(state.right.x, state.right.y);
  return {
    move: state.left,
    aimDir: tilt > 0 ? { x: state.right.x / tilt, y: state.right.y / tilt } : null,
    aimTilt: tilt,
    cast: CAST_BUTTONS.find(([b]) => pressed.has(b))?.[1] ?? null,
    dodge: pressed.has('a'),
    potion: pressed.has('lb'),
    attackHeld: state.buttons.rt,
    menu: pressed.has('menu'),
  };
}

/**
 * Where a right-stick aim lands, in world units. Placed forms reach further
 * the more the stick is tilted; directional forms just take the direction.
 */
export function stickAimPoint(
  hero: Vec,
  dir: Vec,
  tilt: number,
  range: number,
  placed: boolean,
): Vec {
  const reach = range > 0 ? (placed ? range * Math.max(0.3, tilt) : range) : 4;
  return { x: hero.x + dir.x * reach, y: hero.y + dir.y * reach };
}
