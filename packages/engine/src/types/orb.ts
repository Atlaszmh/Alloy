import type { AffixTier } from './affix.js';

export interface OrbInstance {
  uid: string; // Unique instance ID (generated during pool creation)
  affixId: string; // References AffixDef.id
  tier: AffixTier;
  compoundId?: string; // Present when this orb is a combined result
  sourceOrbs?: [OrbInstance, OrbInstance]; // The original orbs used in the combination
}
