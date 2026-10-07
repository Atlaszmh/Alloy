import type { BoonFamily } from '@alloy/engine';

/**
 * Each boon family's colour (a stop card's edge; the HUD's boon tile) and name, in ENDESGA 32:
 * offense red, element violet, defense steel blue, tempo amber, fortune gold, pact crimson,
 * floor green.
 */
export const BOON_STYLE: Record<BoonFamily, { color: string; label: string }> = {
  offense: { color: '#e43b44', label: 'Offense' },
  element: { color: '#b55088', label: 'Element' },
  defense: { color: '#8b9bb4', label: 'Defense' },
  tempo: { color: '#feae34', label: 'Tempo' },
  fortune: { color: '#fee761', label: 'Fortune' },
  pact: { color: '#a22633', label: 'Pact' },
  floor: { color: '#3e8948', label: 'Floor' },
};
