import type { AggregateStats } from './stats-collector.js';

export interface BalanceIssue {
  type: 'overpowered_synergy' | 'underpicked_affix' | 'overpowered_affix' | 'unused_combination' | 'dominant_strategy';
  id: string;
  metric: string;
  value: number;
  threshold: number;
  severity: 'warning' | 'critical';
}

export function generateBalanceReport(stats: AggregateStats): BalanceIssue[] {
  const issues: BalanceIssue[] = [];

  // Synergy win rate checks
  for (const [id, winRate] of stats.synergyWinRates) {
    if (winRate > 0.60) {
      issues.push({
        type: 'overpowered_synergy',
        id,
        metric: 'synergyWinRate',
        value: winRate,
        threshold: 0.60,
        severity: 'critical',
      });
    } else if (winRate > 0.55) {
      issues.push({
        type: 'overpowered_synergy',
        id,
        metric: 'synergyWinRate',
        value: winRate,
        threshold: 0.55,
        severity: 'warning',
      });
    }
  }

  // Affix pick rate checks (underpicked)
  for (const [id, pickRate] of stats.affixPickRates) {
    if (pickRate < 0.02) {
      issues.push({
        type: 'underpicked_affix',
        id,
        metric: 'affixPickRate',
        value: pickRate,
        threshold: 0.02,
        severity: 'critical',
      });
    } else if (pickRate < 0.05) {
      issues.push({
        type: 'underpicked_affix',
        id,
        metric: 'affixPickRate',
        value: pickRate,
        threshold: 0.05,
        severity: 'warning',
      });
    }
  }

  // Affix win rate checks (overpowered)
  for (const [id, winRate] of stats.affixWinRates) {
    if (winRate > 0.65) {
      issues.push({
        type: 'overpowered_affix',
        id,
        metric: 'affixWinRate',
        value: winRate,
        threshold: 0.65,
        severity: 'critical',
      });
    } else if (winRate > 0.60) {
      issues.push({
        type: 'overpowered_affix',
        id,
        metric: 'affixWinRate',
        value: winRate,
        threshold: 0.60,
        severity: 'warning',
      });
    }
  }

  // Combination usage checks (unused)
  for (const [id, usageRate] of stats.combinationUsageRates) {
    if (usageRate < 0.005) {
      issues.push({
        type: 'unused_combination',
        id,
        metric: 'combinationUsageRate',
        value: usageRate,
        threshold: 0.005,
        severity: 'critical',
      });
    } else if (usageRate < 0.01) {
      issues.push({
        type: 'unused_combination',
        id,
        metric: 'combinationUsageRate',
        value: usageRate,
        threshold: 0.01,
        severity: 'warning',
      });
    }
  }

  // Dominant strategy check (overall win rate imbalance)
  const [p0WinPct, p1WinPct] = stats.winRate;
  if (p0WinPct > 55 || p1WinPct > 55) {
    const dominantPlayer = p0WinPct > p1WinPct ? 0 : 1;
    const dominantPct = Math.max(p0WinPct, p1WinPct);
    issues.push({
      type: 'dominant_strategy',
      id: `player_${dominantPlayer}`,
      metric: 'overallWinRate',
      value: dominantPct / 100,
      threshold: 0.55,
      severity: 'warning',
    });
  }

  return issues;
}
