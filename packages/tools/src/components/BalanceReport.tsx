import React, { useMemo } from 'react';
import type { SimulationResults, BalanceIssue } from '../types';

const card: React.CSSProperties = {
  background: '#1a1b23',
  border: '1px solid #27272a',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '16px',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  marginBottom: '16px',
  color: '#e4e4e7',
};

function generateBalanceReport(results: SimulationResults): BalanceIssue[] {
  const issues: BalanceIssue[] = [];
  const totalMatches = results.matches.length;
  if (totalMatches === 0) return issues;

  // Check overall win rate balance
  let p0Wins = 0;
  let p1Wins = 0;
  for (const m of results.matches) {
    if (m.winner === 0) p0Wins++;
    else if (m.winner === 1) p1Wins++;
  }

  const p0WinRate = p0Wins / totalMatches;
  if (results.config.aiTier1 === results.config.aiTier2) {
    // Same tier - should be close to 50/50
    if (Math.abs(p0WinRate - 0.5) > 0.15) {
      issues.push({
        severity: 'critical',
        type: 'general',
        id: 'first-player-advantage',
        metric: 'P0 Win Rate (same tier)',
        value: p0WinRate,
        threshold: 0.15,
        description: `Player 0 wins ${(p0WinRate * 100).toFixed(1)}% of matches at same AI tier. Expected ~50%. Possible first-player advantage.`,
      });
    } else if (Math.abs(p0WinRate - 0.5) > 0.08) {
      issues.push({
        severity: 'warning',
        type: 'general',
        id: 'first-player-advantage',
        metric: 'P0 Win Rate (same tier)',
        value: p0WinRate,
        threshold: 0.08,
        description: `Player 0 wins ${(p0WinRate * 100).toFixed(1)}% of matches at same AI tier. Slight imbalance detected.`,
      });
    }
  }

  // Affix balance analysis
  const affixStats = new Map<string, { picks: number; wins: number }>();
  for (const m of results.matches) {
    for (const { affixes, won } of [
      { affixes: m.player0Affixes, won: m.winner === 0 },
      { affixes: m.player1Affixes, won: m.winner === 1 },
    ]) {
      for (const id of new Set(affixes)) {
        const s = affixStats.get(id) ?? { picks: 0, wins: 0 };
        s.picks++;
        if (won) s.wins++;
        affixStats.set(id, s);
      }
    }
  }

  const totalPlayers = totalMatches * 2;
  const minSampleSize = Math.max(5, totalMatches * 0.1);

  for (const [id, stat] of affixStats) {
    if (stat.picks < minSampleSize) continue;

    const winRate = stat.wins / stat.picks;
    const pickRate = stat.picks / totalPlayers;

    // Overpowered affix: high win rate
    if (winRate > 0.7) {
      issues.push({
        severity: 'critical',
        type: 'affix',
        id,
        metric: 'Win Rate',
        value: winRate,
        threshold: 0.7,
        description: `Affix "${id}" has ${(winRate * 100).toFixed(1)}% win rate (${stat.picks} games). Likely overpowered.`,
      });
    } else if (winRate > 0.6) {
      issues.push({
        severity: 'warning',
        type: 'affix',
        id,
        metric: 'Win Rate',
        value: winRate,
        threshold: 0.6,
        description: `Affix "${id}" has ${(winRate * 100).toFixed(1)}% win rate (${stat.picks} games). Above average.`,
      });
    }

    // Underpowered affix: low win rate
    if (winRate < 0.3) {
      issues.push({
        severity: 'critical',
        type: 'affix',
        id,
        metric: 'Win Rate (low)',
        value: winRate,
        threshold: 0.3,
        description: `Affix "${id}" has only ${(winRate * 100).toFixed(1)}% win rate (${stat.picks} games). Likely underpowered.`,
      });
    } else if (winRate < 0.4) {
      issues.push({
        severity: 'warning',
        type: 'affix',
        id,
        metric: 'Win Rate (low)',
        value: winRate,
        threshold: 0.4,
        description: `Affix "${id}" has ${(winRate * 100).toFixed(1)}% win rate (${stat.picks} games). Below average.`,
      });
    }

    // Dominant pick rate
    if (pickRate > 0.6) {
      issues.push({
        severity: 'critical',
        type: 'affix',
        id,
        metric: 'Pick Rate',
        value: pickRate,
        threshold: 0.6,
        description: `Affix "${id}" appears in ${(pickRate * 100).toFixed(1)}% of loadouts. May be must-pick.`,
      });
    } else if (pickRate > 0.45) {
      issues.push({
        severity: 'warning',
        type: 'affix',
        id,
        metric: 'Pick Rate',
        value: pickRate,
        threshold: 0.45,
        description: `Affix "${id}" appears in ${(pickRate * 100).toFixed(1)}% of loadouts. High pick rate.`,
      });
    }
  }

  // Sort: critical first, then warning
  issues.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  return issues;
}

interface Props {
  results: SimulationResults | null;
}

export default function BalanceReport({ results }: Props) {
  const issues = useMemo(() => {
    if (!results) return [];
    return generateBalanceReport(results);
  }, [results]);

  if (!results) {
    return (
      <div style={card}>
        <p style={{ color: '#71717a' }}>Run a simulation first to see the balance report.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ ...sectionTitle, fontSize: '20px', marginBottom: '16px' }}>Balance Report</h2>
      <p style={{ color: '#71717a', fontSize: '13px', marginBottom: '20px', fontFamily: 'monospace' }}>
        {results.matches.length} matches analyzed | {issues.length} issue{issues.length !== 1 ? 's' : ''} found
      </p>

      {issues.length === 0 ? (
        <div style={card}>
          <p style={{ color: '#22c55e', fontSize: '14px' }}>
            No balance issues detected. All metrics within acceptable thresholds.
          </p>
        </div>
      ) : (
        issues.map((issue, i) => (
          <div
            key={i}
            style={{
              ...card,
              borderLeft: `4px solid ${issue.severity === 'critical' ? '#ef4444' : '#eab308'}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  background: issue.severity === 'critical' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                  color: issue.severity === 'critical' ? '#ef4444' : '#eab308',
                }}>
                  {issue.severity}
                </span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#6366f1',
                }}>
                  {issue.type}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 600, color: '#e4e4e7' }}>
                  {issue.id}
                </span>
              </div>
              <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#71717a' }}>
                {issue.metric}: {typeof issue.value === 'number' ? (issue.value * 100).toFixed(1) + '%' : issue.value}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#a1a1aa', lineHeight: '1.5' }}>
              {issue.description}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
