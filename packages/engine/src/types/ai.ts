export type AITier = 1 | 2 | 3 | 4 | 5;

export interface AIConfig {
  tier: AITier;
  name: string; // 'Apprentice' | 'Journeyman' | 'Artisan' | 'Master' | 'Alloy'
  thinkingDelayMs: number; // Artificial delay per pick (cosmetic)
}

export const AI_CONFIGS: Record<AITier, AIConfig> = {
  1: { tier: 1, name: 'Apprentice', thinkingDelayMs: 500 },
  2: { tier: 2, name: 'Journeyman', thinkingDelayMs: 1000 },
  3: { tier: 3, name: 'Artisan', thinkingDelayMs: 1500 },
  4: { tier: 4, name: 'Master', thinkingDelayMs: 2000 },
  5: { tier: 5, name: 'Alloy', thinkingDelayMs: 2500 },
};
