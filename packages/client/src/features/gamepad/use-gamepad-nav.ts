import { useEffect } from 'react';
import { useInputDeviceStore, type InputDevice } from '@/stores/inputDeviceStore';
import { navCapture, padPrompts, scopedLast, topScope } from '@/features/delve/kit/prompts';
import type { PadButton, PadState } from './gamepad';
import { startGamepad } from './gamepad-hub';
import { pickNext, type NavDir, type NavRect } from './spatial-nav';

/**
 * Controller navigation for every screen outside live combat: D-pad (or a
 * left-stick flick) moves focus to the nearest control in that direction
 * (left/right adjust a focused slider or list), A presses it. Every other
 * button goes to the screen's prompts first (`padPrompts`, which also times
 * the holds); one no prompt takes does its default: B presses the topmost
 * scope's `[data-pad-back]`, Menu its `[data-pad-menu]` (else its back),
 * LB/RB step its top-level `[data-pad-tabs]` and LT/RT its
 * `[data-pad-tabs="sub"]`, past disabled tabs. The last visible
 * `[data-pad-scope]` (a sheet or overlay) keeps focus inside it, and while the
 * pad has the input lock the focus never gets lost (`keepFocus`, which starts
 * a scope on its `[data-pad-first]`). `[data-pad-skip]` controls are never
 * D-pad targets. While a card is carried (`captureNav`) the D-pad and A/B/X go
 * to it. It also lets the keys, the mouse and touch claim the lock
 * (`claimDevices`).
 */

/** What the pad's focus can land on. */
export const FOCUSABLE =
  'button:not(:disabled), a[href], [role="tab"], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
const REPEAT_DELAY_MS = 350;
const REPEAT_EVERY_MS = 150;
const DPAD = new Set<PadButton>(['up', 'down', 'left', 'right']);

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

/** The scroll containers around `el` (an ancestor under the body whose overflow is auto or scroll), nearest first. */
function scrollers(el: Element): Element[] {
  const out: Element[] = [];
  const page: Element[] = [document.body, document.documentElement];
  for (let p = el.parentElement; p && !page.includes(p); p = p.parentElement) {
    const s = getComputedStyle(p);
    if (/auto|scroll/.test(s.overflowX + s.overflowY)) out.push(p);
  }
  return out;
}

/** None of `el`'s box shows inside one of the scroll containers `around` it: it is scrolled out of view. */
function clipped(el: Element, around: Element[]): boolean {
  const b = el.getBoundingClientRect();
  return around.some((p) => {
    const c = p.getBoundingClientRect();
    return b.right <= c.left || b.left >= c.right || b.bottom <= c.top || b.top >= c.bottom;
  });
}

/**
 * The D-pad's candidates in the topmost scope, as seen from `active`: every visible focusable
 * control outside `[data-pad-skip]`, but one scrolled out of its list, which counts only from
 * inside that list (the D-pad walks a list row by row and scrolls it; from outside, its
 * hidden rows don't exist).
 */
export function candidates(active: Element | null = document.activeElement): HTMLElement[] {
  const home = active ? (scrollers(active)[0] ?? null) : null;
  return [...topScope().querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (!visible(el) || el.closest('[data-pad-skip]')) return false;
    const around = scrollers(el);
    return !clipped(el, around) || (home !== null && around[0] === home);
  });
}

/** True when the D-pad could land on `el` now. */
export function isCandidate(el: HTMLElement): boolean {
  return candidates().includes(el);
}

/** The focus last seen in each scope, and where it was (it may have gone since). */
const lastFocus = new WeakMap<HTMLElement | Document, { el: HTMLElement; at: DOMRect }>();

/**
 * Run each frame: while the pad has the input lock, a focus that isn't on a
 * visible control in the current scope (it unmounted, or a scope opened) goes
 * back to the scope's last focused control, else the one nearest where it
 * was, else its `[data-pad-first]`, else the first. Under the keys or the
 * mouse the focus is left alone.
 * It never scrolls: a sheet still sliding in would drag the page under it.
 */
export function keepFocus(): void {
  const s = topScope();
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
  const focus = (el: HTMLElement) => el.focus({ preventScroll: true });
  const last = lastFocus.get(s);
  if (!last) return focus(els.find((el) => el.hasAttribute('data-pad-first')) ?? els[0]);
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

const TAB_LISTS = {
  top: '[data-pad-tabs]:not([data-pad-tabs="sub"])',
  sub: '[data-pad-tabs="sub"]',
} as const;

/** Step the topmost scope's tab list (LB/RB its top level, LT/RT its sub list), past disabled tabs. */
function stepTabs(level: keyof typeof TAB_LISTS, delta: number): void {
  const list = scopedLast(TAB_LISTS[level]);
  if (!list) return;
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
  const enabled = (t: HTMLElement) => !t.matches(':disabled, [aria-disabled="true"]');
  if (!tabs.some(enabled)) return;
  let i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
  do i = (i + delta + tabs.length) % tabs.length;
  while (!enabled(tabs[i]));
  tabs[i].click();
  focus(tabs[i]);
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
      // A carried card (Skills' reorder) hears the D-pad and A/B/X instead of the focus.
      const carry = navCapture();
      const move = (dir: NavDir) => (carry ? carry(dir) : moveFocus(dir));
      // A stick flick moves once; it re-arms when the stick comes back near the centre.
      const flick = stickDir(state);
      if (flick && stickArmed) {
        move(flick);
        stickArmed = false;
      }
      if (Math.hypot(state.left.x, state.left.y) < 0.3) stickArmed = true;

      const dir = dpadDir(state);
      if (dir && dir !== heldDir) {
        heldDir = dir;
        repeatAt = now + REPEAT_DELAY_MS;
        move(dir);
      } else if (dir && now >= repeatAt) {
        repeatAt = now + REPEAT_EVERY_MS;
        move(dir);
      } else if (!dir) heldDir = null;

      const carried = carry ? (['a', 'b', 'x'] as const).filter((b) => pressed.has(b)) : [];
      for (const b of carried) carry?.(b);
      // The D-pad moves and A presses the focused control: never a prompt's.
      const offered = [...pressed].filter(
        (b) => !DPAD.has(b) && b !== 'a' && !(carried as readonly PadButton[]).includes(b),
      );
      const took = padPrompts(new Set(offered), state.buttons, now);
      const left = (b: PadButton) => offered.includes(b) && !took.has(b);

      if (!carry && pressed.has('a')) {
        const el = document.activeElement as HTMLElement | null;
        if (el && candidates().includes(el)) el.click();
        else moveFocus('down');
      }
      if (left('b')) scopedLast('[data-pad-back]')?.click();
      if (left('lb')) stepTabs('top', -1);
      if (left('rb')) stepTabs('top', 1);
      if (left('lt')) stepTabs('sub', -1);
      if (left('rt')) stepTabs('sub', 1);
      if (left('menu')) (scopedLast('[data-pad-menu]') ?? scopedLast('[data-pad-back]'))?.click();
      keepFocus();
    });
    return () => {
      stop();
      unclaim();
    };
  }, []);
}
