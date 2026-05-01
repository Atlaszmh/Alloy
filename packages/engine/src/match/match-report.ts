import type { MatchState } from '../types/match.js';
import type { MatchReport, PlayerReport, RoundReport } from '../types/match-report.js';
import type { DerivedStats } from '../types/derived-stats.js';
import type { Loadout } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import { collectAffixIds, isSynergyActive, calculateStats } from '../forge/stat-calculator.js';

/**
 * Extract a standardized MatchReport from a completed MatchState.
 */
export function extractMatchReport(
  state: MatchState,
  source: 'simulation' | 'live',
  seed?: number,
  registry?: DataRegistry,
): MatchReport {
  const phase = state.phase;
  let winner: 0 | 1 | null = null;
  if (phase.kind === 'complete') {
    winner = phase.winner === 'draw' ? null : phase.winner;
  }

  const rounds = state.roundResults.length;
  const durationMs = state.roundResults.reduce((sum, r) => sum + r.duration * 1000, 0);

  const lastRound = state.roundResults.length > 0
    ? state.roundResults[state.roundResults.length - 1]
    : undefined;

  const recipeRegistry = registry?.getRecipeRegistry();
  const players: PlayerReport[] = ([0, 1] as const).map((playerIndex) => {
    const loadout = state.players[playerIndex].loadout;
    const affixIds = collectAffixIds(loadout);
    const combinationIds = collectCompoundIds(loadout, recipeRegistry);
    const synergyIds = registry ? collectActiveSynergies(loadout, registry) : [];
    const finalHP = lastRound ? lastRound.finalHP[playerIndex] : 0;

    return {
      playerIndex,
      finalHP,
      affixIds,
      combinationIds,
      synergyIds,
      loadout,
      genericUpgradeCount: countGenericUpgrades(loadout),
    };
  });

  const roundDetails: RoundReport[] = state.roundResults.map((r) => ({
    round: r.round,
    winner: r.winner,
    duration: r.duration,
    p0HpFinal: r.finalHP[0],
    p1HpFinal: r.finalHP[1],
    p0DamageDealt: r.p0DamageDealt,
    p1DamageDealt: r.p1DamageDealt,
  }));

  // Include combat logs if available
  const combatLogs = state.duelLogs.length > 0 ? state.duelLogs : undefined;

  // Compute player stats if registry is available
  let playerStats: [DerivedStats | null, DerivedStats | null] | undefined;
  if (registry) {
    try {
      const s0 = calculateStats(state.players[0].loadout, registry);
      const s1 = calculateStats(state.players[1].loadout, registry);
      playerStats = [s0.stats, s1.stats];
    } catch {
      playerStats = [null, null];
    }
  }

  return {
    seed,
    source,
    winner,
    rounds,
    durationMs,
    players,
    roundDetails,
    combatLogs,
    playerStats,
  };
}

/**
 * Collect compound recipe IDs from a loadout.
 *
 * A "compound" is any socketed gem whose `sourceRecipe` matches a real recipe
 * in the registry. Falls back to checking `affixId` against recipe outputs
 * for gems that don't carry sourceRecipe metadata. Deduplicated; ordering not
 * guaranteed.
 */
function collectCompoundIds(loadout: Loadout, recipeRegistry?: { get(id: string): unknown; getAll(): { outputAffixId: string; id: string }[] }): string[] {
  if (!recipeRegistry) return [];
  const ids = new Set<string>();
  const recipes = recipeRegistry.getAll();
  const outputToRecipeId = new Map<string, string>();
  for (const r of recipes) outputToRecipeId.set(r.outputAffixId, r.id);

  for (const item of [loadout.weapon, loadout.armor]) {
    for (const slot of item.slots) {
      if (!slot) continue;
      const gem = slot.gem;
      if (gem.sourceRecipe && recipeRegistry.get(gem.sourceRecipe)) {
        ids.add(gem.sourceRecipe);
      } else if (outputToRecipeId.has(gem.affixId)) {
        ids.add(outputToRecipeId.get(gem.affixId)!);
      }
    }
  }
  return Array.from(ids);
}

/**
 * Count "generic upgrade" gems — combined gems that bumped a tier without
 * matching a recipe. Detected via recipeDepth > 0 with no sourceRecipe.
 */
function countGenericUpgrades(loadout: Loadout): number {
  let count = 0;
  for (const item of [loadout.weapon, loadout.armor]) {
    for (const slot of item.slots) {
      if (!slot) continue;
      const gem = slot.gem;
      if (gem.recipeDepth > 0 && !gem.sourceRecipe) count++;
    }
  }
  return count;
}

function collectActiveSynergies(loadout: Loadout, registry: DataRegistry): string[] {
  const affixIds = collectAffixIds(loadout);
  const active: string[] = [];
  for (const synergy of registry.getAllSynergies()) {
    if (isSynergyActive(synergy.requiredAffixes, affixIds)) {
      active.push(synergy.id);
    }
  }
  return active;
}
