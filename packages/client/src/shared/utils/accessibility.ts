// Colorblind mode helpers

export type ColorblindMode = 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';

// CSS filter values for different colorblind simulations
const COLORBLIND_FILTERS: Record<ColorblindMode, string> = {
  none: 'none',
  deuteranopia: 'url(#deuteranopia)',
  protanopia: 'url(#protanopia)',
  tritanopia: 'url(#tritanopia)',
};

export function getColorblindFilter(mode: ColorblindMode): string {
  return COLORBLIND_FILTERS[mode];
}

// Element representations that work regardless of color vision
// Each element uses BOTH color AND a unique shape/icon
export const ELEMENT_ACCESSIBLE: Record<string, { symbol: string; label: string; shape: string }> = {
  fire: { symbol: '\u{1F525}', label: 'Fire', shape: 'triangle-up' },
  cold: { symbol: '\u{2744}', label: 'Cold', shape: 'hexagon' },
  lightning: { symbol: '\u{26A1}', label: 'Lightning', shape: 'zigzag' },
  poison: { symbol: '\u{2620}', label: 'Poison', shape: 'diamond' },
  shadow: { symbol: '\u{1F319}', label: 'Shadow', shape: 'crescent' },
  chaos: { symbol: '\u{1F300}', label: 'Chaos', shape: 'spiral' },
  physical: { symbol: '\u{2694}', label: 'Physical', shape: 'circle' },
};

// Tier visual indicators (work without color)
export const TIER_ACCESSIBLE: Record<number, { border: string; label: string; dots: number }> = {
  1: { border: 'solid', label: 'Common', dots: 1 },
  2: { border: 'dashed', label: 'Uncommon', dots: 2 },
  3: { border: 'double', label: 'Rare', dots: 3 },
  4: { border: 'ridge', label: 'Legendary', dots: 4 },
};

// Screen reader announcements
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', priority);
  el.setAttribute('aria-atomic', 'true');
  el.className = 'sr-only';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}
