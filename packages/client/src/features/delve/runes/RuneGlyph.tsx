import type { RuneRef } from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { FAMILY_STYLE, TIER_NUMERAL, runeName } from './rune-style';

/**
 * A rune at a glance: its icon and tier ("✳️ III") in a ring of its family's
 * colour. Dimmed when dormant: socketed, but doing nothing on its move now.
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
      className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 leading-none ${size === 'sm' ? 'py-0.5 text-[10px]' : 'py-1 text-xs'}`}
      style={{ borderColor: color, opacity: dormant ? 0.4 : 1 }}
      role="img"
      aria-label={`${runeName(registry, rune)}${dormant ? ', dormant' : ''}`}
      data-testid="rune-glyph"
    >
      <span aria-hidden>{def.icon}</span>
      <span aria-hidden className="font-bold" style={{ color }}>
        {TIER_NUMERAL[rune.tier]}
      </span>
    </span>
  );
}
