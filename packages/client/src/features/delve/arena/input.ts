import type { Vec } from '@alloy/engine';

/** Live controller state shared between the controls and the game loop. */
export interface ArenaInput {
  /** Keyboard direction (WASD / arrows). */
  keys: Vec;
  /** Touch joystick or mouse-drag direction. */
  pointer: Vec;
  cast: number | null;
  potion: boolean;
}

export function createArenaInput(): ArenaInput {
  return { keys: { x: 0, y: 0 }, pointer: { x: 0, y: 0 }, cast: null, potion: false };
}

/** Combined move vector: keyboard wins when pressed. */
export function moveVector(input: ArenaInput): Vec {
  return input.keys.x !== 0 || input.keys.y !== 0 ? input.keys : input.pointer;
}

const DIRS: Record<string, Vec> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

const CAST_KEYS: Record<string, number> = {
  KeyQ: 0,
  Digit1: 0,
  KeyE: 1,
  Digit2: 1,
  KeyR: 2,
  Digit3: 2,
};

/** Wire keyboard controls to `input`. Returns a cleanup function. */
export function attachKeyboard(input: ArenaInput, isEnabled: () => boolean): () => void {
  const held = new Set<string>();
  const recompute = () => {
    let x = 0;
    let y = 0;
    for (const code of held) {
      const d = DIRS[code];
      if (d) {
        x += d.x;
        y += d.y;
      }
    }
    const len = Math.hypot(x, y);
    input.keys = len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  };
  const down = (e: KeyboardEvent) => {
    if (!isEnabled() || e.target instanceof HTMLInputElement) return;
    if (DIRS[e.code]) {
      held.add(e.code);
      recompute();
      e.preventDefault();
    } else if (e.code in CAST_KEYS && !e.repeat) {
      input.cast = CAST_KEYS[e.code];
    } else if ((e.code === 'KeyF' || e.code === 'Space') && !e.repeat) {
      input.potion = true;
      e.preventDefault();
    }
  };
  const up = (e: KeyboardEvent) => {
    if (held.delete(e.code)) recompute();
  };
  const blur = () => {
    held.clear();
    recompute();
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}
