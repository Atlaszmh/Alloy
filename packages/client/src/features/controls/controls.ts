import { PAD_BUTTONS, type PadButton } from '@/features/gamepad/gamepad';

/**
 * The player's control setup: which controller button and which key does
 * each action, plus how the pad feels. `DEFAULT_CONTROLS` is the shipped
 * setup; players tune theirs in the Controls editor.
 */

export const CONTROL_ACTIONS = [
  'primary',
  'defensive',
  'ultimate',
  'dodge',
  'attack',
  'potion',
  'menu',
] as const;
export type ControlAction = (typeof CONTROL_ACTIONS)[number];

export const MOVE_KEYS = ['up', 'down', 'left', 'right'] as const;
export type MoveKey = (typeof MOVE_KEYS)[number];
export type KeyAction = ControlAction | MoveKey;

export const REPEAT_ACTIONS = ['primary', 'defensive', 'ultimate'] as const;
export type RepeatAction = (typeof REPEAT_ACTIONS)[number];

export interface ControlsConfig {
  version: 1;
  pad: Record<ControlAction, PadButton | null>;
  /** KeyboardEvent.code per action. */
  keys: Record<KeyAction, string | null>;
  /** Controller only: holding the ability's button keeps casting it whenever it's ready. */
  repeat: Record<RepeatAction, boolean>;
  deadzone: { left: number; right: number };
  /** How far placed abilities land at full right-stick tilt, as a fraction of their range. */
  aimReach: number;
}

export const DEADZONE_LIMITS = { left: [0.05, 0.5], right: [0.1, 0.6] } as const;
export const AIM_REACH_LIMITS = [0.3, 1] as const;

export const DEFAULT_CONTROLS: ControlsConfig = {
  version: 1,
  pad: {
    primary: 'rt',
    defensive: 'lb',
    ultimate: 'rs',
    dodge: 'lt',
    attack: 'rb',
    potion: 'down',
    menu: 'menu',
  },
  keys: {
    primary: 'KeyQ',
    defensive: 'KeyE',
    ultimate: 'KeyR',
    dodge: 'Space',
    attack: null,
    potion: 'KeyF',
    menu: 'Escape',
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
  },
  repeat: { primary: true, defensive: false, ultimate: false },
  deadzone: { left: 0.2, right: 0.35 },
  aimReach: 1,
};

export const ACTION_LABELS: Record<KeyAction, string> = {
  primary: 'Primary',
  defensive: 'Defensive',
  ultimate: 'Ultimate',
  dodge: 'Dodge',
  attack: 'Basic attack (manual)',
  potion: 'Potion',
  menu: 'Dive menu',
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
};

/** Bind `button` to `action`; an action that had it takes this action's old button. */
export function bindPad(
  cfg: ControlsConfig,
  action: ControlAction,
  button: PadButton,
): ControlsConfig {
  const pad = { ...cfg.pad };
  const other = CONTROL_ACTIONS.find((a) => a !== action && pad[a] === button);
  if (other) pad[other] = pad[action];
  pad[action] = button;
  return { ...cfg, pad };
}

/** Bind `code` to `action`; an action that had it takes this action's old key. */
export function bindKey(cfg: ControlsConfig, action: KeyAction, code: string): ControlsConfig {
  const keys = { ...cfg.keys };
  const all: KeyAction[] = [...CONTROL_ACTIONS, ...MOVE_KEYS];
  const other = all.find((a) => a !== action && keys[a] === code);
  if (other) keys[other] = keys[action];
  keys[action] = code;
  return { ...cfg, keys };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const inRange = (v: unknown, [lo, hi]: readonly [number, number]): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** Read a saved or pasted setup: valid fields are kept, anything else falls back to the default. */
export function parseControls(raw: unknown): ControlsConfig {
  const d = DEFAULT_CONTROLS;
  const r = isObject(raw) ? raw : {};
  const pad = isObject(r.pad) ? r.pad : {};
  const keys = isObject(r.keys) ? r.keys : {};
  const repeat = isObject(r.repeat) ? r.repeat : {};
  const dz = isObject(r.deadzone) ? r.deadzone : {};
  const padButton = (v: unknown, fallback: PadButton | null) =>
    v === null || (typeof v === 'string' && (PAD_BUTTONS as readonly string[]).includes(v))
      ? (v as PadButton | null)
      : fallback;
  const keyCode = (v: unknown, fallback: string | null) =>
    v === null || (typeof v === 'string' && v.length > 0 && v.length < 32)
      ? (v as string | null)
      : fallback;
  return {
    version: 1,
    pad: Object.fromEntries(
      CONTROL_ACTIONS.map((a) => [a, padButton(pad[a], d.pad[a])]),
    ) as ControlsConfig['pad'],
    keys: Object.fromEntries(
      [...CONTROL_ACTIONS, ...MOVE_KEYS].map((a) => [a, keyCode(keys[a], d.keys[a])]),
    ) as ControlsConfig['keys'],
    repeat: Object.fromEntries(
      REPEAT_ACTIONS.map((a) => [a, typeof repeat[a] === 'boolean' ? repeat[a] : d.repeat[a]]),
    ) as ControlsConfig['repeat'],
    deadzone: {
      left: inRange(dz.left, DEADZONE_LIMITS.left) ? dz.left : d.deadzone.left,
      right: inRange(dz.right, DEADZONE_LIMITS.right) ? dz.right : d.deadzone.right,
    },
    aimReach: inRange(r.aimReach, AIM_REACH_LIMITS) ? r.aimReach : d.aimReach,
  };
}

/** The setup as JSON: what "Copy setup" gives the player to send over. */
export function exportControls(cfg: ControlsConfig): string {
  return JSON.stringify(cfg, null, 2);
}

const PAD_LABELS: Record<PadButton, string> = {
  a: 'A',
  b: 'B',
  x: 'X',
  y: 'Y',
  lb: 'LB',
  rb: 'RB',
  lt: 'LT',
  rt: 'RT',
  view: 'View',
  menu: 'Menu',
  ls: 'L3',
  rs: 'R3',
  up: 'D-pad ▲',
  down: 'D-pad ▼',
  left: 'D-pad ◀',
  right: 'D-pad ▶',
};

export function padLabel(button: PadButton | null): string {
  return button ? PAD_LABELS[button] : '—';
}

/** A short label for small on-screen hints (the D-pad as an arrow). */
export function padHint(button: PadButton | null): string {
  if (button === 'up' || button === 'down' || button === 'left' || button === 'right') {
    return PAD_LABELS[button].slice(-1);
  }
  return padLabel(button);
}

const KEY_NAMES: Record<string, string> = {
  Space: 'Space',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ShiftLeft: 'L Shift',
  ShiftRight: 'R Shift',
  ControlLeft: 'L Ctrl',
  ControlRight: 'R Ctrl',
  AltLeft: 'L Alt',
  AltRight: 'R Alt',
  Tab: 'Tab',
  Enter: 'Enter',
  Backquote: '`',
};

export function keyLabel(code: string | null): string {
  if (!code) return '—';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return code;
}
