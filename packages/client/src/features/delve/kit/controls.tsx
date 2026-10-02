import type { PointerEvent, ReactElement } from 'react';
import { InputGlyph } from './glyphs';
import type { BarProps, Binding, ButtonProps, ChipProps, SegmentedProps, TabsProps } from './types';

/** Kit controls let go of focus after a mouse click (so Enter and Esc reach the screen), never after a key or pad press. */
export function blurAfterMouse(e: PointerEvent<HTMLElement>): void {
  if (e.pointerType === 'mouse') e.currentTarget.blur();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG 2.1 contrast ratio of two `#rrggbb` colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'k-hot',
  secondary: 'k-plank',
  danger: 'k-danger',
  go: 'k-go',
  quiet: 'k-btn-quiet',
};

/** A kit button: hot metal (primary), a plank (secondary), danger, go or quiet; its binding's glyph at the right end. */
export function Button({
  variant = 'secondary',
  size = 'md',
  binding,
  testId,
  className = '',
  type = 'button',
  children,
  onPointerUp,
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      {...rest}
      type={type}
      className={`k-btn k-btn-${size} ${VARIANT[variant]} ${className}`}
      data-testid={testId}
      onPointerUp={(e) => {
        onPointerUp?.(e);
        blurAfterMouse(e);
      }}
    >
      {children}
      {binding && (
        <span aria-hidden className="k-glyph-row">
          <InputGlyph binding={binding} size={size === 'sm' ? 'sm' : 'md'} />
        </span>
      )}
    </button>
  );
}

/** A toggle chip (`aria-pressed`), as the old AbilitiesPanel Chip. */
export function Chip({
  pressed,
  testId,
  className = '',
  type = 'button',
  children,
  onPointerUp,
  ...rest
}: ChipProps): ReactElement {
  return (
    <button
      {...rest}
      type={type}
      className={`k-chip ${className}`}
      aria-pressed={pressed}
      data-testid={testId}
      onPointerUp={(e) => {
        onPointerUp?.(e);
        blurAfterMouse(e);
      }}
    >
      {children}
    </button>
  );
}

/**
 * A tab list. 'top' is stepped by LB/RB, 'sub' by LT/RT; the pad nav finds it by `data-pad-tabs`.
 * Disabled tabs are skipped. `glyphs` draws the stepping inputs at both ends, with `digits` the
 * 1..n keys too; the screen binds those keys through its prompts (spec revision 2), never Tabs.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  level,
  digits = false,
  glyphs = false,
  size = 'lg',
  'aria-label': ariaLabel,
}: TabsProps<T>): ReactElement {
  const ends: [Binding, Binding] =
    level === 'top'
      ? [
          { key: digits ? 'Digit1' : undefined, pad: 'lb' },
          { key: digits ? `Digit${tabs.length}` : undefined, pad: 'rb' },
        ]
      : [{ pad: 'lt' }, { pad: 'rt' }];

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="k-tabs"
      data-pad-tabs={level === 'sub' ? 'sub' : ''}
    >
      {glyphs && (
        <span aria-hidden className="k-glyph-row">
          <InputGlyph binding={ends[0]} size="sm" />
        </span>
      )}
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          disabled={t.disabled}
          title={t.title}
          data-testid={t.testId}
          className={`k-tab k-tab-${size}`}
          onClick={() => onChange(t.id)}
          onPointerUp={blurAfterMouse}
        >
          {t.label}
          {t.badge !== undefined && (
            <>
              {' '}
              <span className="k-tab-badge">{t.badge}</span>
            </>
          )}
        </button>
      ))}
      {glyphs && (
        <span aria-hidden className="k-glyph-row">
          <InputGlyph binding={ends[1]} size="sm" />
        </span>
      )}
    </div>
  );
}

/** The raised steel a segment sits on: a colour tints its label only if it reads there (4.5:1). */
const SEGMENT_GROUND = '#3a4466';

/** One choice of several (`role="radio"`). A colour that fails on raised steel shows as a swatch instead. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  columns,
  'aria-label': ariaLabel,
}: SegmentedProps<T>): ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="k-segs"
      style={
        columns
          ? { display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
          : undefined
      }
    >
      {options.map((o) => {
        const on = o.id === value;
        const tint = !on && !!o.color && contrast(o.color, SEGMENT_GROUND) >= 4.5;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            title={o.title}
            data-testid={o.testId}
            className="k-seg"
            style={tint ? { color: o.color } : undefined}
            onClick={() => onChange(o.id)}
            onPointerUp={blurAfterMouse}
          >
            {o.color && !tint && (
              <span aria-hidden className="k-swatch" style={{ background: o.color }} />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const BAR_FILL: Record<BarProps['kind'], string> = {
  life: 'repeating-linear-gradient(90deg, #63c74d 0 12px, #3e8948 12px 14px)',
  mana: 'repeating-linear-gradient(90deg, #2ce8f5 0 2px, #0099db 2px 12px, #124e89 12px 14px)',
  charge: 'repeating-linear-gradient(90deg, #fee761 0 2px, #feae34 2px 12px, #f77622 12px 14px)',
  progress: '#feae34',
};

const BAR_FRAME: Record<BarProps['kind'], string> = {
  life: 'k-lifeframe',
  mana: 'k-mana',
  charge: 'k-lifeframe',
  progress: 'k-bar-progress',
};

const BAR_HEIGHT: Record<BarProps['kind'], number> = {
  life: 32,
  mana: 24,
  charge: 12,
  progress: 12,
};

const BAR_NAME: Record<BarProps['kind'], string> = {
  life: 'Life',
  mana: 'Mana',
  charge: 'Charge',
  progress: 'Progress',
};

/** 8 px segments with 2 px gaps, cut out of whatever fill sits under it. */
const SEGMENTS = 'repeating-linear-gradient(90deg, #000 0 8px, transparent 8px 10px)';

/** A stepped bar: life (green), mana (in the mana glow), charge (hot metal) or progress; `extra` follows the fill (a barrier). */
export function Bar({
  value,
  max,
  kind,
  extra,
  label,
  height = BAR_HEIGHT[kind],
  segmented = false,
  testId,
}: BarProps): ReactElement {
  const frac = (v: number) => (max > 0 ? Math.max(0, Math.min(1, v / max)) : 0);
  const fill = frac(value);
  const more = extra ? Math.min(frac(extra.value), 1 - fill) : 0;
  const mask = segmented ? { maskImage: SEGMENTS, WebkitMaskImage: SEGMENTS } : undefined;
  return (
    <div
      role="progressbar"
      aria-label={BAR_NAME[kind]}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-valuetext={typeof label === 'string' ? label : undefined}
      data-testid={testId}
      className={`k-bar ${BAR_FRAME[kind]}`}
      style={{ height }}
    >
      <div
        className="k-bar-fill"
        style={{ left: 0, width: `${fill * 100}%`, background: BAR_FILL[kind], ...mask }}
      />
      {extra && more > 0 && (
        <div
          className="k-bar-extra"
          style={{
            left: `${fill * 100}%`,
            width: `${more * 100}%`,
            background: `repeating-linear-gradient(90deg, transparent 0 12px, rgba(24, 20, 37, 0.35) 12px 14px), ${extra.color}`,
            ...mask,
          }}
        />
      )}
      {label !== undefined && (
        <span
          className="k-bar-label k-disp"
          style={{ fontSize: Math.max(14, Math.round(height * 0.7)) }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
