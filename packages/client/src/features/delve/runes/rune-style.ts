import type { DataRegistry, RuneDef, RuneFamily, RuneRef, RuneTier } from '@alloy/engine';

/** Each family's colour (a glyph's ring, the HUD's dots) and name. */
export const FAMILY_STYLE: Record<RuneFamily, { color: string; label: string }> = {
  shape: { color: '#22d3ee', label: 'Shape' },
  tempo: { color: '#fbbf24', label: 'Tempo' },
  elemental: { color: '#a78bfa', label: 'Elemental' },
  sustain: { color: '#4ade80', label: 'Sustain' },
};

/** The tiers in order, I to V. */
export const TIERS: readonly RuneTier[] = [1, 2, 3, 4, 5];

/** A tier as the game writes it: 3 → "III". */
export const TIER_NUMERAL: Record<RuneTier, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
};

/** A rune with its tier: "Split III" (the picker, the pouch, toasts, the pickup feed). */
export function runeName(registry: DataRegistry, ref: RuneRef): string {
  return `${registry.getRune(ref.id).name} ${TIER_NUMERAL[ref.tier]}`;
}

/** Why a socketed rune does nothing on its move now: "Works on heavy and hold blows". */
export function dormantText(def: RuneDef): string {
  const kinds = def.fits.kinds;
  if (!kinds) return 'Does nothing on this move';
  const list = kinds.length < 2 ? kinds[0] : `${kinds.slice(0, -1).join(', ')} and ${kinds.at(-1)}`;
  return `Works on ${list} blows`;
}
