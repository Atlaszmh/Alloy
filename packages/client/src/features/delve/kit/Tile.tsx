import type { ReactElement } from 'react';
import { RARITY_COLOR } from '../format';
import { blurAfterMouse } from './controls';
import { Glyph } from './glyphs';
import type { TileProps } from './types';

/**
 * An item socket: a well with the rarity border, its icon, and its marks (▲ ▼ ◇ delta, NEW, lock,
 * equipped). The marks are drawn for the eye and spoken in the label.
 */
export function Tile({
  rarity,
  icon,
  size = 84,
  delta = null,
  fresh = false,
  locked = false,
  equipped = false,
  selected,
  label,
  testId,
  className = '',
  type = 'button',
  style,
  onPointerUp,
  ...rest
}: TileProps): ReactElement {
  const states = [
    delta === 'up' && 'upgrade',
    delta === 'down' && 'downgrade',
    delta === 'potential' && 'potential upgrade',
    fresh && 'new',
    locked && 'locked',
    equipped && 'equipped',
  ].filter(Boolean);
  return (
    <button
      {...rest}
      type={type}
      className={`k-tile k-socket ${className}`}
      style={{
        ...style,
        width: size,
        height: size,
        borderColor: rarity ? RARITY_COLOR[rarity] : undefined,
      }}
      aria-label={[label, ...states].join(', ')}
      aria-pressed={selected}
      data-rarity={rarity ?? undefined}
      data-testid={testId}
      onPointerUp={(e) => {
        onPointerUp?.(e);
        blurAfterMouse(e);
      }}
    >
      {icon && (
        <span aria-hidden className="k-tile-icon">
          {icon}
        </span>
      )}
      {delta && (
        <span aria-hidden className="k-tile-mark k-tile-delta">
          <Glyph id={delta} size={14} />
        </span>
      )}
      {fresh && (
        <span aria-hidden className="k-tile-mark k-tile-new">
          NEW
        </span>
      )}
      {locked && (
        <span aria-hidden className="k-tile-mark k-tile-lock">
          <Glyph id="lock" size={12} />
        </span>
      )}
      {equipped && (
        <span aria-hidden className="k-tile-mark k-tile-eq">
          E
        </span>
      )}
    </button>
  );
}
