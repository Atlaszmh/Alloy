import type { MatchState } from '../types/match.js';
import type { MatchReport, PlayerReport, RoundReport } from '../types/match-report.js';
import type { Loadout } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import { collectAffixIds, isSynergyActive } from '../forge/stat-calculator.js';

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

  const players: PlayerReport[] = ([0, 1] as const).map((playerIndex) => {
    const loadout = state.players[playerIndex].loadout;
    const affixIds = collectAffixIds(loadout);
    const combinationIds = collectCompoundIds(loadout);
    const synergyIds = registry ? collectActiveSynergies(loadout, registry) : [];
    const finalHP = lastRound ? lastRound.finalHP[playerIndex] : 0;

    return {
      playerIndex,
      finalHP,
      affixIds,
      combinationIds,
      synergyIds,
      loadout,
    };
  });

  const roundDetails: RoundReport[] = state.roundResults.map((r) => ({
    round: r.round,
    winner: r.winner,
    durationTicks: r.tickCount,
    p0HpFinal: r.finalHP[0],
    p1HpFinal: r.finalHP[1],
    p0DamageDealt: r.p0DamageDealt,
    p1DamageDealt: r.p1DamageDealt,
  }));

  return {
    seed,
    source,
    winner,
    rounds,
    durationMs,
    players,
    roundDetails,
  };
}

function collectCompoundIds(loadout: Loadout): string[] {
  const ids: string[] = [];
  for (const item of [loadout.weapon, loadout.armor]) {
    for (const slot of item.slots) {
      if (!slot) continue;
      if (slot.kind === 'compound') {
        ids.push(slot.compoundId);
      }
    }
  }
  return ids;
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
