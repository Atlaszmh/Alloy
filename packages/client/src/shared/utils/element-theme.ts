export const ELEMENT_COLORS: Record<string, string> = {
  fire: 'var(--color-fire)', cold: 'var(--color-cold)',
  lightning: 'var(--color-lightning)', poison: 'var(--color-poison)',
  shadow: 'var(--color-shadow)', chaos: 'var(--color-chaos)',
  physical: '#c0c0c0',
};

export const ELEMENT_GRADIENTS: Record<string, { bg: string; border: string; glow: string }> = {
  fire:      { bg: 'rgba(232,85,58,0.4),rgba(232,85,58,0.12)',   border: 'var(--color-fire)',      glow: 'var(--color-fire)' },
  cold:      { bg: 'rgba(58,155,232,0.4),rgba(58,155,232,0.12)', border: 'var(--color-cold)',      glow: 'var(--color-cold)' },
  lightning: { bg: 'rgba(212,192,64,0.4),rgba(212,192,64,0.12)', border: 'var(--color-lightning)', glow: 'var(--color-lightning)' },
  poison:    { bg: 'rgba(45,179,105,0.4),rgba(45,179,105,0.12)', border: 'var(--color-poison)',    glow: 'var(--color-poison)' },
  shadow:    { bg: 'rgba(139,58,232,0.4),rgba(139,58,232,0.12)', border: 'var(--color-shadow)',    glow: 'var(--color-shadow)' },
  chaos:     { bg: 'rgba(232,58,139,0.4),rgba(232,58,139,0.12)', border: 'var(--color-chaos)',     glow: 'var(--color-chaos)' },
  physical:  { bg: 'rgba(192,192,192,0.3),rgba(120,120,120,0.1)', border: '#9a9a9a',               glow: '#c0c0c0' },
};

export const ELEMENT_EMOJIS: Record<string, string> = {
  fire: '\u{1F525}', cold: '\u{2744}', lightning: '\u{26A1}',
  poison: '\u{2620}', shadow: '\u{1F319}', chaos: '\u{1F300}', physical: '\u{2694}',
};

export const TIER_COLORS: Record<number, string> = {
  1: 'var(--color-tier-1)', 2: 'var(--color-tier-2)',
  3: 'var(--color-tier-3)', 4: 'var(--color-tier-4)',
};
