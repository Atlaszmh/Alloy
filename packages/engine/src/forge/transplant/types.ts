import type { GemInstance, SecondarySlot } from '../../types/gem.js';
import type { SeededRNG } from '../../rng/seeded-rng.js';

/** Inputs the resolver receives before walking the modifier pipeline. */
export interface TransplantContext {
  target: GemInstance;
  source: GemInstance;
  chosenAffix?: 'primary' | 'secondary';
  rng: SeededRNG;
}

/** A modifier can adjust the context (e.g., force a choice) or short-circuit
 *  by returning a final slot. If it returns void, the pipeline continues. */
export interface TransplantModifier {
  id: string;
  priority: number; // lower priority runs first
  apply(ctx: TransplantContext): TransplantContext | SecondarySlot | void;
}

/** Preview returned by `planTransplantGem` — drives the UI result card. */
export interface TransplantPreview {
  targetUid: string;
  sourceUid: string;
  /** When true, the specific affix is not determined until commit (RNG). */
  isRandom: boolean;
  /** For the random case, both possibilities are surfaced so UI can show "A or B". */
  possibleAffixes: Array<{ affixId: string; tier: 1 | 2 | 3 | 4 | 5; rarity: string }>;
  /** For the chosen case, the single resolved slot preview. */
  resolvedSlot: SecondarySlot | null;
  /** Flux cost that would be deducted at commit (0 for random path). */
  fluxCost: number;
}
