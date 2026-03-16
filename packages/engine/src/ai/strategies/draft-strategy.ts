import type { OrbInstance } from '../../types/orb.js';
import type { DataRegistry } from '../../data/registry.js';
import type { SeededRNG } from '../../rng/seeded-rng.js';
import { ARCHETYPE_TAGS } from '../../pool/archetype-validator.js';
import type { ArchetypeId } from '../../pool/archetype-validator.js';
import {
  archetypeMatch,
  orbValueScore,
  synergyPotential,
  denialValue,
  bestArchetype,
} from '../evaluation.js';

export interface DraftStrategy {
  pickOrb(
    pool: OrbInstance[],
    myStockpile: OrbInstance[],
    opponentStockpile: OrbInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
  ): string;
}

/**
 * Tier 1 (Apprentice) Draft Strategy:
 * Pick the highest tier orb available. If tied, pick randomly among ties.
 */
export class Tier1DraftStrategy implements DraftStrategy {
  pickOrb(
    pool: OrbInstance[],
    _myStockpile: OrbInstance[],
    _opponentStockpile: OrbInstance[],
    _registry: DataRegistry,
    rng: SeededRNG,
  ): string {
    if (pool.length === 0) throw new Error('Cannot pick from empty pool');

    let maxTier = 0;
    for (const orb of pool) {
      if (orb.tier > maxTier) maxTier = orb.tier;
    }

    const topOrbs = pool.filter((o) => o.tier === maxTier);
    const pick = topOrbs[rng.nextInt(0, topOrbs.length - 1)];
    return pick.uid;
  }
}

/**
 * Tier 2 (Journeyman) Draft Strategy:
 * Greedy single archetype. On first pick, choose a random archetype.
 * Then pick orbs matching that archetype's tags.
 * If no matching orbs, fall back to highest tier.
 */
export class Tier2DraftStrategy implements DraftStrategy {
  private chosenArchetype: ArchetypeId | null = null;
  private tier1Fallback = new Tier1DraftStrategy();

  pickOrb(
    pool: OrbInstance[],
    myStockpile: OrbInstance[],
    opponentStockpile: OrbInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
  ): string {
    if (pool.length === 0) throw new Error('Cannot pick from empty pool');

    // On first pick, choose a random archetype
    if (this.chosenArchetype === null) {
      const archetypes = Object.keys(ARCHETYPE_TAGS) as ArchetypeId[];
      this.chosenArchetype = archetypes[rng.nextInt(0, archetypes.length - 1)];
    }

    // Find orbs matching the chosen archetype
    const matching = pool.filter((orb) => archetypeMatch(orb, this.chosenArchetype!, registry));

    if (matching.length > 0) {
      // Among matching orbs, pick highest tier; break ties randomly
      let maxTier = 0;
      for (const orb of matching) {
        if (orb.tier > maxTier) maxTier = orb.tier;
      }
      const topMatching = matching.filter((o) => o.tier === maxTier);
      const pick = topMatching[rng.nextInt(0, topMatching.length - 1)];
      return pick.uid;
    }

    // Fall back to highest tier
    return this.tier1Fallback.pickOrb(pool, myStockpile, opponentStockpile, registry, rng);
  }
}

/**
 * Tier 3 (Artisan) Draft Strategy:
 * Synergy-aware picking. Picks orbs that best fit the emerging build.
 * Mild denial: occasionally denies the opponent's key orbs.
 */
export class Tier3DraftStrategy implements DraftStrategy {
  private chosenArchetype: ArchetypeId | null = null;

  pickOrb(
    pool: OrbInstance[],
    myStockpile: OrbInstance[],
    opponentStockpile: OrbInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
  ): string {
    if (pool.length === 0) throw new Error('Cannot pick from empty pool');

    // On first pick, choose the archetype with most available orbs in the pool
    if (this.chosenArchetype === null) {
      if (myStockpile.length > 0) {
        this.chosenArchetype = bestArchetype(myStockpile, registry);
      } else {
        const archetypes = Object.keys(ARCHETYPE_TAGS) as ArchetypeId[];
        let bestArch = archetypes[0];
        let bestCount = 0;
        for (const arch of archetypes) {
          let count = 0;
          for (const orb of pool) {
            if (archetypeMatch(orb, arch, registry)) count++;
          }
          if (count > bestCount) {
            bestCount = count;
            bestArch = arch;
          }
        }
        this.chosenArchetype = bestArch;
      }
    }

    // Score each orb
    let bestUid = pool[0].uid;
    let bestScore = -Infinity;

    for (const orb of pool) {
      let score = orbValueScore(orb, registry);

      // Synergy with own stockpile
      score += synergyPotential(orb, myStockpile, registry);

      // Archetype match bonus
      if (archetypeMatch(orb, this.chosenArchetype!, registry)) {
        score += orbValueScore(orb, registry) * 0.5;
      }

      // Mild denial: 30% chance to consider denial value
      if (opponentStockpile.length > 0 && rng.nextBool(0.3)) {
        score += denialValue(orb, opponentStockpile, registry) * 0.5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestUid = orb.uid;
      }
    }

    return bestUid;
  }
}

/**
 * Tier 4 (Master) Draft Strategy:
 * Multi-path evaluation. Weighs denial vs build value per pick.
 * Evaluates each available orb's value for own build AND denial value.
 */
export class Tier4DraftStrategy implements DraftStrategy {
  private chosenArchetype: ArchetypeId | null = null;

  pickOrb(
    pool: OrbInstance[],
    myStockpile: OrbInstance[],
    opponentStockpile: OrbInstance[],
    registry: DataRegistry,
    _rng: SeededRNG,
  ): string {
    if (pool.length === 0) throw new Error('Cannot pick from empty pool');

    // Commit to best archetype early (based on pool availability)
    if (this.chosenArchetype === null) {
      if (myStockpile.length >= 2) {
        this.chosenArchetype = bestArchetype(myStockpile, registry);
      } else {
        // Evaluate which archetype has the most high-value orbs in the pool
        const archetypes = Object.keys(ARCHETYPE_TAGS) as ArchetypeId[];
        let bestArch = archetypes[0];
        let bestArchScore = -Infinity;
        for (const arch of archetypes) {
          let archScore = 0;
          for (const orb of pool) {
            if (archetypeMatch(orb, arch, registry)) {
              archScore += orbValueScore(orb, registry);
            }
          }
          if (archScore > bestArchScore) {
            bestArchScore = archScore;
            bestArch = arch;
          }
        }
        this.chosenArchetype = bestArch;
      }
    }

    let bestUid = pool[0].uid;
    let bestScore = -Infinity;

    for (const orb of pool) {
      // Build value: base orb value + synergy with stockpile
      let buildValue = orbValueScore(orb, registry);
      buildValue += synergyPotential(orb, myStockpile, registry);

      // Strong archetype coherence bonus (higher than T3)
      if (archetypeMatch(orb, this.chosenArchetype!, registry)) {
        buildValue += orbValueScore(orb, registry) * 1.0;
      }

      // Tier bonus: prefer higher tier orbs within the archetype
      buildValue += orb.tier * 2;

      // Denial value: considered but with lower weight
      let denial = 0;
      if (opponentStockpile.length > 0) {
        denial = denialValue(orb, opponentStockpile, registry);
      }

      // Build is primary, denial is secondary
      const totalScore = buildValue * 1.0 + denial * 0.3;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestUid = orb.uid;
      }
    }

    return bestUid;
  }
}

/**
 * Tier 5 (Alloy) Draft Strategy:
 * Full scoring with lookahead. Evaluates every pick's impact on own build
 * plus denial value. Highest possible play.
 */
export class Tier5DraftStrategy implements DraftStrategy {
  pickOrb(
    pool: OrbInstance[],
    myStockpile: OrbInstance[],
    opponentStockpile: OrbInstance[],
    registry: DataRegistry,
    _rng: SeededRNG,
  ): string {
    if (pool.length === 0) throw new Error('Cannot pick from empty pool');

    // Evaluate all archetypes and pick the best one dynamically
    const archetypes = Object.keys(ARCHETYPE_TAGS) as ArchetypeId[];
    let bestUid = pool[0].uid;
    let bestScore = -Infinity;

    for (const orb of pool) {
      // Score the orb under all possible archetypes, pick the max
      let maxArchScore = 0;
      for (const arch of archetypes) {
        let archScore = 0;
        if (archetypeMatch(orb, arch, registry)) {
          // Count existing stockpile orbs in this archetype
          let matchCount = 0;
          for (const existing of myStockpile) {
            if (archetypeMatch(existing, arch, registry)) matchCount++;
          }
          // Value grows with focus (more orbs in the archetype = more value)
          archScore = (matchCount + 1) * orbValueScore(orb, registry) * 0.3;
        }
        if (archScore > maxArchScore) maxArchScore = archScore;
      }

      // Base value + synergy + archetype coherence
      let buildValue = orbValueScore(orb, registry);
      buildValue += synergyPotential(orb, myStockpile, registry);
      buildValue += maxArchScore;

      // Lookahead: consider what combinations become possible with this orb
      // and the remaining pool
      const futureStockpile = [...myStockpile, orb];
      let futureComboBonus = 0;
      for (const futureOrb of pool) {
        if (futureOrb.uid === orb.uid) continue;
        for (const existing of futureStockpile) {
          const combo = registry.getCombination(futureOrb.affixId, existing.affixId);
          if (combo) {
            futureComboBonus += 1.0; // Each future combo opportunity counts
          }
        }
      }
      buildValue += futureComboBonus * 0.5;

      // Full denial evaluation
      let denial = 0;
      if (opponentStockpile.length > 0) {
        denial = denialValue(orb, opponentStockpile, registry);
      }

      const totalScore = buildValue * 1.0 + denial * 0.8;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestUid = orb.uid;
      }
    }

    return bestUid;
  }
}
