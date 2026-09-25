import type { Vec } from '@alloy/engine';
import type { PadButton, PadState } from './gamepad';

/**
 * What the controller asks of the arena this frame. Both thumbs stay on the
 * sticks (left moves, right aims), so every action is on a shoulder, a stick
 * click or the D-pad: RT Primary (held keeps casting), LT dodge, LB
 * Defensive, R3 Ultimate, RB manual basic attack, D-pad down potion.
 */
export interface ArenaPadActions {
  /** Left stick, 0..1 per axis after the deadzone. */
  move: Vec;
  /** Right stick direction when tilted past its deadzone, else null (auto-aim). */
  aimDir: Vec | null;
  /** How far the right stick is tilted, 0..1. */
  aimTilt: number;
  /** Ability slot pressed this frame (0 Primary, 1 Defensive, 2 Ultimate). */
  cast: number | null;
  /** Ability slot held down: cast again whenever it's ready (the Primary on RT). */
  castHeld: number | null;
  dodge: boolean;
  potion: boolean;
  /** RB held: manual basic attacks. */
  attackHeld: boolean;
  menu: boolean;
}

const CAST_BUTTONS: [PadButton, number][] = [
  ['rt', 0],
  ['lb', 1],
  ['rs', 2],
];

export function padToArena(state: PadState, pressed: Set<PadButton>): ArenaPadActions {
  const tilt = Math.hypot(state.right.x, state.right.y);
  return {
    move: state.left,
    aimDir: tilt > 0 ? { x: state.right.x / tilt, y: state.right.y / tilt } : null,
    aimTilt: tilt,
    cast: CAST_BUTTONS.find(([b]) => pressed.has(b))?.[1] ?? null,
    castHeld: state.buttons.rt ? 0 : null,
    dodge: pressed.has('lt'),
    potion: pressed.has('down'),
    attackHeld: state.buttons.rb,
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
