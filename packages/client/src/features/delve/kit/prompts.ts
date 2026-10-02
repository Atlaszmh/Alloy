import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { isArenaLive } from '@/features/gamepad/gamepad-hub';
import type { PadButton } from '@/features/gamepad/gamepad';
import type { NavDir } from '@/features/gamepad/spatial-nav';
import { useControlsStore } from '@/stores/controlsStore';
import { useUIStore } from '@/stores/uiStore';
import type { Binding, Prompt } from './types';

/**
 * The prompt runtime (Delve UI v1, decided item 19). A screen's prompts bind
 * their keys and pad buttons while it is mounted, for the topmost visible
 * `[data-pad-scope]` only. With no prompt taking a key, Esc (or the bound menu
 * key) presses the topmost scope's `[data-pad-back]`, else its
 * `[data-pad-menu]`, and Enter presses its `[data-pad-menu]` while no control
 * has focus. Everything here is inert while the arena is live: it owns Esc,
 * the menu key and the pad then. A handled key is `preventDefault`ed, and a
 * key already prevented is skipped, so no press acts twice.
 */

/** A pad tap that shares its button with a hold fires on a release under this. */
export const TAP_MAX_MS = 400;
/** A pad hold's default length (`Binding.padHold`). */
export const HOLD_MS = 600;

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** The topmost (last) visible `[data-pad-scope]`, or the document when none is open. */
export function topScope(): HTMLElement | Document {
  const scopes = [...document.querySelectorAll<HTMLElement>('[data-pad-scope]')].filter(visible);
  return scopes.at(-1) ?? document;
}

/** The last visible match for `selector` inside `topScope()`. */
export function scopedLast(selector: string): HTMLElement | null {
  return [...topScope().querySelectorAll<HTMLElement>(selector)].filter(visible).at(-1) ?? null;
}

// ── The registry ──────────────────────────────────────────────────────────

interface Entry {
  prompts: Prompt[];
  scopeRef?: RefObject<HTMLElement | null>;
}

const entries = new Set<Entry>();

/** The scope an entry binds in: its ref's nearest `[data-pad-scope]`, else the document; null while its ref is unmounted. */
function scopeOf(entry: Entry): HTMLElement | Document | null {
  if (!entry.scopeRef) return document;
  const el = entry.scopeRef.current;
  if (!el) return null;
  return el.closest<HTMLElement>('[data-pad-scope]') ?? document;
}

/** The enabled prompts of the topmost scope (none while the arena is live). */
function activePrompts(): Prompt[] {
  if (isArenaLive()) return [];
  const top = topScope();
  return [...entries]
    .filter((e) => scopeOf(e) === top)
    .flatMap((e) => e.prompts)
    .filter((p) => !p.disabled && (p.onPress || p.onHold));
}

// ── Keys ──────────────────────────────────────────────────────────────────

const MODIFIER = /^(Alt|Control|Shift|Meta)/;

function codes(b: Binding): string[] {
  if (b.key === undefined) return [];
  return Array.isArray(b.key) ? b.key : [b.key];
}

/** The key is one of the binding's, with exactly its Ctrl and Alt (a modifier key itself ignores them). */
function keyMatches(b: Binding, e: KeyboardEvent): boolean {
  if (!codes(b).includes(e.code)) return false;
  return MODIFIER.test(e.code) || (!!b.ctrl === e.ctrlKey && !!b.alt === e.altKey);
}

/** Text entry keeps every key. */
function typing(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLTextAreaElement ||
    (t instanceof HTMLInputElement && t.type !== 'range' && t.type !== 'checkbox')
  );
}

/** Keys held down for a `whileHeld` prompt, by code. */
const keysHeld = new Map<string, Prompt>();

const ENTER = new Set(['Enter', 'NumpadEnter']);

function onKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.repeat || isArenaLive() || typing(e.target)) return;
  const plain = !e.ctrlKey && !e.altKey;
  const focused = document.activeElement;
  // A focused control keeps Enter and Space: its own press never fights a prompt.
  const hasFocus = focused instanceof HTMLElement && focused !== document.body;
  if (hasFocus && plain && (ENTER.has(e.code) || e.code === 'Space')) return;
  const prompt = activePrompts().find((p) => keyMatches(p.binding, e));
  if (prompt) {
    e.preventDefault();
    if (prompt.binding.whileHeld) {
      keysHeld.set(e.code, prompt);
      prompt.onHold?.(true);
    } else if (prompt.onPress) prompt.onPress();
    else prompt.onHold?.(true);
    return;
  }
  const menuKey = useControlsStore.getState().config.keys.menu;
  let target: HTMLElement | null = null;
  if (e.code === 'Escape' || e.code === menuKey) {
    target = scopedLast('[data-pad-back]') ?? scopedLast('[data-pad-menu]');
  } else if (ENTER.has(e.code) && plain) {
    target = scopedLast('[data-pad-menu]');
  }
  if (!target) return;
  e.preventDefault();
  target.click();
}

function onKeyUp(e: KeyboardEvent): void {
  const prompt = keysHeld.get(e.code);
  if (!prompt) return;
  keysHeld.delete(e.code);
  prompt.onHold?.(false);
}

/** An Alt+Tab never delivers the keyup: let go of every held key. */
function onBlur(): void {
  const held = [...keysHeld.values()];
  keysHeld.clear();
  for (const p of held) p.onHold?.(false);
}

let listeners = 0;

/**
 * Listen for the prompts' keys and the Esc / Enter rules (one window listener,
 * shared). `usePrompts` holds it while mounted, and AppShell on every Delve
 * route. Returns a release function.
 */
export function attachPromptKeys(): () => void {
  if (listeners++ === 0) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--listeners > 0) return;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}

/**
 * Binds the prompts' keys and pad buttons while mounted, for the topmost
 * visible `[data-pad-scope]` containing `scopeRef` (the document when absent).
 * Ignores keys typed into inputs and events already `defaultPrevented`, and is
 * inert while `isArenaLive()`. On the keyboard a prompt fires `onPress` on key
 * down (else `onHold(true)`), and a `whileHeld` one `onHold(true)` on down and
 * `onHold(false)` on up or a window blur; a plain Enter or Space stays with a
 * focused control. The pad's timing is `padPrompts`', and A is never a
 * prompt's (it presses the focused control).
 */
export function usePrompts(prompts: Prompt[], scopeRef?: RefObject<HTMLElement | null>): void {
  const [entry] = useState<Entry>(() => ({ prompts, scopeRef }));
  useLayoutEffect(() => {
    entry.prompts = prompts;
    entry.scopeRef = scopeRef;
  });
  useEffect(() => {
    entries.add(entry);
    const release = attachPromptKeys();
    return () => {
      entries.delete(entry);
      release();
    };
  }, [entry]);
}

// ── The pad ───────────────────────────────────────────────────────────────

interface PadPress {
  at: number;
  /** The tap that shares its button with `hold`: it fires on a release under TAP_MAX_MS. */
  tap?: Prompt;
  hold?: Prompt;
  whileHeld?: Prompt;
  fired: boolean;
}

const padHeld = new Map<PadButton, PadPress>();

/**
 * The menu navigation's hand-off, once a frame (outside live combat): the
 * buttons pressed this frame (`pressed`), the buttons held (`held`) and the
 * time. Returns the presses a prompt took, which the navigation then leaves
 * alone. A tap alone fires on its press; a tap sharing its button with a hold
 * fires on a release under `TAP_MAX_MS`, the hold's `onHold(true)` at its
 * `padHold`, and a release between them fires neither; a `whileHeld` prompt
 * gets `onHold(true)` on the press and `onHold(false)` on the release.
 */
export function padPrompts(
  pressed: ReadonlySet<PadButton>,
  held: Readonly<Record<PadButton, boolean>>,
  now: number,
): Set<PadButton> {
  for (const [button, p] of padHeld) {
    if (!held[button]) {
      padHeld.delete(button);
      if (p.whileHeld) p.whileHeld.onHold?.(false);
      else if (p.tap && !p.fired && now - p.at < TAP_MAX_MS) fire(p.tap);
    } else if (p.hold && !p.fired && now - p.at >= (p.hold.binding.padHold || HOLD_MS)) {
      p.fired = true;
      p.hold.onHold?.(true);
    }
  }
  const took = new Set<PadButton>();
  if (pressed.size === 0) return took;
  const prompts = activePrompts();
  for (const button of pressed) {
    const mine = prompts.filter((p) => p.binding.pad === button);
    if (mine.length === 0) continue;
    took.add(button);
    const whileHeld = mine.find((p) => p.binding.whileHeld);
    const hold = mine.find((p) => p.binding.padHold !== undefined);
    const tap = mine.find((p) => p !== whileHeld && p !== hold);
    if (whileHeld) {
      padHeld.set(button, { at: now, whileHeld, fired: true });
      whileHeld.onHold?.(true);
    } else if (hold) padHeld.set(button, { at: now, hold, tap, fired: false });
    else if (tap) fire(tap);
  }
  return took;
}

function fire(p: Prompt): void {
  if (p.onPress) p.onPress();
  else p.onHold?.(true);
}

/** What a carried card hears from the pad (Skills' reorder). */
export type NavInput = NavDir | 'a' | 'b' | 'x';

let carrying: ((input: NavInput) => void) | null = null;

/** While carrying (Skills' pad reorder): the D-pad and A/B/X go to `handler` instead of the nav. Returns release. */
export function captureNav(handler: (input: NavInput) => void): () => void {
  carrying = handler;
  return () => {
    if (carrying === handler) carrying = null;
  };
}

/** The handler `captureNav` set, if any (read by the menu navigation each frame). */
export function navCapture(): ((input: NavInput) => void) | null {
  return carrying;
}

// ── Scale ─────────────────────────────────────────────────────────────────

/** `--ui-scale`: the 1920×1080 design's fit, rounded down to a quarter step, 0.75 to 2. */
export function uiScaleFor(width: number, height: number): number {
  const fit = Math.floor(Math.min(width / 1920, height / 1080) * 4) / 4;
  return Math.min(2, Math.max(0.75, fit));
}

/** `--hud-scale`: the UI scale times Settings → HUD scale, to the nearest quarter, at least 0.75. */
export function hudScaleFor(ui: number, setting: number): number {
  return Math.max(0.75, Math.round(ui * setting * 4) / 4);
}

/** The zooms `.delve-zoom` and `.delve-hud-zoom` apply (AppShell keeps `uiScale` current). */
export function useUiScale(): { ui: number; hud: number } {
  const ui = useUIStore((s) => s.uiScale);
  const setting = useUIStore((s) => s.hudScale);
  return { ui, hud: hudScaleFor(ui, setting) };
}
