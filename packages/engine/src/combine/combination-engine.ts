import {
  type GemInstance,
  createGem,
  calculateEffectiveValue,
  nextRarity,
  MAX_TIER,
} from '../types/gem.js';
import { RecipeRegistry } from './recipe-registry.js';
import { DiscoveryState } from './discovery-state.js';
import {
  computeAverageQuality,
  computeAverageQualityN,
  applyMatchingRarityBonus,
  determineOutputTierRarity,
} from './combine-quality.js';

// --- Exported types ---

export type CombineLayer = 'signature' | 'category' | 'generic';

export interface CombineResult {
  gem: GemInstance;
  layer: CombineLayer;
  recipeId?: string;
  isNewDiscovery: boolean;
  consumedUids: string[];  // NEW — uids to remove from stockpile
  ejectedUid?: string;     // NEW — combine3 fallback only
}

export interface CombineConfig {
  matchingRarityBonus: number; // Default: 0.15
}

export interface CombinePreview {
  /** true if this affix pair has been attempted before */
  known: boolean;
  /** which combination layer would handle this pair */
  layer: CombineLayer;
  /** the output gem — only populated when known is true */
  gem: GemInstance | null;
  /** recipe ID if signature layer and known */
  recipeId?: string;
  /** only set by previewCombineTriple on fallback */
  fallbackPair?: [string, string];
  /** gem that would remain in stockpile */
  ejectedUid?: string;
}

const DEFAULT_CONFIG: CombineConfig = {
  matchingRarityBonus: 0.15,
};

// --- CombinationEngine ---

export class CombinationEngine {
  private registry: RecipeRegistry;
  private discovery: DiscoveryState;
  private categoryMap: Record<string, string>;
  private config: CombineConfig;

  constructor(
    registry: RecipeRegistry,
    discovery: DiscoveryState,
    categoryMap: Record<string, string>,
    config: Partial<CombineConfig> = {},
  ) {
    this.registry = registry;
    this.discovery = discovery;
    this.categoryMap = categoryMap;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  combine(
    gemA: GemInstance,
    gemB: GemInstance,
    outputUid: string,
    keepGemUid?: string,
  ): CombineResult {
    // Rejection: non-combinable gems
    if (!gemA.combinable) {
      throw new Error(`Gem ${gemA.uid} is not combinable`);
    }
    if (!gemB.combinable) {
      throw new Error(`Gem ${gemB.uid} is not combinable`);
    }

    // Record the attempt
    this.discovery.recordAttempt(gemA.affixId, gemB.affixId);

    // Layer 1: Signature recipes
    const signatureResult = this.trySignature(gemA, gemB, outputUid);
    if (signatureResult) return signatureResult;

    // Layer 2: Category combos
    const categoryResult = this.tryCategory(gemA, gemB, outputUid);
    if (categoryResult) return categoryResult;

    // Layer 3: Generic upgrade
    return this.genericUpgrade(gemA, gemB, outputUid, keepGemUid);
  }

  previewCombine(gemA: GemInstance, gemB: GemInstance): CombinePreview | null {
    if (!gemA.combinable || !gemB.combinable) return null;

    const known = this.discovery.hasAttempted(gemA.affixId, gemB.affixId);
    const tempDiscovery = this.discovery.clone();
    const tempEngine = new CombinationEngine(this.registry, tempDiscovery, this.categoryMap, this.config);

    try {
      const result = tempEngine.combine(gemA, gemB, '__preview__');
      return {
        known,
        layer: result.layer,
        gem: known ? result.gem : null,
        recipeId: known ? result.recipeId : undefined,
      };
    } catch {
      return null;
    }
  }

  combine3(
    gemA: GemInstance,
    gemB: GemInstance,
    gemC: GemInstance,
    outputUid: string,
    keepGemUid?: string,
  ): CombineResult {
    for (const g of [gemA, gemB, gemC]) {
      if (!g.combinable) throw new Error(`Gem ${g.uid} is not combinable`);
    }

    this.discovery.recordAttempt3(gemA.affixId, gemB.affixId, gemC.affixId);

    const recipe = this.registry.findTernaryRecipe(gemA, gemB, gemC);
    if (recipe) {
      const avgQ = computeAverageQualityN(gemA, gemB, gemC);
      const unanimousRarity =
        gemA.rarity === gemB.rarity && gemB.rarity === gemC.rarity;
      const boosted = applyMatchingRarityBonus(
        avgQ, unanimousRarity, this.config.matchingRarityBonus,
      );
      const { tier, rarity } = determineOutputTierRarity(boosted);

      const recipeDepth =
        Math.max(gemA.recipeDepth, gemB.recipeDepth, gemC.recipeDepth)
        + recipe.maxDepthContribution;
      const tags = [...new Set([
        ...recipe.tags, ...gemA.tags, ...gemB.tags, ...gemC.tags,
      ])];

      const isNewDiscovery = !this.discovery.isDiscovered(recipe.id);
      this.discovery.recordDiscovery(recipe.id);

      const gem = createGem(outputUid, recipe.outputAffixId, tier, rarity, {
        sourceRecipe: recipe.id,
        recipeDepth,
        tags,
        outputBonusEffects: recipe.outputBonusEffects,
      });

      return {
        gem,
        layer: 'signature',
        recipeId: recipe.id,
        isNewDiscovery,
        consumedUids: [gemA.uid, gemB.uid, gemC.uid],
      };
    }

    // 4. Fallback: KEEP-anchored pair + eject third
    const keep = keepGemUid
      ? [gemA, gemB, gemC].find(g => g.uid === keepGemUid) ?? gemA
      : gemA;
    const others = [gemA, gemB, gemC].filter(g => g.uid !== keep.uid);
    if (others.length !== 2) {
      throw new Error('combine3 fallback: expected exactly 2 non-KEEP gems');
    }
    const [o1, o2] = others;

    const layerRank: Record<CombineLayer, number> = {
      signature: 3, category: 2, generic: 1,
    };

    const probe1 = this.previewCombine(keep, o1);
    const probe2 = this.previewCombine(keep, o2);

    const cand: Array<{ other: GemInstance; preview: CombinePreview | null }> = [
      { other: o1, preview: probe1 },
      { other: o2, preview: probe2 },
    ];
    cand.sort((a, b) => {
      const la = a.preview ? layerRank[a.preview.layer] : 0;
      const lb = b.preview ? layerRank[b.preview.layer] : 0;
      if (la !== lb) return lb - la;
      const eva = calculateEffectiveValue(keep.tier, keep.rarity)
        + calculateEffectiveValue(a.other.tier, a.other.rarity);
      const evb = calculateEffectiveValue(keep.tier, keep.rarity)
        + calculateEffectiveValue(b.other.tier, b.other.rarity);
      return evb - eva;
    });

    const winner = cand[0];
    const ejected = cand[1].other;

    const binaryResult = this.combine(keep, winner.other, outputUid, keep.uid);

    return {
      ...binaryResult,
      consumedUids: [keep.uid, winner.other.uid],
      ejectedUid: ejected.uid,
    };
  }

  private trySignature(
    gemA: GemInstance,
    gemB: GemInstance,
    outputUid: string,
  ): CombineResult | null {
    const recipe = this.registry.findSignatureRecipe(gemA, gemB);
    if (!recipe) return null;

    const avgQuality = computeAverageQuality(gemA, gemB);
    const raritiesMatch = gemA.rarity === gemB.rarity;
    const boostedQuality = applyMatchingRarityBonus(
      avgQuality,
      raritiesMatch,
      this.config.matchingRarityBonus,
    );
    const { tier, rarity } = determineOutputTierRarity(boostedQuality);

    const recipeDepth =
      Math.max(gemA.recipeDepth, gemB.recipeDepth) + recipe.maxDepthContribution;

    // Merge tags: recipe tags + both input gem tags, deduplicated
    const tags = [
      ...new Set([...recipe.tags, ...gemA.tags, ...gemB.tags]),
    ];

    const isNewDiscovery = !this.discovery.isDiscovered(recipe.id);
    this.discovery.recordDiscovery(recipe.id);

    const gem = createGem(outputUid, recipe.outputAffixId, tier, rarity, {
      sourceRecipe: recipe.id,
      recipeDepth,
      tags,
      outputBonusEffects: recipe.outputBonusEffects,
    });

    return {
      gem,
      layer: 'signature',
      recipeId: recipe.id,
      isNewDiscovery,
      consumedUids: [gemA.uid, gemB.uid],
    };
  }

  private tryCategory(
    gemA: GemInstance,
    gemB: GemInstance,
    outputUid: string,
  ): CombineResult | null {
    const catA = this.categoryMap[gemA.affixId];
    const catB = this.categoryMap[gemB.affixId];

    if (!catA || !catB) return null;

    const recipe = this.registry.findCategoryRecipe(catA, catB);
    if (!recipe) return null;

    // Survivor = gem with higher effective value (ties -> gemA)
    const evA = calculateEffectiveValue(gemA.tier, gemA.rarity);
    const evB = calculateEffectiveValue(gemB.tier, gemB.rarity);
    const survivor = evA >= evB ? gemA : gemB;

    // Merge tags from both inputs
    const tags = [...new Set([...gemA.tags, ...gemB.tags])];

    const recipeDepth = Math.max(gemA.recipeDepth, gemB.recipeDepth) + 1;

    const gem = createGem(outputUid, survivor.affixId, survivor.tier, survivor.rarity, {
      recipeDepth,
      tags,
      outputBonusEffects: recipe.outputBonusEffects,
    });

    return {
      gem,
      layer: 'category',
      recipeId: recipe.id,
      isNewDiscovery: false,
      consumedUids: [gemA.uid, gemB.uid],
    };
  }

  private genericUpgrade(
    gemA: GemInstance,
    gemB: GemInstance,
    outputUid: string,
    keepGemUid?: string,
  ): CombineResult {
    const sameAffix = gemA.affixId === gemB.affixId;

    if (sameAffix) {
      return this.genericSameType(gemA, gemB, outputUid);
    } else {
      return this.genericDifferentType(gemA, gemB, outputUid, keepGemUid);
    }
  }

  private genericSameType(
    gemA: GemInstance,
    gemB: GemInstance,
    outputUid: string,
  ): CombineResult {
    const maxRarity =
      gemA.rarity === gemB.rarity
        ? gemA.rarity
        : ((): typeof gemA.rarity => {
            const idxA = this.rarityIdx(gemA.rarity);
            const idxB = this.rarityIdx(gemB.rarity);
            return idxA >= idxB ? gemA.rarity : gemB.rarity;
          })();

    const maxTier = Math.max(gemA.tier, gemB.tier) as 1 | 2 | 3 | 4 | 5;

    // Try rarity upgrade
    const upgraded = nextRarity(maxRarity);
    if (upgraded) {
      // Rarity upgrade
      const recipeDepth = Math.max(gemA.recipeDepth, gemB.recipeDepth);
      const tags = [...new Set([...gemA.tags, ...gemB.tags])];
      const gem = createGem(outputUid, gemA.affixId, maxTier, upgraded, {
        recipeDepth,
        tags,
      });
      return { gem, layer: 'generic', isNewDiscovery: false, consumedUids: [gemA.uid, gemB.uid] };
    }

    // Already legendary -> try tier upgrade
    if (maxTier < MAX_TIER) {
      const newTier = (maxTier + 1) as 1 | 2 | 3 | 4 | 5;
      const recipeDepth = Math.max(gemA.recipeDepth, gemB.recipeDepth);
      const tags = [...new Set([...gemA.tags, ...gemB.tags])];
      const gem = createGem(outputUid, gemA.affixId, newTier, maxRarity, {
        recipeDepth,
        tags,
      });
      return { gem, layer: 'generic', isNewDiscovery: false, consumedUids: [gemA.uid, gemB.uid] };
    }

    // Both maxed -- this shouldn't happen because combinable check should prevent it,
    // but handle defensively
    throw new Error('Cannot combine: both gems are at maximum tier and rarity');
  }

  private genericDifferentType(
    gemA: GemInstance,
    gemB: GemInstance,
    outputUid: string,
    keepGemUid?: string,
  ): CombineResult {
    let kept: GemInstance;

    if (keepGemUid) {
      kept = gemA.uid === keepGemUid ? gemA : gemB;
    } else {
      // Default: keep higher quality gem
      const evA = calculateEffectiveValue(gemA.tier, gemA.rarity);
      const evB = calculateEffectiveValue(gemB.tier, gemB.rarity);
      kept = evA >= evB ? gemA : gemB;
    }

    const tags = [...new Set([...gemA.tags, ...gemB.tags])];
    const recipeDepth = Math.max(gemA.recipeDepth, gemB.recipeDepth);

    if (kept.tier < MAX_TIER) {
      // Tier upgrade
      const newTier = (kept.tier + 1) as 1 | 2 | 3 | 4 | 5;
      const gem = createGem(outputUid, kept.affixId, newTier, kept.rarity, {
        recipeDepth,
        tags,
      });
      return { gem, layer: 'generic', isNewDiscovery: false, consumedUids: [gemA.uid, gemB.uid] };
    }

    // At max tier -> rarity upgrade instead
    const upgraded = nextRarity(kept.rarity);
    if (upgraded) {
      const gem = createGem(outputUid, kept.affixId, kept.tier, upgraded, {
        recipeDepth,
        tags,
      });
      return { gem, layer: 'generic', isNewDiscovery: false, consumedUids: [gemA.uid, gemB.uid] };
    }

    // Both maxed
    throw new Error('Cannot combine: kept gem is at maximum tier and rarity');
  }

  private rarityIdx(rarity: string): number {
    const order = ['common', 'uncommon', 'magic', 'rare', 'epic', 'legendary'];
    return order.indexOf(rarity);
  }
}
