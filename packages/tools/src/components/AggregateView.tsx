import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ScatterChart, Scatter, Cell,
} from 'recharts';
import type { SimulationResults, AffixUsageStat } from '../types';

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

interface Props {
  results: SimulationResults | null;
}

export default function AggregateView({ results }: Props) {
  const winRateData = useMemo(() => {
    if (!results) return [];
    let p0Wins = 0;
    let p1Wins = 0;
    let draws = 0;
    for (const m of results.matches) {
      if (m.winner === 0) p0Wins++;
      else if (m.winner === 1) p1Wins++;
      else draws++;
    }
    const total = results.matches.length;
    return [
      { name: `P0 (T${results.config.aiTier1})`, wins: p0Wins, rate: total > 0 ? ((p0Wins / total) * 100) : 0 },
      { name: `P1 (T${results.config.aiTier2})`, wins: p1Wins, rate: total > 0 ? ((p1Wins / total) * 100) : 0 },
      { name: 'Draw', wins: draws, rate: total > 0 ? ((draws / total) * 100) : 0 },
    ];
  }, [results]);

  const affixStats = useMemo(() => {
    if (!results) return [];
    const stats = new Map<string, { pickCount: number; winCount: number; category: string }>();
    for (const m of results.matches) {
      const allAffixes = [
        { affixes: m.player0Affixes, won: m.winner === 0 },
        { affixes: m.player1Affixes, won: m.winner === 1 },
      ];
      for (const { affixes, won } of allAffixes) {
        const unique = new Set(affixes);
        for (const id of unique) {
          const existing = stats.get(id) ?? { pickCount: 0, winCount: 0, category: '' };
          existing.pickCount++;
          if (won) existing.winCount++;
          stats.set(id, existing);
        }
      }
    }
    const totalPlayers = results.matches.length * 2;
    const items: AffixUsageStat[] = [];
    for (const [id, s] of stats) {
      items.push({
        affixId: id,
        name: id,
        category: s.category || 'unknown',
        pickCount: s.pickCount,
        pickRate: totalPlayers > 0 ? s.pickCount / totalPlayers : 0,
        winCount: s.winCount,
        winRate: s.pickCount > 0 ? s.winCount / s.pickCount : 0,
      });
    }
    items.sort((a, b) => b.pickRate - a.pickRate);
    return items;
  }, [results]);

  const scatterData = useMemo(() => {
    return affixStats.map((a) => ({
      name: a.affixId,
      usageRate: +(a.pickRate * 100).toFixed(1),
      winRate: +(a.winRate * 100).toFixed(1),
      picks: a.pickCount,
    }));
  }, [affixStats]);

  if (!results) {
    return (
      <div style={card}>
        <p style={{ color: '#71717a' }}>Run a simulation first to see analytics.</p>
      </div>
    );
  }

  const duration = ((results.completedAt - results.startedAt) / 1000).toFixed(1);

  return (
    <div>
      <h2 style={{ ...sectionTitle, fontSize: '20px', marginBottom: '8px' }}>
        Analytics
      </h2>
      <p style={{ color: '#71717a', fontSize: '13px', marginBottom: '20px', fontFamily: 'monospace' }}>
        {results.matches.length} matches | T{results.config.aiTier1} vs T{results.config.aiTier2} | {duration}s
      </p>

      {/* Win Rate Bar Chart */}
      <div style={card}>
        <h3 style={sectionTitle}>Win Rates</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={winRateData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
            <YAxis stroke="#71717a" fontSize={12} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              contentStyle={{ background: '#1a1b23', border: '1px solid #27272a', borderRadius: '6px' }}
              labelStyle={{ color: '#e4e4e7' }}
              formatter={(value: number) => [`${value.toFixed(1)}%`, 'Win Rate']}
            />
            <Bar dataKey="rate" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Affix Pick Rate */}
      <div style={card}>
        <h3 style={sectionTitle}>Affix Pick Rate (top 20)</h3>
        <ResponsiveContainer width="100%" height={Math.min(affixStats.length * 28, 600)}>
          <BarChart
            data={affixStats.slice(0, 20).map((a) => ({
              name: a.affixId,
              pickRate: +(a.pickRate * 100).toFixed(1),
              category: a.category,
            }))}
            layout="vertical"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis type="number" stroke="#71717a" fontSize={12} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" stroke="#71717a" fontSize={11} width={140} />
            <Tooltip
              contentStyle={{ background: '#1a1b23', border: '1px solid #27272a', borderRadius: '6px' }}
              labelStyle={{ color: '#e4e4e7' }}
              formatter={(value: number) => [`${value}%`, 'Pick Rate']}
            />
            <Bar dataKey="pickRate" fill="#6366f1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Affix Win Rate */}
      <div style={card}>
        <h3 style={sectionTitle}>Affix Win Rate (by usage, top 20)</h3>
        <ResponsiveContainer width="100%" height={Math.min(affixStats.length * 28, 600)}>
          <BarChart
            data={affixStats
              .filter((a) => a.pickCount >= 3)
              .sort((a, b) => b.winRate - a.winRate)
              .slice(0, 20)
              .map((a) => ({
                name: a.affixId,
                winRate: +(a.winRate * 100).toFixed(1),
              }))}
            layout="vertical"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis type="number" stroke="#71717a" fontSize={12} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" stroke="#71717a" fontSize={11} width={140} />
            <Tooltip
              contentStyle={{ background: '#1a1b23', border: '1px solid #27272a', borderRadius: '6px' }}
              labelStyle={{ color: '#e4e4e7' }}
              formatter={(value: number) => [`${value}%`, 'Win Rate']}
            />
            <ReferenceLine x={50} stroke="#ef4444" strokeDasharray="3 3" />
            <Bar dataKey="winRate" fill="#22c55e" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Usage vs Win Rate Scatter */}
      <div style={card}>
        <h3 style={sectionTitle}>Usage Rate vs Win Rate</h3>
        <ResponsiveContainer width="100%" height={350}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="usageRate"
              name="Usage %"
              stroke="#71717a"
              fontSize={12}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              dataKey="winRate"
              name="Win %"
              stroke="#71717a"
              fontSize={12}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{ background: '#1a1b23', border: '1px solid #27272a', borderRadius: '6px' }}
              labelStyle={{ color: '#e4e4e7' }}
              formatter={(value: number, name: string) => [`${value}%`, name]}
            />
            <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="3 3" />
            <Scatter data={scatterData} fill="#6366f1">
              {scatterData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.winRate > 60 ? '#ef4444' : entry.winRate < 40 ? '#3b82f6' : '#6366f1'}
                  r={Math.max(4, Math.min(12, entry.picks / 2))}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
