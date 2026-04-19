import type { Element } from '@alloy/engine';

export const DAMAGE_COLORS: Record<Element | 'physical', number> = {
  physical: 0xe2e8f0, fire: 0xf97316, cold: 0x22d3ee,
  lightning: 0xfacc15, poison: 0x4ade80, shadow: 0xa855f7, chaos: 0xec4899,
};

export const DAMAGE_CSS_COLORS: Record<Element | 'physical', string> = {
  physical: '#e2e8f0', fire: '#f97316', cold: '#22d3ee',
  lightning: '#facc15', poison: '#4ade80', shadow: '#a855f7', chaos: '#ec4899',
};

export const UI_COLORS = {
  crit: '#fbbf24', critGlow: 'rgba(251,191,36,0.5)',
  healing: '#34d399', overheal: '#6b8f7b',
  blocked: '#94a3b8', dodged: '#60a5fa',
  playerHP: '#22c55e', enemyHP: '#ef4444',
  playerAccent: '#3b82f6', enemyAccent: '#ef4444',
  muted: '#64748b', separator: '#334155',
  compound: '#fbbf24', // gold — named compound payoff (matches --color-warning)
} as const;

export const PIXI_COLORS = {
  crit: 0xfbbf24, healing: 0x34d399, blocked: 0x94a3b8, dodged: 0x60a5fa,
  compound: 0xfbbf24, // gold — named compound payoff (matches --color-warning)
} as const;
