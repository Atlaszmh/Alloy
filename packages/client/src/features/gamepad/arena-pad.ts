import { pressMove, type ArpgWorld, type DataRegistry, type Vec } from '@alloy/engine';
import type { PadButton, PadState } from './gamepad';
import { DEFAULT_CONTROLS, type ControlsConfig } from '@/features/controls/controls';

/**
 * What the controller asks of the arena this frame, from the player's
 * bindings (`ControlsConfig.pad`; the default keeps both thumbs on the
 * sticks: RT Primary, LT dodge, LB Defensive, R3 Ultimate, RB manual attack,
 * D-pad down potion, L3 held every loot label, View the journal).
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
  /** The labels button held (L3): every drop's loot label shows. */
  labels: boolean;
  /** The journal button pressed this frame (View). */
  journal: boolean;
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
    labels: is(cfg.pad.labels, (b) => state.buttons[b]),
    journal: is(cfg.pad.journal, (b) => pressed.has(b)),
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
  return h.hold?.slot === slot || pressMove(h, slot, world.t, window)?.kind === 'hold';
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
 * never on the press (unless `tap`: its button isn't the one held last, so it
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
  /**
   * Presses that wait, one going a frame (a chord's, or all but the lowest of
   * several in one frame), in the order they go.
   */
  carried: number[];
  /**
   * The slot whose latest press cast on the press itself: its release casts
   * only a hold it charges, never a second move.
   */
  sent: number | null;
  /**
   * The attack button held then, or let go with its held blow not yet struck:
   * the tick that strikes it still aims with the stick.
   */
  attackHeld: boolean;
}

export function padMemory(): PadMemory {
  return { holding: null, order: [], carried: [], sent: null, attackHeld: false };
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
 * chord's carry), whichever slots they are. Several pressed in one frame count
 * in slot order: the lowest's press goes now (a tap on a hold, as a key's),
 * the rest follow one a frame (the others tap too), and the highest becomes
 * `holding`: its press casts unless its next move is a hold (the button
 * charges it). A button whose press cast lets go quietly (`sent`), unless its
 * hold charges: a quick tap never casts twice. Hold-to-repeat streams the
 * latest held repeat button, falling back to an earlier one still held.
 */
export function padFrameCast(
  registry: DataRegistry,
  world: ArpgWorld,
  acts: Pick<ArenaPadActions, 'cast' | 'held' | 'repeat'>,
  mem: PadMemory,
): PadFrame {
  const pressed = acts.cast;
  // A repeat button already held when the pad first sees it (pressed while a menu owned the pad)
  // counts as the earliest, for repeat only: `holding` still needs a press.
  const unseen = acts.repeat.filter((s) => !mem.order.includes(s) && !pressed.includes(s));
  mem.order = [
    ...unseen,
    ...mem.order.filter((s) => acts.held.includes(s) && !pressed.includes(s)),
    ...pressed,
  ];
  const latest = pressed.length > 0 ? pressed[pressed.length - 1] : null;
  const holding =
    latest ?? (mem.holding !== null && acts.held.includes(mem.holding) ? mem.holding : null);
  const up = mem.holding !== null && mem.holding !== holding ? mem.holding : null;
  // A button whose press cast lets go without casting, unless its hold charges.
  const released = up !== null && (mem.sent !== up || world.hero.hold?.slot === up) ? up : null;
  mem.holding = holding;
  // The presses waiting go first, then this frame's in slot order; a slot pressed again goes last.
  const queue = [...mem.carried.filter((s) => !pressed.includes(s)), ...pressed];
  const press = queue.length > 0 ? queue[0] : null;
  const castHeld = [...mem.order].reverse().find((s) => acts.repeat.includes(s)) ?? null;
  // A press whose button isn't `holding` can't cast on its release: it taps, as a key does.
  const cast = padCast(registry, world, { cast: press, castHeld }, released, press !== holding);
  if (press !== null)
    mem.sent = cast?.slot === press && !cast.repeat ? press : mem.sent === press ? null : mem.sent;
  // One press goes a frame: a chord's release casts first, and the presses follow.
  mem.carried =
    cast !== null && cast.slot === released && press !== released ? queue : queue.slice(1);
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
