import type { MatchReport } from '../types/match-report.js';

export interface AggregateStats {
  totalMatches: number;
  player0Wins: number;
  player1Wins: number;
  draws: number;
  winRate: [number, number]; // [p0 win%, p1 win%]

  affixPickRates: Map<string, number>;        // affixId -> % of matches where it was used
  affixWinRates: Map<string, number>;         // affixId -> win% when used
  synergyActivationRates: Map<string, number>; // synergyId -> % of matches where active
  synergyWinRates: Map<string, number>;       // synergyId -> win% when active
  combinationUsageRates: Map<string, number>; // compoundId -> % of matches where used
  combinationWinRates: Map<string, number>;   // compoundId -> win% when used

  avgMatchDuration: number;    // average rounds
  avgDuelTickCount: number;    // average ticks per duel
}

export function computeAggregateStats(matches: MatchReport[]): AggregateStats {
  const totalMatches = matches.length;
  if (totalMatches === 0) {
    return {
      totalMatches: 0,
      player0Wins: 0,
      player1Wins: 0,
      draws: 0,
      winRate: [0, 0],
      affixPickRates: new Map(),
      affixWinRates: new Map(),
      synergyActivationRates: new Map(),
      synergyWinRates: new Map(),
      combinationUsageRates: new Map(),
      combinationWinRates: new Map(),
      avgMatchDuration: 0,
      avgDuelTickCount: 0,
    };
  }

  let player0Wins = 0;
  let player1Wins = 0;
  let draws = 0;

  // Track affix usage: affixId -> { picks: number, wins: number }
  const affixStats = new Map<string, { picks: number; wins: number }>();
  // Track synergy activation: synergyId -> { activations: number, wins: number }
  const synergyStats = new Map<string, { activations: number; wins: number }>();
  // Track combination usage: compoundId -> { uses: number, wins: number }
  const combinationStats = new Map<string, { uses: number; wins: number }>();

  let totalRounds = 0;
  let totalTicks = 0;
  let totalDuels = 0;

  for (const match of matches) {
    // Win counting
    if (match.winner === 0) player0Wins++;
    else if (match.winner === 1) player1Wins++;
    else draws++;

    totalRounds += match.rounds;
    for (const round of match.roundDetails) {
      totalTicks += round.durationTicks;
      totalDuels++;
    }

    // Affix tracking per player
    for (const playerIdx of [0, 1] as const) {
      const player = match.players[playerIdx];
      const affixes = player.affixIds;
      const synergies = player.synergyIds;
      const combinations = player.combinationIds;
      const isWinner = match.winner === playerIdx;

      // Deduplicate affixes per match for pick rate
      const uniqueAffixes = new Set(affixes);
      for (const affixId of uniqueAffixes) {
        const entry = affixStats.get(affixId) ?? { picks: 0, wins: 0 };
        entry.picks++;
        if (isWinner) entry.wins++;
        affixStats.set(affixId, entry);
      }

      // Synergies
      const uniqueSynergies = new Set(synergies);
      for (const synergyId of uniqueSynergies) {
        const entry = synergyStats.get(synergyId) ?? { activations: 0, wins: 0 };
        entry.activations++;
        if (isWinner) entry.wins++;
        synergyStats.set(synergyId, entry);
      }

      // Combinations
      const uniqueCombinations = new Set(combinations);
      for (const compoundId of uniqueCombinations) {
        const entry = combinationStats.get(compoundId) ?? { uses: 0, wins: 0 };
        entry.uses++;
        if (isWinner) entry.wins++;
        combinationStats.set(compoundId, entry);
      }
    }
  }

  // Compute rates
  // Each match has 2 players, so the denominator for pick rate is totalMatches * 2
  const playerInstances = totalMatches * 2;

  const affixPickRates = new Map<string, number>();
  const affixWinRates = new Map<string, number>();
  for (const [id, stats] of affixStats) {
    affixPickRates.set(id, stats.picks / playerInstances);
    affixWinRates.set(id, stats.picks > 0 ? stats.wins / stats.picks : 0);
  }

  const synergyActivationRates = new Map<string, number>();
  const synergyWinRates = new Map<string, number>();
  for (const [id, stats] of synergyStats) {
    synergyActivationRates.set(id, stats.activations / playerInstances);
    synergyWinRates.set(id, stats.activations > 0 ? stats.wins / stats.activations : 0);
  }

  const combinationUsageRates = new Map<string, number>();
  const combinationWinRates = new Map<string, number>();
  for (const [id, stats] of combinationStats) {
    combinationUsageRates.set(id, stats.uses / playerInstances);
    combinationWinRates.set(id, stats.uses > 0 ? stats.wins / stats.uses : 0);
  }

  const totalNonDraw = player0Wins + player1Wins;
  const winRate: [number, number] = totalNonDraw > 0
    ? [player0Wins / totalMatches * 100, player1Wins / totalMatches * 100]
    : [0, 0];

  return {
    totalMatches,
    player0Wins,
    player1Wins,
    draws,
    winRate,
    affixPickRates,
    affixWinRates,
    synergyActivationRates,
    synergyWinRates,
    combinationUsageRates,
    combinationWinRates,
    avgMatchDuration: totalRounds / totalMatches,
    avgDuelTickCount: totalDuels > 0 ? totalTicks / totalDuels : 0,
  };
}
