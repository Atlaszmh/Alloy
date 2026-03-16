import type { AITier } from '../types/ai.js';
import type { CombatLog } from '../types/combat.js';
import type { ForgeAction } from '../types/forge-action.js';
import type { Loadout } from '../types/item.js';
import type { OrbInstance } from '../types/orb.js';
import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { DraftStrategy } from './strategies/draft-strategy.js';
import type { ForgeStrategy } from './strategies/forge-strategy.js';
import type { AdaptStrategy } from './strategies/adapt-strategy.js';
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
import {
  Tier1AdaptStrategy,
  Tier2AdaptStrategy,
  Tier3AdaptStrategy,
  Tier4AdaptStrategy,
  Tier5AdaptStrategy,
} from './strategies/adapt-strategy.js';

/**
 * AIController dispatches to tier-appropriate strategies for draft, forge, and adapt phases.
 */
export class AIController {
  private readonly draftStrategy: DraftStrategy;
  private readonly forgeStrategy: ForgeStrategy;
  private readonly adaptStrategy: AdaptStrategy;

  constructor(
    public readonly tier: AITier,
    private readonly registry: DataRegistry,
    private readonly rng: SeededRNG,
  ) {
    this.draftStrategy = createDraftStrategy(tier);
    this.forgeStrategy = createForgeStrategy(tier);
    this.adaptStrategy = createAdaptStrategy(tier);
  }

  pickOrb(
    pool: OrbInstance[],
    myStockpile: OrbInstance[],
    opponentStockpile: OrbInstance[],
  ): string {
    return this.draftStrategy.pickOrb(pool, myStockpile, opponentStockpile, this.registry, this.rng);
  }

  planForge(
    stockpile: OrbInstance[],
    loadout: Loadout,
    fluxRemaining: number,
    round: 1 | 2 | 3,
    opponentStockpile: OrbInstance[],
  ): ForgeAction[] {
    return this.forgeStrategy.plan(
      stockpile,
      loadout,
      fluxRemaining,
      round,
      opponentStockpile,
      this.registry,
      this.rng,
    );
  }

  planAdapt(
    previousLog: CombatLog,
    opponentLoadout: Loadout,
    myLoadout: Loadout,
    myStockpile: OrbInstance[],
    fluxRemaining: number,
    myPlayerIdx: 0 | 1,
  ): ForgeAction[] {
    return this.adaptStrategy.adapt(
      previousLog,
      opponentLoadout,
      myLoadout,
      myStockpile,
      fluxRemaining,
      myPlayerIdx,
      this.registry,
      this.rng,
    );
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

function createAdaptStrategy(tier: AITier): AdaptStrategy {
  switch (tier) {
    case 1:
      return new Tier1AdaptStrategy();
    case 2:
      return new Tier2AdaptStrategy();
    case 3:
      return new Tier3AdaptStrategy();
    case 4:
      return new Tier4AdaptStrategy();
    case 5:
      return new Tier5AdaptStrategy();
  }
}
