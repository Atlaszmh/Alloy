import type { DataRegistry } from '../../data/registry.js';
import type { GemInstance } from '../../types/gem.js';
import type { TransplantPreview } from './types.js';
import { hasSecondarySlot } from '../../types/gem.js';

export function previewTransplant(
  target: GemInstance,
  source: GemInstance,
  registry: DataRegistry,
  chosenAffix?: 'primary' | 'secondary',
): TransplantPreview | null {
  const threshold = registry.getBalance().transplant.unlockThreshold;
  if (!hasSecondarySlot(target, threshold)) return null;
  if (target.secondary) return null;
  if (source.uid === target.uid) return null;

  const sourceHasSecondary = source.secondary !== undefined;
  const fluxCosts = registry.getBalance().gem.flux.costs;
  const fluxCost = chosenAffix
    ? (fluxCosts as { transplantChooseAffix?: number }).transplantChooseAffix ?? 3
    : (fluxCosts as { transplantGem?: number }).transplantGem ?? 0;

  if (!sourceHasSecondary || chosenAffix === 'primary') {
    return {
      targetUid: target.uid,
      sourceUid: source.uid,
      isRandom: false,
      possibleAffixes: [{ affixId: source.affixId, tier: source.tier, rarity: source.rarity }],
      resolvedSlot: {
        affixId: source.affixId,
        tier: source.tier,
        rarity: source.rarity,
        sourceGemUid: source.uid,
      },
      fluxCost,
    };
  }

  if (chosenAffix === 'secondary') {
    const sec = source.secondary!;
    return {
      targetUid: target.uid,
      sourceUid: source.uid,
      isRandom: false,
      possibleAffixes: [{ affixId: sec.affixId, tier: sec.tier, rarity: sec.rarity }],
      resolvedSlot: {
        affixId: sec.affixId,
        tier: sec.tier,
        rarity: sec.rarity,
        sourceGemUid: source.uid,
      },
      fluxCost,
    };
  }

  // Random path — source has secondary, no chosenAffix specified; both possibilities surfaced
  const sec = source.secondary!;
  return {
    targetUid: target.uid,
    sourceUid: source.uid,
    isRandom: true,
    possibleAffixes: [
      { affixId: source.affixId, tier: source.tier, rarity: source.rarity },
      { affixId: sec.affixId, tier: sec.tier, rarity: sec.rarity },
    ],
    resolvedSlot: null,
    fluxCost,
  };
}
