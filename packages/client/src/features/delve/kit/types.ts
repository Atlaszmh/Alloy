// The forge kit's shared types (Delve UI v1, step 1·0), verbatim from the spec's kit contract.
import type { ButtonHTMLAttributes, HTMLAttributes, ReactElement, ReactNode, RefObject } from 'react';
import type { FormId, ManaType, Rarity } from '@alloy/engine';
import type { PadButton } from '@/features/gamepad/gamepad';

/** One action's inputs on both devices. */
export interface Binding {
  /** KeyboardEvent.code, or several ('Delete' | ['BracketRight']…). The first is the one drawn. */
  key?: string | string[];
  ctrl?: boolean;
  alt?: boolean;
  /** A pointer gesture shown instead of (or beside) a key. */
  mouse?: 'click' | 'rmb' | 'lmb' | 'drag' | 'hover';
  pad?: PadButton;
  /** Pad: this binding is a hold, firing `onHold(true)` after this many ms (default 600). */
  padHold?: number;
  /** A key held down rather than pressed: Shift compare, Alt labels (onHold true on down, false on up/blur). */
  whileHeld?: boolean;
}

/**
 * One prompt. Press timing:
 * - A prompt with only `onPress` fires on press down.
 * - Two prompts may share a pad button in a scope only if exactly one of them has `padHold`
 *   (Skills: Y Remove and hold-Y Apply). Then the tap's `onPress` fires on release under 400 ms,
 *   the hold's `onHold(true)` fires at `padHold`, and a press released between them fires neither.
 * - `whileHeld` and LT-hold prompts get `onHold(true)` on down and `onHold(false)` on up.
 */
export interface Prompt {
  id: string;
  label: string;
  binding: Binding;
  /** None: display only (e.g. "Select"). */
  onPress?: () => void;
  onHold?: (held: boolean) => void;
  disabled?: boolean;
  /** Drawn as a real (non-navigable, data-pad-skip) button that the mouse can click, e.g. the hub's "Menu" (data-pad-back). */
  asButton?: boolean;
  padBack?: boolean;
}

export type GlyphId =
  | 'scrap' | 'link' | 'dust' | 'rune' | 'potion' | 'dodge' | 'attack' | 'lock' | 'check'
  | 'skull' | 'anvil' | 'chest' | 'up' | 'down' | 'new' | 'potential'
  | 'controls' | 'settings' | 'training' | 'menu' | 'journal' | 'lab' | 'door' | 'extract'
  | 'riposte' | 'quick' | 'barrier' | 'galvanize' // buffs
  | ManaType | FormId; // 6 elements, 12 forms

export type ScaleContext = 'ui' | 'hud';

// ── Surfaces ──────────────────────────────────────────────────────────────

/** Omits the DOM `title` (a string): the contract's `title` is the panel's heading. */
export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  as?: 'section' | 'div' | 'aside';
  /** 'plate': wood-framed riveted steel (hub). 'glass': HUD steel. 'well': a dark inset. */
  material?: 'plate' | 'glass' | 'well';
  title?: ReactNode;
  aside?: ReactNode;
  /** Border colour override: a rarity, the selected state. */
  accent?: string;
  /** Scrolls inside itself; the screen never scrolls. Default true for 'plate'. */
  scroll?: boolean;
  testId?: string;
}

export interface ScreenProps {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
  /** 'wall': the wood wall. 'arena-pause': rgba(24,20,37,.86) over the arena. 'arena-stop': rgba(6,6,11,.82). */
  backdrop: 'wall' | 'arena-pause' | 'arena-stop';
  /** 'band': the steel header band (hub, pause). 'bare': text over the backdrop (stop). */
  headerStyle?: 'band' | 'bare';
  testId?: string;
}

export interface DialogProps {
  title: ReactNode;
  /** Absent: forced (no back, no Esc), e.g. the mana choice. */
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  initialFocus?: RefObject<HTMLElement | null>;
  testId?: string;
}

// ── Controls ──────────────────────────────────────────────────────────────

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'go' | 'quiet';
  size?: 'sm' | 'md' | 'lg';
  /** Draws its glyph at the right end. Display only: usePrompts binds it. */
  binding?: Binding;
  testId?: string;
}

export interface TabsProps<T extends string> {
  tabs: { id: T; label: ReactNode; badge?: ReactNode; disabled?: boolean; title?: string; testId?: string }[];
  value: T;
  onChange: (id: T) => void;
  /** 'top': LB/RB (+ digits 1..n when `digits`). 'sub': LT/RT. Disabled tabs are skipped by all of them. */
  level: 'top' | 'sub';
  digits?: boolean;
  glyphs?: boolean;
  size?: 'lg' | 'md';
  'aria-label': string;
}

/** `pressed`, as the old AbilitiesPanel Chip, so step 2·0 is an import swap. */
export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  testId?: string;
}

export interface SegmentedProps<T extends string> {
  options: { id: T; label: ReactNode; color?: string; disabled?: boolean; title?: string; testId?: string }[];
  value: T | null;
  onChange: (id: T) => void;
  columns?: number;
  'aria-label': string;
}

export interface BarProps {
  value: number;
  max: number;
  kind: 'life' | 'mana' | 'charge' | 'progress';
  extra?: { value: number; color: string };
  label?: ReactNode;
  height?: number;
  segmented?: boolean;
  testId?: string;
}

// ── Items ─────────────────────────────────────────────────────────────────

export interface TileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  rarity: Rarity | null;
  icon?: ReactNode;
  size?: number;
  delta?: 'up' | 'down' | 'potential' | null;
  fresh?: boolean;
  locked?: boolean;
  equipped?: boolean;
  selected?: boolean;
  label: string;
  testId?: string;
}

// ── Tooltips ──────────────────────────────────────────────────────────────

export interface TooltipProps {
  content: () => ReactNode;
  children: ReactElement;
  placement?: 'right' | 'left' | 'top' | 'bottom';
  openWhile?: boolean;
  /** Default true: into uiLayer(). The HUD passes false and the card renders inline, under the HUD's zoom. */
  portal?: boolean;
}

// ── Art ───────────────────────────────────────────────────────────────────

export interface PixelSpriteProps {
  id: string;
  scale: number;
  /** Which zoom it sits under, for the whole-device-pixel snap. Required. */
  context: ScaleContext;
  frame?: number;
  label?: string;
}
