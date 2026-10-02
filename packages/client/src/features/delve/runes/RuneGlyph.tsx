import type { RuneRef } from '@alloy/engine';
import { Glyph } from '../kit';
import { getDelveRegistry } from '../registry';
import { FAMILY_STYLE, TIER_NUMERAL, runeName } from './rune-style';

/**
 * A rune at a glance: its family's pixel glyph and its tier ("III") in a ring
 * of the family's colour. Dimmed when dormant: socketed, but doing nothing on
 * its move now.
 */
export function RuneGlyph({
  rune,
  dormant = false,
  size = 'md',
}: {
  rune: RuneRef;
  dormant?: boolean;
  size?: 'sm' | 'md';
}) {
  const registry = getDelveRegistry();
  const def = registry.getRune(rune.id);
  const color = FAMILY_STYLE[def.family].color;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border text-[14px] leading-none ${size === 'sm' ? 'px-1 py-px' : 'px-1.5 py-1'}`}
      style={{ borderColor: color, opacity: dormant ? 0.4 : 1 }}
      role="img"
      aria-label={`${runeName(registry, rune)}${dormant ? ', dormant' : ''}`}
      data-testid="rune-glyph"
    >
      <Glyph id={`rune-${def.family}`} size={size === 'sm' ? 12 : 14} color={color} />
      <span aria-hidden className="font-bold" style={{ color }}>
        {TIER_NUMERAL[rune.tier]}
      </span>
    </span>
  );
}
