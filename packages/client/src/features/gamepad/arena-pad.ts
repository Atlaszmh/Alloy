import type { Vec } from '@alloy/engine';
import type { PadButton, PadState } from './gamepad';
import { DEFAULT_CONTROLS, type ControlsConfig } from '@/features/controls/controls';

/**
 * What the controller asks of the arena this frame, from the player's
 * bindings (`ControlsConfig.pad`; the default keeps both thumbs on the
 * sticks: RT Primary, LT dodge, LB Defensive, R3 Ultimate, RB manual attack,
 * D-pad down potion).
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
  /** Ability slot held down with hold-to-repeat on: cast again whenever it's ready. */
  castHeld: number | null;
  dodge: boolean;
  potion: boolean;
  /** The attack button held: manual basic attacks. */
  attackHeld: boolean;
  menu: boolean;
}

const ABILITY_ACTIONS = ['primary', 'defensive', 'ultimate'] as const;

export function padToArena(
  state: PadState,
  pressed: Set<PadButton>,
  cfg: ControlsConfig = DEFAULT_CONTROLS,
): ArenaPadActions {
  const tilt = Math.hypot(state.right.x, state.right.y);
  const is = (b: PadButton | null, set: (b: PadButton) => boolean) => b !== null && set(b);
  const cast = ABILITY_ACTIONS.findIndex((a) => is(cfg.pad[a], (b) => pressed.has(b)));
  const held = ABILITY_ACTIONS.findIndex(
    (a) => cfg.repeat[a] && is(cfg.pad[a], (b) => state.buttons[b]),
  );
  return {
    move: state.left,
    aimDir: tilt > 0 ? { x: state.right.x / tilt, y: state.right.y / tilt } : null,
    aimTilt: tilt,
    cast: cast >= 0 ? cast : null,
    castHeld: held >= 0 ? held : null,
    dodge: is(cfg.pad.dodge, (b) => pressed.has(b)),
    potion: is(cfg.pad.potion, (b) => pressed.has(b)),
    attackHeld: is(cfg.pad.attack, (b) => state.buttons[b]),
    menu: is(cfg.pad.menu, (b) => pressed.has(b)),
  };
}

/**
 * Where a right-stick aim lands, in world units. Placed forms reach further
 * the more the stick is tilted (up to `aimReach` × their range); directional
 * forms just take the direction.
 */
export function stickAimPoint(
  hero: Vec,
  dir: Vec,
  tilt: number,
  range: number,
  placed: boolean,
  aimReach = 1,
): Vec {
  const reach = range > 0 ? (placed ? range * Math.max(0.3, tilt * aimReach) : range) : 4;
  return { x: hero.x + dir.x * reach, y: hero.y + dir.y * reach };
}
