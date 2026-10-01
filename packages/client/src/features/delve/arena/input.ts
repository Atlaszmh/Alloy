import {
  pressMove,
  type AbilityCast,
  type ArpgInput,
  type ArpgWorld,
  type DataRegistry,
  type Vec,
} from '@alloy/engine';
import { aimMarkerFor, classifyPress } from './aim-gestures';
import { useControlsStore } from '@/stores/controlsStore';
import type { KeyAction, MoveKey } from '@/features/controls/controls';
import {
  padFrameCast,
  stickAimPoint,
  type ArenaPadActions,
  type PadMemory,
} from '@/features/gamepad/arena-pad';

/** An ability press. `aim` is a screen point (client px), or null to auto-aim. */
export interface CastPress {
  slot: number;
  aim: Vec | null;
}

/** A press being held to aim: the marker follows `at` (client px), or the mouse when null. */
export interface Aiming {
  slot: number;
  since: number;
  at: Vec | null;
  /** A HUD button's press still over its button: no marker (let go there, it casts auto-aimed). */
  onButton?: boolean;
}

/** Live controller state shared between the controls and the game loop. */
export interface ArenaInput {
  /** Keyboard direction (WASD / arrows). */
  keys: Vec;
  /** Touch joystick or mouse-drag direction. */
  pointer: Vec;
  cast: CastPress | null;
  /** The key or button held (it aims; a hold move charges while it is). */
  aiming: Aiming | null;
  /** Drop a charging hold unpaid on the next step (an aim released back on its button). */
  cancelHold: boolean;
  /** Last mouse position (client px), for hold-to-aim on the keyboard. */
  mouse: Vec | null;
  potion: boolean;
  dodge: boolean;
  /** Manual basic attacks: held now, pressed since the last frame, and the aim (client px, or null to auto-aim). */
  attackHeld: boolean;
  attackTap: boolean;
  attackAim: Vec | null;
}

export function createArenaInput(): ArenaInput {
  return {
    keys: { x: 0, y: 0 },
    pointer: { x: 0, y: 0 },
    cast: null,
    aiming: null,
    cancelHold: false,
    mouse: null,
    potion: false,
    dodge: false,
    attackHeld: false,
    attackTap: false,
    attackAim: null,
  };
}

/** Combined move vector: keyboard wins when pressed. */
export function moveVector(input: ArenaInput): Vec {
  return input.keys.x !== 0 || input.keys.y !== 0 ? input.keys : input.pointer;
}

/** The ability slot whose key or button is held: a hold move charges while it is, and its release casts. */
export function holdingSlot(input: ArenaInput): number | null {
  return input.aiming?.slot ?? null;
}

/** How `frameInput` reads the controls: manual attacks, the stick's aim reach, screen px to world units. */
export interface FrameOpts {
  manual: boolean;
  aimReach: number;
  toWorld: (screen: Vec) => Vec;
}

/**
 * One step's input from the keys, mouse and HUD (`input`) and the controller
 * (`pad`, null when there is none; `mem`, what it remembers from the frame
 * before). The pad's press (`padFrameCast`, aimed by the right stick) wins over
 * a key's or a button's, which then waits for the next frame; a key's or a
 * button's wins over hold-to-repeat's (marked), which goes again later; a key
 * or button held wins `holding` over the pad's (`padFrameCast`); the
 * stick aims the attack only while the pad drives it: the attack button held,
 * or let go this frame or with its held blow not yet struck (the tick that
 * strikes it re-aims it, and a frame may run none). Each press (a cast,
 * `cancelHold`, a dodge, a potion, an attack tap) goes once, then resets.
 */
export function frameInput(
  registry: DataRegistry,
  world: ArpgWorld,
  input: ArenaInput,
  pad: ArenaPadActions | null,
  mem: PadMemory,
  o: FrameOpts,
): ArpgInput {
  const h = world.hero;
  const press = input.cast;
  let cast: AbilityCast | null = press
    ? { slot: press.slot, aim: press.aim ? o.toWorld(press.aim) : null }
    : null;
  const frame = pad ? padFrameCast(registry, world, pad, mem) : null;
  // A repeat gives way to a key's or a button's press (it repeats again later).
  const padCast = frame?.cast && !(frame.cast.repeat && press) ? frame.cast : null;
  const comboWindow = registry.getDelveBalance().abilities.comboWindow;
  // A skill the weapon doesn't carry has no move: its button casts nothing.
  const ab = padCast && pressMove(h, padCast.slot, world.t, comboWindow);
  const padTook = !!(pad && padCast && ab);
  if (pad && padCast && ab) {
    const { slot, repeat } = padCast;
    const placed = aimMarkerFor(ab.form.id) === 'circle';
    const aim = pad.aimDir
      ? stickAimPoint(h, pad.aimDir, pad.aimTilt, ab.range, placed, o.aimReach)
      : null;
    cast = repeat ? { slot, aim, repeat } : { slot, aim };
  }
  const stick = pad?.aimDir && (pad.attackHeld || mem.attackHeld) ? pad.aimDir : null;
  // Held on through a blow at its strike point, not through its leap (as the HUD's charge).
  mem.attackHeld =
    !!pad?.attackHeld || (mem.attackHeld && h.swing?.held != null && h.swing.released === null);
  const out: ArpgInput = {
    move: pad && (pad.move.x !== 0 || pad.move.y !== 0) ? pad.move : moveVector(input),
    cast,
    holding: holdingSlot(input) ?? frame?.holding ?? null,
    cancelHold: input.cancelHold,
    potion: input.potion || !!pad?.potion,
    dodge: input.dodge || !!pad?.dodge,
    ...(o.manual
      ? {
          attack: input.attackHeld || input.attackTap || !!pad?.attackHeld,
          attackTap: input.attackTap || !!pad?.attackTap,
          attackAim: stick
            ? stickAimPoint(h, stick, 1, h.stats.weapon.range, false)
            : input.attackAim
              ? o.toWorld(input.attackAim)
              : null,
        }
      : {}),
  };
  // A key's or HUD button's press made while the pad's took the frame goes next frame.
  input.cast = padTook ? press : null;
  input.cancelHold = false;
  input.potion = false;
  input.dodge = false;
  input.attackTap = false;
  return out;
}

/** The arrow keys always move, whatever else is bound. */
const ARROWS: Record<string, Vec> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

const MOVE_DIRS: Record<MoveKey, Vec> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const ABILITY_SLOT: Partial<Record<KeyAction, number>> = { primary: 0, defensive: 1, ultimate: 2 };

/** Which action a key is bound to in the player's setup, if any. */
function keyAction(code: string): KeyAction | null {
  const keys = useControlsStore.getState().config.keys;
  return (Object.keys(keys) as KeyAction[]).find((a) => keys[a] === code) ?? null;
}

function moveDir(code: string): Vec | null {
  if (ARROWS[code]) return ARROWS[code];
  const action = keyAction(code);
  return action && action in MOVE_DIRS ? MOVE_DIRS[action as MoveKey] : null;
}

/** Text entry keeps every key, the menu key included. */
function isText(t: EventTarget | null): boolean {
  return t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type !== 'range');
}

/**
 * Sliders and lists keep their keys (arrows, letters, Space) from moving or
 * attacking, while they hold focus: one that let go during this key (the
 * Training panel's lists do) passes it on.
 */
function isField(t: EventTarget | null): boolean {
  return (
    (t instanceof HTMLInputElement ||
      t instanceof HTMLSelectElement ||
      t instanceof HTMLTextAreaElement) &&
    t === document.activeElement
  );
}

/**
 * Wire keyboard controls to `input`, following the player's key bindings.
 * Ability keys: a quick tap auto-aims; holding shows the aim marker at the
 * mouse (and charges a hold move) and releasing casts there. Returns a
 * cleanup function.
 */
export function attachKeyboard(input: ArenaInput, isEnabled: () => boolean): () => void {
  const held = new Set<string>();
  const recompute = () => {
    let x = 0;
    let y = 0;
    for (const code of held) {
      const d = moveDir(code);
      if (d) {
        x += d.x;
        y += d.y;
      }
    }
    const len = Math.hypot(x, y);
    input.keys = len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  };
  const down = (e: KeyboardEvent) => {
    if (isText(e.target)) return;
    // The menu key works while paused too (so it can close the menu), and from a slider or a list.
    if (!e.repeat && keyAction(e.code) === 'menu') {
      (document.querySelector('[data-pad-menu]') as HTMLElement | null)?.click();
      return;
    }
    if (isField(e.target) || !isEnabled()) return;
    if (moveDir(e.code)) {
      held.add(e.code);
      recompute();
      e.preventDefault();
      return;
    }
    const action = keyAction(e.code);
    if (!action || e.repeat) return;
    const slot = ABILITY_SLOT[action];
    if (slot !== undefined) {
      // Another ability key is still held: use it now rather than drop it.
      if (input.aiming?.at === null) release();
      input.aiming = { slot, since: performance.now(), at: null };
    } else if (action === 'dodge') {
      input.dodge = true;
      e.preventDefault();
    } else if (action === 'potion') {
      input.potion = true;
      e.preventDefault();
    } else if (action === 'attack') {
      input.attackHeld = true;
      input.attackTap = true;
      input.attackAim = input.mouse;
    }
  };
  /** Cast the key-held ability: a tap auto-aims, a hold aims at the mouse. */
  const release = () => {
    const a = input.aiming;
    if (!a) return;
    input.aiming = null;
    const tap = classifyPress(performance.now() - a.since, 0) === 'tap' || !input.mouse;
    input.cast = { slot: a.slot, aim: tap ? null : input.mouse };
  };
  const up = (e: KeyboardEvent) => {
    if (held.delete(e.code)) recompute();
    const action = keyAction(e.code);
    if (action === 'attack') input.attackHeld = false;
    const a = input.aiming;
    if (a && a.at === null && action && ABILITY_SLOT[action] === a.slot) release();
  };
  const move = (e: MouseEvent) => {
    input.mouse = { x: e.clientX, y: e.clientY };
    if (input.attackHeld) input.attackAim = input.mouse;
  };
  const blur = () => {
    held.clear();
    recompute();
    input.aiming = null;
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('mousemove', move);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('mousemove', move);
    window.removeEventListener('blur', blur);
  };
}
