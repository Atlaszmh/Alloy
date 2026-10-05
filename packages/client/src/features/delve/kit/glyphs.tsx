import type { ReactElement } from 'react';
import { keyLabel, padHint } from '@/features/controls/controls';
import type { PadButton } from '@/features/gamepad/gamepad';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { blurAfterMouse } from './controls';
import { GLYPH_ART, pixelRuns } from './glyph-art';
import { orderPrompts } from './prompts';
import type { Binding, GlyphId, Prompt } from './types';

type GlyphSize = 'sm' | 'md';

/** A keyboard key or mouse button as a keycap: sm 28 px tall (14 px text), md 32 px (16 px). */
export function Keycap({ label, size = 'md' }: { label: string; size?: GlyphSize }): ReactElement {
  return <kbd className={`k-key k-glyph-${size}`}>{label}</kbd>;
}

const PAD_COLOR: Partial<Record<PadButton, string>> = {
  a: '#63c74d',
  b: '#e43b44',
  x: '#0099db',
  y: '#fee761',
};

/** An octagonal pad glyph: A green, B red, X blue, Y yellow, the rest light steel; ink #181425. */
export function PadGlyph({
  button,
  hold = false,
  size = 'md',
}: {
  button: PadButton;
  hold?: boolean;
  size?: GlyphSize;
}): ReactElement {
  const label = padHint(button);
  return (
    <span className="k-glyph-row" role="img" aria-label={hold ? `Hold ${label}` : label}>
      <span
        aria-hidden
        className={`k-pad k-glyph-${size}`}
        style={{ background: PAD_COLOR[button] ?? '#c0cbdc' }}
      >
        {label}
      </span>
      {hold && (
        <span aria-hidden className="k-hold">
          hold
        </span>
      )}
    </span>
  );
}

/** Short names for the keys the Delve's prompts use; everything else is controls.ts's `keyLabel`. */
const KEY_SHORT: Record<string, string> = {
  Delete: 'Del',
  Escape: 'Esc',
  BracketLeft: '[',
  BracketRight: ']',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
};

const MOUSE_LABEL: Record<NonNullable<Binding['mouse']>, string> = {
  click: 'Click',
  rmb: 'RMB',
  lmb: 'LMB',
  drag: 'Drag',
  hover: 'Hover',
};

/** The keycaps or the pad glyph for the device that holds the input lock ('touch' draws the mouse and key side). */
export function InputGlyph({
  binding,
  size = 'md',
}: {
  binding: Binding;
  size?: GlyphSize;
}): ReactElement {
  const device = useInputDeviceStore((s) => s.device);
  if (device === 'gamepad' && binding.pad) {
    return <PadGlyph button={binding.pad} hold={binding.padHold !== undefined} size={size} />;
  }
  const key = Array.isArray(binding.key) ? binding.key[0] : binding.key;
  const caps = [
    binding.ctrl && 'Ctrl',
    binding.alt && 'Alt',
    key && (KEY_SHORT[key] ?? keyLabel(key)),
    !key && binding.mouse && MOUSE_LABEL[binding.mouse],
  ].filter((c): c is string => Boolean(c));
  return (
    <span className="k-glyph-row">
      {caps.map((c, i) => (
        <Keycap key={i} label={c} size={size} />
      ))}
    </span>
  );
}

/** A pixel glyph drawn as crisp SVG rects (the Delve's chrome uses these, not emoji). */
export function Glyph({
  id,
  size = 16,
  color,
  title,
}: {
  id: GlyphId;
  size?: number;
  color?: string;
  title?: string;
}): ReactElement {
  const art = GLYPH_ART[id];
  const w = art.rows[0].length;
  const h = art.rows.length;
  const fill = color ?? art.color ?? 'currentColor';
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-glyph={id}
      style={{ display: 'inline-block', flex: 'none' }}
    >
      {pixelRuns(art.rows).map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.w}
          height={1}
          fill={r.ch === '#' ? fill : art.palette?.[r.ch]}
        />
      ))}
    </svg>
  );
}

function amount(n: number, signed: boolean): string {
  const text = Math.abs(n).toLocaleString('en-US');
  if (n < 0) return `−${text}`;
  return signed ? `+${text}` : text;
}

/** A price or a purse amount with its glyphs: "1 Link · 20 scrap". Its text reads the same as its label. */
export function Price({
  scrap,
  links,
  dust,
  signed = false,
}: {
  scrap?: number;
  links?: number;
  dust?: number;
  signed?: boolean;
}): ReactElement {
  const parts: { glyph: GlyphId; n: number; unit: string }[] = [];
  if (links !== undefined)
    parts.push({ glyph: 'link', n: links, unit: Math.abs(links) === 1 ? 'Link' : 'Links' });
  if (scrap !== undefined) parts.push({ glyph: 'scrap', n: scrap, unit: 'scrap' });
  if (dust !== undefined) parts.push({ glyph: 'dust', n: dust, unit: 'Mana Dust' });
  const text = parts.map((p) => `${amount(p.n, signed)} ${p.unit}`).join(' · ');
  return (
    <span className="k-price" role="img" aria-label={text}>
      {parts.map((p, i) => (
        <span key={p.glyph} className="k-price-part">
          {i > 0 && <span className="k-price-unit">{' · '}</span>}
          <Glyph id={p.glyph} size={18} />
          <b>{amount(p.n, signed)}</b> <span className="k-price-unit">{p.unit}</span>
        </span>
      ))}
    </span>
  );
}

/** Prompts in a row, in the grammar's order (`orderPrompts`): a glyph and a label each. Draws only; the screen binds them with usePrompts. */
export function PromptBar({
  prompts,
  className = '',
}: {
  prompts: Prompt[];
  className?: string;
}): ReactElement {
  return (
    <div className={`k-promptbar ${className}`}>
      {orderPrompts(prompts).map((p) =>
        p.asButton ? (
          <button
            key={p.id}
            type="button"
            className="k-prompt k-prompt-btn"
            aria-label={p.label}
            tabIndex={-1}
            data-pad-skip
            data-pad-back={p.padBack ? '' : undefined}
            disabled={p.disabled}
            onClick={p.onPress}
            onPointerUp={blurAfterMouse}
          >
            <InputGlyph binding={p.binding} size="sm" />
            {p.label}
          </button>
        ) : (
          <span key={p.id} className="k-prompt" aria-disabled={p.disabled || undefined}>
            <InputGlyph binding={p.binding} size="sm" />
            {p.label}
          </span>
        ),
      )}
    </div>
  );
}
