import type { AffixTier } from './affix.js';

export interface OrbInstance {
  uid: string; // Unique instance ID (generated during pool creation)
  affixId: string; // References AffixDef.id
  tier: AffixTier;
}
