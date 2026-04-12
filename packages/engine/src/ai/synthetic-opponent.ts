import type { AITier } from '../types/ai.js';
import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import { AIController } from './ai-controller.js';

export interface SyntheticOpponent {
  tier: AITier;
  controller: AIController;
  seed: number;
}

/**
 * Generate a random AI opponent for async matchmaking fallback.
 * When no real opponent is available, this creates a deterministic
 * synthetic opponent with a random tier and seeded RNG.
 */
export function generateSyntheticOpponent(seed: number, registry: DataRegistry): SyntheticOpponent {
  const rng = new SeededRNG(seed);

  // Select a random AI tier (1-5)
  // Weighted slightly higher to make harder opponents more likely
  const tierRoll = rng.nextInt(1, 100);
  const tier: AITier =
    tierRoll <= 20 ? 1 :    // 20% Tier 1
    tierRoll <= 40 ? 2 :    // 20% Tier 2
    tierRoll <= 60 ? 3 :    // 20% Tier 3
    tierRoll <= 80 ? 4 :    // 20% Tier 4
    5;                      // 20% Tier 5

  const controller = new AIController(tier, registry, rng);

  return {
    tier,
    controller,
    seed,
  };
}

/**
 * Get a human-readable name for a synthetic opponent's tier.
 */
export function getTierName(tier: AITier): string {
  switch (tier) {
    case 1:
      return 'Apprentice';
    case 2:
      return 'Journeyman';
    case 3:
      return 'Artisan';
    case 4:
      return 'Master';
    case 5:
      return 'Alloy';
    default:
      return 'Unknown';
  }
}
