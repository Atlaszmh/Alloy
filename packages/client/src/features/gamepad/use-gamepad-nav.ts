import { useEffect } from 'react';
import { useInputDeviceStore, type InputDevice } from '@/stores/inputDeviceStore';
import type { PadState } from './gamepad';
import { startGamepad } from './gamepad-hub';
import { pickNext, type NavDir, type NavRect } from './spatial-nav';

/**
 * Controller navigation for every screen outside live combat: D-pad (or a
 * left-stick flick) moves focus to the nearest control in that direction
 * (left/right adjust a focused slider or list), A presses it, B presses the
 * visible `[data-pad-back]`, LB/RB step through the `[data-pad-tabs]` tabs
 * and Menu presses `[data-pad-menu]`. The last visible
 * `[data-pad-scope]` (a sheet or overlay) keeps focus inside it, and while the
 * pad has the input lock the focus never gets lost (`keepFocus`). It also lets
 * the keys, the mouse and touch claim the lock (`claimDevices`).
 */

const FOCUSABLE =
  'button:not(:disabled), a[href], [role="tab"], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
const REPEAT_DELAY_MS = 350;
const REPEAT_EVERY_MS = 150;

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** How far (px) the mouse must travel to claim the input lock: a bump on the desk doesn't. */
export const MOUSE_CLAIM_PX = 16;

/**
 * The keys, the mouse and touch claim the input lock (`inputDeviceStore`, the
 * pad's own claim is in gamepad-hub): a key press, a click, the wheel or the
 * mouse travelling past `MOUSE_CLAIM_PX` claims 'keyboard', a touch 'touch'.
 * The claiming event still acts. Returns a cleanup function.
 */
export function claimDevices(): () => void {
  const setDevice = (d: InputDevice) => useInputDeviceStore.getState().setDevice(d);
  /** Where the mouse lay when another device had the lock, or null before it moves. */
  let from: { x: number; y: number } | null = null;
  const onKey = () => setDevice('keyboard');
  const onWheel = () => setDevice('keyboard');
  const onDown = (e: PointerEvent) => setDevice(e.pointerType === 'touch' ? 'touch' : 'keyboard');
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const at = { x: e.clientX, y: e.clientY };
    if (useInputDeviceStore.getState().device === 'keyboard' || !from) from = at;
    else if (Math.hypot(at.x - from.x, at.y - from.y) > MOUSE_CLAIM_PX) setDevice('keyboard');
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('wheel', onWheel, { capture: true, passive: true });
  window.addEventListener('pointermove', onMove, { capture: true, passive: true });
  return () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('wheel', onWheel, true);
    window.removeEventListener('pointermove', onMove, true);
  };
}

function scope(): HTMLElement | Document {
  const scopes = [...document.querySelectorAll<HTMLElement>('[data-pad-scope]')].filter(visible);
  return scopes.at(-1) ?? document;
}

function candidates(): HTMLElement[] {
  return [...scope().querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
}

/** The focus last seen in each scope, and where it was (it may have gone since). */
const lastFocus = new WeakMap<HTMLElement | Document, { el: HTMLElement; at: DOMRect }>();

/**
 * Run each frame: while the pad has the input lock, a focus that isn't on a
 * visible control in the current scope (it unmounted, or a scope opened) goes
 * back to the scope's last focused control, else the one nearest where it
 * was, else the first. Under the keys or the mouse the focus is left alone.
 */
export function keepFocus(): void {
  const s = scope();
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    s.contains(active) &&
    active.matches(FOCUSABLE) &&
    visible(active)
  ) {
    lastFocus.set(s, { el: active, at: active.getBoundingClientRect() });
    return;
  }
  if (useInputDeviceStore.getState().device !== 'gamepad') return;
  const els = candidates();
  if (els.length === 0) return;
  const last = lastFocus.get(s);
  if (!last) return focus(els[0]);
  if (els.includes(last.el)) return focus(last.el);
  const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const was = centre(last.at);
  const dist = (el: HTMLElement) => {
    const c = centre(el.getBoundingClientRect());
    return Math.hypot(c.x - was.x, c.y - was.y);
  };
  focus(els.reduce((best, el) => (dist(el) < dist(best) ? el : best)));
}

function rectOf(el: HTMLElement, i: number): NavRect {
  const r = el.getBoundingClientRect();
  return { id: String(i), x: r.left, y: r.top, w: r.width, h: r.height };
}

function focus(el: HTMLElement): void {
  el.focus();
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/** Left/right on a focused slider nudges its value (React hears it as an input event). */
function nudgeRange(el: HTMLInputElement, dir: NavDir): void {
  const step = Number(el.step) || 1;
  const next = Math.min(
    Number(el.max),
    Math.max(Number(el.min), Number(el.value) + (dir === 'right' ? step : -step)),
  );
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, String(next));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Left/right on a focused list steps to the next enabled choice, clamped (React hears the change event). */
function stepSelect(el: HTMLSelectElement, dir: NavDir): void {
  const step = dir === 'right' ? 1 : -1;
  let next = el.selectedIndex + step;
  while (el.options[next]?.disabled) next += step;
  if (!el.options[next]) return;
  el.selectedIndex = next;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function moveFocus(dir: NavDir): void {
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement &&
    active.type === 'range' &&
    (dir === 'left' || dir === 'right')
  ) {
    return nudgeRange(active, dir);
  }
  if (active instanceof HTMLSelectElement && (dir === 'left' || dir === 'right')) {
    return stepSelect(active, dir);
  }
  const els = candidates();
  if (els.length === 0) return;
  const idx = els.indexOf(document.activeElement as HTMLElement);
  if (idx < 0) return focus(els[0]);
  const rects = els.map(rectOf);
  const next = pickNext(rects[idx], rects, dir);
  if (next) focus(els[Number(next.id)]);
}

function press(selector: string): void {
  const el = [...document.querySelectorAll<HTMLElement>(selector)].filter(visible).at(-1);
  el?.click();
}

function stepTabs(delta: number): void {
  const list = [...document.querySelectorAll<HTMLElement>('[data-pad-tabs]')].filter(visible)[0];
  if (!list) return;
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
  if (tabs.length === 0) return;
  const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
  const next = tabs[(i + delta + tabs.length) % tabs.length];
  next.click();
  focus(next);
}

function stickDir(state: PadState): NavDir | null {
  const { x, y } = state.left;
  if (Math.hypot(x, y) <= 0.6) return null;
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
}

function dpadDir(state: PadState): NavDir | null {
  const b = state.buttons;
  return b.up ? 'up' : b.down ? 'down' : b.left ? 'left' : b.right ? 'right' : null;
}

export function useGamepadNav(): void {
  useEffect(() => {
    const unclaim = claimDevices();

    let heldDir: NavDir | null = null;
    let repeatAt = 0;
    let stickArmed = true;
    const stop = startGamepad((state, pressed, now) => {
      // A stick flick moves once; it re-arms when the stick comes back near the centre.
      const flick = stickDir(state);
      if (flick && stickArmed) {
        moveFocus(flick);
        stickArmed = false;
      }
      if (Math.hypot(state.left.x, state.left.y) < 0.3) stickArmed = true;

      const dir = dpadDir(state);
      if (dir && dir !== heldDir) {
        heldDir = dir;
        repeatAt = now + REPEAT_DELAY_MS;
        moveFocus(dir);
      } else if (dir && now >= repeatAt) {
        repeatAt = now + REPEAT_EVERY_MS;
        moveFocus(dir);
      } else if (!dir) heldDir = null;

      if (pressed.has('a')) {
        const el = document.activeElement as HTMLElement | null;
        if (el && candidates().includes(el)) el.click();
        else moveFocus('down');
      }
      if (pressed.has('b')) press('[data-pad-back]');
      if (pressed.has('lb')) stepTabs(-1);
      if (pressed.has('rb')) stepTabs(1);
      if (pressed.has('menu')) press('[data-pad-menu]');
      keepFocus();
    });
    return () => {
      stop();
      unclaim();
    };
  }, []);
}
