import { pressMove, type ArpgWorld, type DataRegistry, type Vec } from '@alloy/engine';
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
  /** Ability slots pressed this frame (0 Primary, 1 Defensive, 2 Ultimate), in slot order. */
  cast: number[];
  /** Ability slots whose buttons are held, in slot order. */
  held: number[];
  /** Of those, the ones with hold-to-repeat on. */
  repeat: number[];
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
  /** The ability slots whose button passes `on` (and, with `repeat`, has hold-to-repeat on). */
  const slots = (on: (b: PadButton) => boolean, repeat = false) =>
    ABILITY_ACTIONS.flatMap((a, i) =>
      (!repeat || cfg.repeat[a]) && is(cfg.pad[a], on) ? [i] : [],
    );
  return {
    move: state.left,
    aimDir: tilt > 0 ? { x: state.right.x / tilt, y: state.right.y / tilt } : null,
    aimTilt: tilt,
    cast: slots((b) => pressed.has(b)),
    held: slots((b) => state.buttons[b]),
    repeat: slots((b) => state.buttons[b], true),
    dodge: is(cfg.pad.dodge, (b) => pressed.has(b)),
    potion: is(cfg.pad.potion, (b) => pressed.has(b)),
    attackHeld: is(cfg.pad.attack, (b) => state.buttons[b]),
    attackTap: is(cfg.pad.attack, (b) => pressed.has(b)),
    menu: is(cfg.pad.menu, (b) => pressed.has(b)),
  };
}

/**
 * Whether a slot's button casts on its release: its hold is charging, or the
 * move a press now would cast is a hold (during the slot's own wind-up, the
 * move after the winding one: `pressMove`).
 */
function castsOnRelease(registry: DataRegistry, world: ArpgWorld, slot: number): boolean {
  const h = world.hero;
  const window = registry.getDelveBalance().abilities.comboWindow;
  return h.hold?.slot === slot || pressMove(h, slot, world.t, window).kind === 'hold';
}

/** A controller cast: its slot, and whether hold-to-repeat made it (`AbilityCast.repeat`). */
export interface PadCast {
  slot: number;
  repeat: boolean;
}

/**
 * The ability the controller casts this frame, read from the world (not the
 * HUD snapshot). A slot whose button casts on its release (`castsOnRelease`)
 * casts when it lets go (`released`: the slot held last frame and not now),
 * never on the press (unless `tap`: pressed with a higher slot in one frame, it
 * taps, as a key does) and never by repeat: the held button charges it. Any
 * other casts on the press, which always tries (so an unaffordable one still
 * says so), or with repeat on (`castHeld`), early: whenever its slot has no
 * press waiting, including during a wind-up, a beat or a cooldown (the press
 * waits in the buffer), but not while the button that dropped its slot's hold
 * stays held (`holdDropped`): after a hold fires by itself, the next move
 * waits for a press.
 */
export function padCast(
  registry: DataRegistry,
  world: ArpgWorld,
  acts: { cast: number | null; castHeld: number | null },
  released: number | null,
  tap = false,
): PadCast | null {
  const onRelease = (slot: number) => castsOnRelease(registry, world, slot);
  if (released !== null && onRelease(released)) return { slot: released, repeat: false };
  if (acts.cast !== null)
    return tap || !onRelease(acts.cast) ? { slot: acts.cast, repeat: false } : null;
  const held = acts.castHeld;
  return held !== null &&
    !onRelease(held) &&
    world.holdDropped !== held &&
    !world.queuedCasts.some((q) => q.cast.slot === held)
    ? { slot: held, repeat: true }
    : null;
}

/** What the pad remembers from the frame before. */
export interface PadMemory {
  /**
   * The pad's `holding`: the latest ability button pressed, while it stays
   * held. Once it isn't (let go, or another button pressed), it has released.
   */
  holding: number | null;
  /** The ability buttons held, earliest pressed first: hold-to-repeat follows the latest. */
  order: number[];
  /** A press that waits a frame (a chord's, or the higher of two in one frame): it casts now. */
  carried: number | null;
  /**
   * The attack button held then, or let go with its held blow not yet struck:
   * the tick that strikes it still aims with the stick.
   */
  attackHeld: boolean;
}

export function padMemory(): PadMemory {
  return { holding: null, order: [], carried: null, attackHeld: false };
}

/** The controller's part of a frame's input: its cast (`padCast`), and the slot it is holding. */
export interface PadFrame {
  cast: PadCast | null;
  holding: number | null;
}

/**
 * This frame's controller cast and `holding`, with the pad's memory of the
 * frame before. `holding` is the latest ability button pressed while it stays
 * held; an earlier button counts again only when it is pressed again. So a
 * second button pressed while another's hold charges brings that hold's
 * release (it casts now) and its own press, which follows next frame (the
 * chord's carry), whichever slots they are. Two pressed in one frame count in
 * slot order: the lower's press goes now (a tap on a hold, as a key's), the
 * higher becomes `holding` and its press follows next frame, unless its next
 * move is a hold (the button charges it). Hold-to-repeat streams the latest
 * held repeat button, falling back to an earlier one still held.
 */
export function padFrameCast(
  registry: DataRegistry,
  world: ArpgWorld,
  acts: Pick<ArenaPadActions, 'cast' | 'held' | 'repeat'>,
  mem: PadMemory,
): PadFrame {
  const pressed = acts.cast;
  mem.order = [
    ...mem.order.filter((s) => acts.held.includes(s) && !pressed.includes(s)),
    ...pressed,
  ];
  const latest = pressed.length > 0 ? pressed[pressed.length - 1] : null;
  const holding =
    latest ?? (mem.holding !== null && acts.held.includes(mem.holding) ? mem.holding : null);
  const released = mem.holding !== null && mem.holding !== holding ? mem.holding : null;
  mem.holding = holding;
  const carried = mem.carried;
  mem.carried = null;
  const press = pressed.length > 0 ? pressed[0] : carried;
  const castHeld = [...mem.order].reverse().find((s) => acts.repeat.includes(s)) ?? null;
  const cast = padCast(registry, world, { cast: press, castHeld }, released, pressed.length > 1);
  // A chord: the release casts now, the press next frame.
  if (cast?.slot === released && press !== null && press !== released) mem.carried = press;
  // Two at once: the higher follows next frame, unless it charges a hold.
  else if (pressed.length > 1 && !castsOnRelease(registry, world, latest!)) mem.carried = latest;
  return { cast, holding };
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
