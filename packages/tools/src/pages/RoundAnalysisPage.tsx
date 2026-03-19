import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { RoundStat } from '../api/client.js';
import { GlobalFilters } from '../components/GlobalFilters.js';
import type { FilterState } from '../components/GlobalFilters.js';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const THEME = {
  bg: '#0f1117',
  surface: '#18181b',
  border: '#27272a',
  text: '#e4e4e7',
  muted: '#a1a1aa',
  accent: '#6366f1',
  success: '#22c55e',
  error: '#ef4444',
} as const;

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 20,
  } as React.CSSProperties,
  section: {
    background: THEME.surface,
    border: `1px solid ${THEME.border}`,
    borderRadius: 8,
    padding: 20,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: THEME.text,
    marginBottom: 16,
  } as React.CSSProperties,
  cardsRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  card: {
    flex: '1 1 180px',
    background: THEME.bg,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  } as React.CSSProperties,
  cardLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: THEME.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  cardValue: {
    fontSize: 22,
    fontWeight: 700,
    color: THEME.text,
  } as React.CSSProperties,
  cardSub: {
    fontSize: 12,
    color: THEME.muted,
  } as React.CSSProperties,
  errorText: {
    fontSize: 13,
    color: THEME.error,
    padding: '12px 0',
  } as React.CSSProperties,
  emptyText: {
    fontSize: 13,
    color: THEME.muted,
    padding: '24px 0',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  infoBox: {
    background: THEME.bg,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: '12px 16px',
    fontSize: 13,
    color: THEME.muted,
  } as React.CSSProperties,
};

function formatTicks(ticks: number): string {
  if (ticks >= 1000) return `${(ticks / 1000).toFixed(1)}k`;
  return ticks.toFixed(0);
}

function formatDamage(dmg: number): string {
  if (dmg >= 1000) return `${(dmg / 1000).toFixed(1)}k`;
  return dmg.toFixed(0);
}

export default function RoundAnalysisPage() {
  const [filters, setFilters] = useState<FilterState>({});
  const [stats, setStats] = useState<RoundStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.reports
      .roundStats(filters.runId)
      .then((data) => setStats(data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load round stats'))
      .finally(() => setLoading(false));
  }, [filters.runId]);

  // Prepare bar chart data: one entry per round
  const chartData = stats.map((s) => ({
    name: `R${s.round}`,
    Matches: s.matchCount,
    'Avg Duration (ticks)': Math.round(s.avgDurationTicks),
    'Avg Damage': Math.round(s.avgTotalDamage),
  }));

  return (
    <div style={styles.page}>
      <GlobalFilters filters={filters} onChange={setFilters} />

      {error && <div style={styles.errorText}>{error}</div>}

      {/* Per-round stat cards */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Per-Round Statistics</div>
        {loading ? (
          <div style={styles.emptyText}>Loading…</div>
        ) : stats.length === 0 ? (
          <div style={styles.emptyText}>No round data available</div>
        ) : (
          <div style={styles.cardsRow}>
            {stats.map((s) => (
              <React.Fragment key={s.round}>
                <div style={styles.card}>
                  <span style={styles.cardLabel}>R{s.round} — Matches</span>
                  <span style={styles.cardValue}>{s.matchCount.toLocaleString()}</span>
                  <span style={styles.cardSub}>duels played</span>
                </div>
                <div style={styles.card}>
                  <span style={styles.cardLabel}>R{s.round} — Avg Duration</span>
                  <span style={styles.cardValue}>{formatTicks(s.avgDurationTicks)}</span>
                  <span style={styles.cardSub}>ticks</span>
                </div>
                <div style={styles.card}>
                  <span style={styles.cardLabel}>R{s.round} — Avg Damage</span>
                  <span style={styles.cardValue}>{formatDamage(s.avgTotalDamage)}</span>
                  <span style={styles.cardSub}>total dmg</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Side-by-side bar chart */}
      {!loading && chartData.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Round Comparison — Avg Duration (ticks)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: THEME.muted }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: THEME.muted }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: THEME.surface,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 6,
                  fontSize: 12,
                  color: THEME.text,
                }}
                cursor={{ fill: `${THEME.accent}15` }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: THEME.muted }} />
              <Bar dataKey="Avg Duration (ticks)" fill={THEME.accent} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && chartData.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Round Comparison — Avg Damage</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: THEME.muted }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: THEME.muted }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: THEME.surface,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 6,
                  fontSize: 12,
                  color: THEME.text,
                }}
                cursor={{ fill: `${THEME.accent}15` }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: THEME.muted }} />
              <Bar dataKey="Avg Damage" fill={THEME.success} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Comeback rate placeholder */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Comeback Rate</div>
        <div style={styles.infoBox}>
          Coming soon — % of matches where the R1 loser wins the match requires match-level round
          joins. This will be available once the report query aggregates across rounds per match.
        </div>
      </div>
    </div>
  );
}
