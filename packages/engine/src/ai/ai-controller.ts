import type { AITier } from '../types/ai.js';
import type { ForgeAction } from '../types/forge-action.js';
import type { BaseItemDef, Loadout } from '../types/item.js';
import type { GemInstance } from '../types/gem.js';
import type { SlotArray } from '../types/match.js';
import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import { liveSlots } from '../types/slot-array.js';
import { selectAIItems } from './item-selection.js';
import type { DraftStrategy } from './strategies/draft-strategy.js';
import type { ForgeStrategy } from './strategies/forge-strategy.js';
import {
  Tier1DraftStrategy,
  Tier2DraftStrategy,
  Tier3DraftStrategy,
  Tier4DraftStrategy,
  Tier5DraftStrategy,
} from './strategies/draft-strategy.js';
import {
  Tier1ForgeStrategy,
  Tier2ForgeStrategy,
  Tier3ForgeStrategy,
  Tier4ForgeStrategy,
  Tier5ForgeStrategy,
} from './strategies/forge-strategy.js';

/**
 * AIController dispatches to tier-appropriate strategies for draft and forge phases.
 */
export class AIController {
  private readonly draftStrategy: DraftStrategy;
  private readonly forgeStrategy: ForgeStrategy;

  constructor(
    public readonly tier: AITier,
    private readonly registry: DataRegistry,
    private readonly rng: SeededRNG,
  ) {
    this.draftStrategy = createDraftStrategy(tier);
    this.forgeStrategy = createForgeStrategy(tier);
  }

  pickOrb(
    pool: SlotArray<GemInstance>,
    myStockpile: SlotArray<GemInstance>,
    opponentStockpile: SlotArray<GemInstance>,
  ): string {
    // Strategies operate on flat gem lists — null slots don't help them reason
    // about picks. We compact here so the strategy code stays simple.
    return this.draftStrategy.pickOrb(
      liveSlots(pool),
      liveSlots(myStockpile),
      liveSlots(opponentStockpile),
      this.registry,
      this.rng,
    );
  }

  planForge(
    stockpile: SlotArray<GemInstance>,
    loadout: Loadout,
    fluxRemaining: number,
    round: number,
    opponentStockpile: SlotArray<GemInstance>,
  ): ForgeAction[] {
    return this.forgeStrategy.plan(
      liveSlots(stockpile),
      loadout,
      fluxRemaining,
      round as (1 | 2 | 3),
      liveSlots(opponentStockpile),
      this.registry,
      this.rng,
    );
  }

  selectItems(
    playerDraftedGems: Array<{ tags: string[] }>,
  ): { weapon: BaseItemDef; armor: BaseItemDef } {
    return selectAIItems(this.tier, playerDraftedGems, this.registry, this.rng);
  }
}

function createDraftStrategy(tier: AITier): DraftStrategy {
  switch (tier) {
    case 1:
      return new Tier1DraftStrategy();
    case 2:
      return new Tier2DraftStrategy();
    case 3:
      return new Tier3DraftStrategy();
    case 4:
      return new Tier4DraftStrategy();
    case 5:
      return new Tier5DraftStrategy();
  }
}

function createForgeStrategy(tier: AITier): ForgeStrategy {
  switch (tier) {
    case 1:
      return new Tier1ForgeStrategy();
    case 2:
      return new Tier2ForgeStrategy();
    case 3:
      return new Tier3ForgeStrategy();
    case 4:
      return new Tier4ForgeStrategy();
    case 5:
      return new Tier5ForgeStrategy();
  }
}
