import {
  abilityReady,
  makeCtx,
  nextMove,
  type ArpgWorld,
  type DataRegistry,
  type Vec,
} from '@alloy/engine';
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
  /** Ability slot whose button is held (repeat or not): a hold move charges while it is. */
  holding: number | null;
  dodge: boolean;
  potion: boolean;
  /** The attack button held: manual basic attacks. */
  attackHeld: boolean;
  /** The attack button pressed this frame (a tap the engine keeps briefly). */
  attackTap: boolean;
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
  const holding = ABILITY_ACTIONS.findIndex((a) => is(cfg.pad[a], (b) => state.buttons[b]));
  return {
    move: state.left,
    aimDir: tilt > 0 ? { x: state.right.x / tilt, y: state.right.y / tilt } : null,
    aimTilt: tilt,
    cast: cast >= 0 ? cast : null,
    castHeld: held >= 0 ? held : null,
    holding: holding >= 0 ? holding : null,
    dodge: is(cfg.pad.dodge, (b) => pressed.has(b)),
    potion: is(cfg.pad.potion, (b) => pressed.has(b)),
    attackHeld: is(cfg.pad.attack, (b) => state.buttons[b]),
    attackTap: is(cfg.pad.attack, (b) => pressed.has(b)),
    menu: is(cfg.pad.menu, (b) => pressed.has(b)),
  };
}

/**
 * The ability slot the controller casts this frame, read from the world (not
 * the HUD snapshot). A slot whose next move is a hold, or whose hold is
 * charging, casts on its button's release (`released`: the slot held last
 * frame and not now), never on the press and never by repeat: the held
 * button charges it. Any other casts on the press, which always tries (so an
 * unaffordable one still says so), or with repeat on, again whenever it's ready,
 * but not while the button that dropped its slot's hold stays held
 * (`holdDropped`): after a hold fires by itself, the next move waits for a press.
 */
export function padCast(
  registry: DataRegistry,
  world: ArpgWorld,
  acts: Pick<ArenaPadActions, 'cast' | 'castHeld'>,
  released: number | null,
): number | null {
  const h = world.hero;
  const comboWindow = registry.getDelveBalance().abilities.comboWindow;
  const isHold = (slot: number) =>
    h.hold?.slot === slot || nextMove(h, slot, world.t, comboWindow).kind === 'hold';
  if (released !== null && isHold(released)) return released;
  if (acts.cast !== null) return isHold(acts.cast) ? null : acts.cast;
  const held = acts.castHeld;
  return held !== null &&
    !isHold(held) &&
    world.holdDropped !== held &&
    abilityReady(makeCtx(registry, world, []), held)
    ? held
    : null;
}

/** What the pad remembers from the frame before. */
export interface PadMemory {
  /** The ability slot held then: once it no longer is, its button has let go. */
  holding: number | null;
  /** A press that came as another slot's hold released: it casts now. */
  carried: number | null;
  /**
   * The attack button held then, or let go with its held blow not yet struck:
   * the tick that strikes it still aims with the stick.
   */
  attackHeld: boolean;
}

export function padMemory(): PadMemory {
  return { holding: null, carried: null, attackHeld: false };
}

/**
 * This frame's controller cast (`padCast`) with the pad's memory of the frame
 * before: the slot held then and not now has released. `holding` names one
 * slot, so a chord (another button pressed while a hold charges) brings a
 * release and a press in one frame: the release casts now and the press the
 * frame after, rather than being lost.
 */
export function padFrameCast(
  registry: DataRegistry,
  world: ArpgWorld,
  acts: Pick<ArenaPadActions, 'cast' | 'castHeld' | 'holding'>,
  mem: PadMemory,
): number | null {
  const released = mem.holding !== null && acts.holding !== mem.holding ? mem.holding : null;
  const press = acts.cast ?? mem.carried;
  mem.holding = acts.holding;
  mem.carried = null;
  const slot = padCast(registry, world, { cast: press, castHeld: acts.castHeld }, released);
  if (slot !== null && slot === released && press !== null && press !== slot) mem.carried = press;
  return slot;
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
