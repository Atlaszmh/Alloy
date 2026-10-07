import type { BoonFamily } from '@alloy/engine';
import type { GlyphId } from './kit';

/**
 * Each boon family's colour, name and glyph. The stop's boon cards take the colour for their edge
 * and the label; the HUD's boon tile draws the glyph tinted in the colour (its border says dive or
 * floor). Colours in ENDESGA 32: offense red, element violet, defense steel blue, tempo amber,
 * fortune gold, pact crimson, floor green. Glyphs are existing art (`quick` is the timed buff's).
 */
export const BOON_STYLE: Record<BoonFamily, { color: string; label: string; glyph: GlyphId }> = {
  offense: { color: '#e43b44', label: 'Offense', glyph: 'attack' },
  element: { color: '#b55088', label: 'Element', glyph: 'rune-elemental' },
  defense: { color: '#8b9bb4', label: 'Defense', glyph: 'barrier' },
  tempo: { color: '#feae34', label: 'Tempo', glyph: 'rune-tempo' },
  fortune: { color: '#fee761', label: 'Fortune', glyph: 'chest' },
  pact: { color: '#a22633', label: 'Pact', glyph: 'skull' },
  floor: { color: '#3e8948', label: 'Floor', glyph: 'door' },
};
