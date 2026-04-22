import type { SecondarySlot } from '../../types/gem.js';
import type { TransplantContext, TransplantModifier } from './types.js';
import { TRANSPLANT_MODIFIERS } from './modifiers/index.js';

/** Resolve a transplant: walks the modifier pipeline, then computes the
 *  final SecondarySlot based on context (chosenAffix or RNG). */
export function resolveTransplant(
  input: TransplantContext,
  modifiers: TransplantModifier[] = TRANSPLANT_MODIFIERS,
): SecondarySlot {
  // Walk modifiers in priority order; any modifier that returns a SecondarySlot
  // short-circuits (reserved for future flux-driven overrides).
  let ctx = input;
  const sorted = [...modifiers].sort((a, b) => a.priority - b.priority);
  for (const mod of sorted) {
    const out = mod.apply(ctx);
    if (!out) continue;
    if ('affixId' in out) return out; // SecondarySlot short-circuit
    ctx = out;
  }

  const { source, chosenAffix, rng } = ctx;
  const hasSourceSecondary = source.secondary !== undefined;

  let pickPrimary: boolean;
  if (chosenAffix === 'primary' || !hasSourceSecondary) pickPrimary = true;
  else if (chosenAffix === 'secondary') pickPrimary = false;
  else pickPrimary = rng.next() < 0.5; // random 50/50

  if (pickPrimary) {
    return {
      affixId: source.affixId,
      tier: source.tier,
      rarity: source.rarity,
      sourceGemUid: source.uid,
    };
  }
  const sec = source.secondary!;
  return {
    affixId: sec.affixId,
    tier: sec.tier,
    rarity: sec.rarity,
    sourceGemUid: source.uid,
  };
}
