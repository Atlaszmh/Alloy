import {
  dropHold,
  pressMove,
  type AbilityCast,
  type ArpgInput,
  type ArpgWorld,
  type DataRegistry,
  type Vec,
} from '@alloy/engine';
import { aimMarkerFor, classifyPress } from './aim';
import { useControlsStore } from '@/stores/controlsStore';
import type { KeyAction, MoveKey } from '@/features/controls/controls';
import {
  padFrameCast,
  padMemory,
  stickAimPoint,
  type ArenaPadActions,
  type PadMemory,
} from '@/features/gamepad/arena-pad';
import type { InputDevice } from '@/stores/inputDeviceStore';
import { isArenaLive } from '@/features/gamepad/gamepad-hub';
import { scopedLast } from '@/features/delve/kit/prompts';

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
  /** Last mouse position (client px), for hold-to-aim on the keyboard. */
  mouse: Vec | null;
  potion: boolean;
  dodge: boolean;
  /** Manual basic attacks: held now, pressed since the last frame, and the aim (client px, or null to auto-aim). */
  attackHeld: boolean;
  attackTap: boolean;
  attackAim: Vec | null;
  /** The input lock as of the last frame (`frameInput`): a switch to or from the pad lets go of the other side. */
  device: InputDevice;
  /** The labels key held (Alt): every drop's loot label shows. */
  labels: boolean;
  /** Any device has moved the hero (`frameInput`): the move hint goes. */
  moved: boolean;
}

export function createArenaInput(): ArenaInput {
  return {
    keys: { x: 0, y: 0 },
    pointer: { x: 0, y: 0 },
    cast: null,
    aiming: null,
    mouse: null,
    potion: false,
    dodge: false,
    attackHeld: false,
    attackTap: false,
    attackAim: null,
    device: 'keyboard',
    labels: false,
    moved: false,
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

/**
 * How `frameInput` reads the controls: manual attacks, the stick's aim reach,
 * screen px to world units, and the input lock (`inputDeviceStore`).
 */
export interface FrameOpts {
  manual: boolean;
  aimReach: number;
  toWorld: (screen: Vec) => Vec;
  device: InputDevice;
}

/** Whether the loot labels show: the keys' Alt under the keys or mouse, the pad's L3 under the pad. */
export function labelsHeld(
  device: InputDevice,
  input: ArenaInput,
  pad: ArenaPadActions | null,
): boolean {
  return device === 'gamepad' ? !!pad?.labels : input.labels;
}

/**
 * One step's input from the device with the input lock (`o.device`): the
 * controller (`pad`, null when there is none; `mem`, what it remembers from
 * the frame before) while it is 'gamepad', else the keys, mouse and HUD
 * (`input`); the other side counts for nothing. A switch between them lets go
 * of what the other side held (the keys' movement and aiming, the pad's
 * memory: its buttons still held count as already seen) and drops a charging
 * hold unpaid, so it never casts a move nobody asked for. The pad's press
 * (`padFrameCast`) is aimed by the right stick, which aims the attack only
 * while the pad drives it: the attack button held, or let go this frame or
 * with its held blow not yet struck (the tick that strikes it re-aims it, and
 * a frame may run none). Each press (a cast, a dodge, a potion,
 * an attack tap) goes once, then resets.
 */
export function frameInput(
  registry: DataRegistry,
  world: ArpgWorld,
  input: ArenaInput,
  pad: ArenaPadActions | null,
  mem: PadMemory,
  o: FrameOpts,
): ArpgInput {
  const padLive = o.device === 'gamepad';
  const switched = padLive !== (input.device === 'gamepad');
  input.device = o.device;
  if (switched && padLive)
    Object.assign(input, {
      keys: { x: 0, y: 0 },
      pointer: { x: 0, y: 0 },
      aiming: null,
      attackHeld: false,
      attackAim: null,
    });
  else if (switched) Object.assign(mem, padMemory());
  // Unmarked: the new device's own press of that slot charges anew.
  if (switched) dropHold(world, false);
  const out = padLive ? padInput(registry, world, pad, mem, o) : keysInput(input, o);
  if (out.move.x !== 0 || out.move.y !== 0) input.moved = true;
  input.cast = null;
  input.potion = false;
  input.dodge = false;
  input.attackTap = false;
  return out;
}

/** The keys', mouse's and HUD's part: a key or button held is `holding`. */
function keysInput(input: ArenaInput, o: FrameOpts): ArpgInput {
  const press = input.cast;
  return {
    move: moveVector(input),
    cast: press ? { slot: press.slot, aim: press.aim ? o.toWorld(press.aim) : null } : null,
    holding: holdingSlot(input),
    potion: input.potion,
    dodge: input.dodge,
    ...(o.manual
      ? {
          attack: input.attackHeld || input.attackTap,
          attackTap: input.attackTap,
          attackAim: input.attackAim ? o.toWorld(input.attackAim) : null,
        }
      : {}),
  };
}

/** The controller's part (none with no pad). */
function padInput(
  registry: DataRegistry,
  world: ArpgWorld,
  pad: ArenaPadActions | null,
  mem: PadMemory,
  o: FrameOpts,
): ArpgInput {
  const h = world.hero;
  if (!pad) {
    const none = { move: { x: 0, y: 0 }, cast: null, holding: null };
    return o.manual ? { ...none, attack: false, attackTap: false, attackAim: null } : none;
  }
  const frame = padFrameCast(registry, world, pad, mem);
  const comboWindow = registry.getDelveBalance().abilities.comboWindow;
  // A skill the weapon doesn't carry has no move: its button casts nothing.
  const ab = frame.cast && pressMove(h, frame.cast.slot, world.t, comboWindow);
  let cast: AbilityCast | null = null;
  if (frame.cast && ab) {
    const { slot, repeat } = frame.cast;
    const placed = aimMarkerFor(ab.form.id) === 'circle';
    const aim = pad.aimDir
      ? stickAimPoint(h, pad.aimDir, pad.aimTilt, ab.range, placed, o.aimReach)
      : null;
    cast = repeat ? { slot, aim, repeat } : { slot, aim };
  }
  const stick = pad.aimDir && (pad.attackHeld || mem.attackHeld) ? pad.aimDir : null;
  // Held on through a blow at its strike point, not through its leap (as the HUD's charge).
  mem.attackHeld =
    pad.attackHeld || (mem.attackHeld && h.swing?.held != null && h.swing.released === null);
  return {
    move: pad.move,
    cast,
    holding: frame.holding,
    potion: pad.potion,
    dodge: pad.dodge,
    ...(o.manual
      ? {
          attack: pad.attackHeld,
          attackTap: pad.attackTap,
          attackAim: stick ? stickAimPoint(h, stick, 1, h.stats.weapon.range, false) : null,
        }
      : {}),
  };
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

/**
 * The arena's Menu, from its key or the pad's button while the fight is live:
 * the topmost scope's `[data-pad-menu]` (the dive's menu button, Training's panel).
 */
export function pressMenu(): void {
  scopedLast('[data-pad-menu]')?.click();
}

/** The Journal, from its key or the pad's button: the topmost scope's `[data-pad-journal]`. */
export function pressJournal(): void {
  scopedLast('[data-pad-journal]')?.click();
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
 * mouse (and charges a hold move) and releasing casts there. The labels key
 * (Alt) is held: its default is prevented, and its keyup or a window blur
 * lets go (an Alt+Tab never sends the keyup). Returns a cleanup function.
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
    // The menu key works from a slider or a list, but only while the fight is live: paused,
    // the prompt runtime owns it (Esc presses the open menu's back), so no press acts twice.
    if (!e.repeat && keyAction(e.code) === 'menu') {
      if (e.defaultPrevented || !isArenaLive()) return;
      e.preventDefault();
      pressMenu();
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
    // Every game key but the menu's keeps its default (Alt held for the labels and E would
    // open the browser's menu), its repeats too.
    if (action && action !== 'menu') e.preventDefault();
    if (action === 'labels') {
      input.labels = true;
      return;
    }
    if (!action || e.repeat) return;
    const slot = ABILITY_SLOT[action];
    if (slot !== undefined) {
      // Another ability key is still held: use it now rather than drop it.
      if (input.aiming?.at === null) release();
      input.aiming = { slot, since: performance.now(), at: null };
    } else if (action === 'dodge') {
      input.dodge = true;
    } else if (action === 'potion') {
      input.potion = true;
    } else if (action === 'attack') {
      input.attackHeld = true;
      input.attackTap = true;
      input.attackAim = input.mouse;
    } else if (action === 'journal') {
      pressJournal();
    }
  };
  /** Cast the key-held ability: a tap auto-aims, a hold aims at the mouse. */
  const release = () => {
    const a = input.aiming;
    if (!a) return;
    input.aiming = null;
    const tap = classifyPress(performance.now() - a.since) === 'tap' || !input.mouse;
    input.cast = { slot: a.slot, aim: tap ? null : input.mouse };
  };
  const up = (e: KeyboardEvent) => {
    if (held.delete(e.code)) recompute();
    const action = keyAction(e.code);
    if (action === 'attack') input.attackHeld = false;
    if (action === 'labels') {
      input.labels = false;
      e.preventDefault();
    }
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
    input.labels = false;
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
