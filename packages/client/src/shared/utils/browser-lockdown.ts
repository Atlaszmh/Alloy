/**
 * Keeps the browser's own shortcuts and mouse gestures out of the game: the
 * context menu, middle-click autoscroll, the mouse's back and forward buttons,
 * Ctrl+wheel and Ctrl +/-/0 zoom, the Alt menu, the F-keys and the Ctrl
 * shortcuts the game never binds. Text entry keeps every key and its menu.
 * Ctrl+W/T/N and Alt+F4 can't be caught by a page; F5, F11 and F12 are left alone.
 */

import { useControlsStore } from '@/stores/controlsStore';

/** Ctrl (or Cmd) + these codes do browser things; the game binds none of them. */
const CTRL_BLOCKED = new Set([
  'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'KeyO', 'KeyP', 'KeyS', 'KeyU',
  'Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0',
]);
const F_BLOCKED = new Set(['F1', 'F3', 'F6', 'F7', 'F10']);
const ALT = new Set(['AltLeft', 'AltRight']);

function typing(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLTextAreaElement ||
    (t instanceof HTMLInputElement && t.type !== 'range' && t.type !== 'checkbox') ||
    (t instanceof HTMLElement && t.isContentEditable)
  );
}

/** `bound`: the player's key codes, which stay theirs (the menu key's handler skips a prevented press). */
export function blockedKey(e: KeyboardEvent, bound: readonly (string | null)[] = []): boolean {
  if (typing(e.target)) return false;
  if (F_BLOCKED.has(e.code) || ALT.has(e.code)) return !bound.includes(e.code);
  // Ctrl+Shift+I/J/C (devtools) stay; Ctrl+Shift+S etc. are blocked with the rest.
  return (e.ctrlKey || e.metaKey) && CTRL_BLOCKED.has(e.code);
}

export function installBrowserLockdown(): () => void {
  const key = (e: KeyboardEvent) => {
    if (blockedKey(e, Object.values(useControlsStore.getState().config.keys))) e.preventDefault();
  };
  const menu = (e: MouseEvent) => {
    if (!typing(e.target)) e.preventDefault();
  };
  // 1 middle (autoscroll), 3 back, 4 forward.
  const button = (e: MouseEvent) => {
    if (e.button === 1 || e.button === 3 || e.button === 4) e.preventDefault();
  };
  const wheel = (e: WheelEvent) => {
    if (e.ctrlKey) e.preventDefault();
  };
  const drag = (e: DragEvent) => e.preventDefault();
  window.addEventListener('keydown', key);
  window.addEventListener('keyup', key);
  window.addEventListener('contextmenu', menu);
  window.addEventListener('mousedown', button);
  window.addEventListener('mouseup', button);
  window.addEventListener('auxclick', button);
  window.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('dragstart', drag);
  return () => {
    window.removeEventListener('keydown', key);
    window.removeEventListener('keyup', key);
    window.removeEventListener('contextmenu', menu);
    window.removeEventListener('mousedown', button);
    window.removeEventListener('mouseup', button);
    window.removeEventListener('auxclick', button);
    window.removeEventListener('wheel', wheel);
    window.removeEventListener('dragstart', drag);
  };
}
