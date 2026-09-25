import { useEffect } from 'react';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import type { PadState } from './gamepad';
import { startGamepad } from './gamepad-hub';
import { pickNext, type NavDir, type NavRect } from './spatial-nav';

/**
 * Controller navigation for every screen outside live combat: D-pad (or a
 * left-stick flick) moves focus to the nearest control in that direction, A
 * presses it, B presses the visible `[data-pad-back]`, LB/RB step through the
 * `[data-pad-tabs]` tabs and Menu presses `[data-pad-menu]`. The last visible
 * `[data-pad-scope]` (a sheet or overlay) keeps focus inside it. It also
 * records keyboard, mouse and touch use, for button hints and the focus ring.
 */

const FOCUSABLE =
  'button:not([disabled]), a[href], [role="tab"], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const REPEAT_DELAY_MS = 350;
const REPEAT_EVERY_MS = 150;

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function scope(): ParentNode {
  const scopes = [...document.querySelectorAll<HTMLElement>('[data-pad-scope]')].filter(visible);
  return scopes.at(-1) ?? document;
}

function candidates(): HTMLElement[] {
  return [...scope().querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
}

function rectOf(el: HTMLElement, i: number): NavRect {
  const r = el.getBoundingClientRect();
  return { id: String(i), x: r.left, y: r.top, w: r.width, h: r.height };
}

function focus(el: HTMLElement): void {
  el.focus();
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

export function moveFocus(dir: NavDir): void {
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
    const setDevice = useInputDeviceStore.getState().setDevice;
    const onKey = () => setDevice('keyboard');
    const onPointer = (e: PointerEvent) =>
      setDevice(e.pointerType === 'touch' ? 'touch' : 'keyboard');
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);

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
    });
    return () => {
      stop();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, []);
}
