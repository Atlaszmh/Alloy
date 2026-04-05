import type { AITier, MatchReport } from '@alloy/engine';

export type { MatchReport } from '@alloy/engine';

export interface SimulationConfig {
  matchCount: number;
  aiTier1: AITier;
  aiTier2: AITier;
  startingSeed: number;
}

export interface SimulationResults {
  config: SimulationConfig;
  matches: MatchReport[];
  startedAt: number;
  completedAt: number;
}

export interface AffixUsageStat {
  affixId: string;
  name: string;
  category: string;
  pickCount: number;
  pickRate: number;
  winCount: number;
  winRate: number;
}

export interface SynergyWinStat {
  synergyId: string;
  appearances: number;
  wins: number;
  winRate: number;
}

export interface BalanceIssue {
  severity: 'warning' | 'critical';
  type: 'affix' | 'synergy' | 'general';
  id: string;
  metric: string;
  value: number;
  threshold: number;
  description: string;
}

export type TabId =
  | 'overview'
  | 'simulation'
  | 'quicksim'
  | 'config'
  | 'analytics'
  | 'balance'
  | 'rounds'
  | 'distributions'
  | 'meta'
  | 'inspector';
