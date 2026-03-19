import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { OverviewStats } from '../api/client.js';
import { GlobalFilters } from '../components/GlobalFilters.js';
import type { FilterState } from '../components/GlobalFilters.js';
import { exportCSV } from '../utils/export.js';

const THEME = {
  bg: '#0f1117',
  surface: '#18181b',
  border: '#27272a',
  text: '#e4e4e7',
  muted: '#a1a1aa',
  accent: '#6366f1',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
} as const;

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  cardsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '12px',
  },
  card: {
    backgroundColor: THEME.surface,
    border: `1px solid ${THEME.border}`,
    borderRadius: '8px',
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  cardLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: THEME.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  cardValue: {
    fontSize: '28px',
    fontWeight: 700,
    color: THEME.text,
    lineHeight: 1.1,
  },
  cardSub: {
    fontSize: '12px',
    color: THEME.muted,
  },
  loadingState: {
    padding: '40px',
    textAlign: 'center' as const,
    color: THEME.muted,
    fontSize: '14px',
    backgroundColor: THEME.surface,
    border: `1px solid ${THEME.border}`,
    borderRadius: '8px',
  },
  errorState: {
    padding: '20px',
    color: THEME.error,
    fontSize: '14px',
    backgroundColor: THEME.surface,
    border: `1px solid ${THEME.border}`,
    borderRadius: '8px',
  },
  emptyState: {
    padding: '40px',
    textAlign: 'center' as const,
    color: THEME.muted,
    fontSize: '14px',
    backgroundColor: THEME.surface,
    border: `1px solid ${THEME.border}`,
    borderRadius: '8px',
  },
} as const;

function filterStateToParams(filters: FilterState): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.runId) params['runId'] = filters.runId;
  if (filters.configId) params['configId'] = filters.configId;
  if (filters.source) params['source'] = filters.source;
  if (filters.dateFrom) params['dateFrom'] = filters.dateFrom;
  if (filters.dateTo) params['dateTo'] = filters.dateTo;
  if (filters.winner !== undefined) params['winner'] = String(filters.winner);
  return params;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatPct(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

export default function OverviewPage() {
  const [filters, setFilters] = useState<FilterState>({});
  const [data, setData] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.reports.overview(filterStateToParams(filters))
      .then((result) => {
        setData(result);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load overview data');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <div style={styles.page}>
      <GlobalFilters filters={filters} onChange={setFilters} />

      {loading && (
        <div style={styles.loadingState}>Loading overview data…</div>
      )}

      {!loading && error && (
        <div style={styles.errorState}>Error: {error}</div>
      )}

      {!loading && !error && data && data.totalMatches === 0 && (
        <div style={styles.emptyState}>No match data found for the selected filters.</div>
      )}

      {!loading && !error && data && data.totalMatches > 0 && (
        <>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              background: '#27272a',
              border: '1px solid #3f3f46',
              borderRadius: '4px',
              color: '#a1a1aa',
              cursor: 'pointer',
            }}
            onClick={() => {
              exportCSV([{
                totalMatches: data.totalMatches,
                p0WinRate: data.p0WinRate !== null ? (data.p0WinRate * 100).toFixed(1) + '%' : '',
                p1WinRate: data.p1WinRate !== null ? (data.p1WinRate * 100).toFixed(1) + '%' : '',
                avgDurationMs: data.avgDurationMs,
                mostPickedAffix: data.mostPickedAffix ?? '',
              }], 'overview-stats');
            }}
          >
            Export CSV
          </button>
        </div>
        <div style={styles.cardsRow}>
          <div style={styles.card}>
            <span style={styles.cardLabel}>Total Matches</span>
            <span style={styles.cardValue}>{data.totalMatches.toLocaleString()}</span>
            <span style={styles.cardSub}>recorded</span>
          </div>

          <div style={styles.card}>
            <span style={styles.cardLabel}>P0 Win Rate</span>
            <span style={{
              ...styles.cardValue,
              color: data.p0WinRate !== null && data.p0WinRate > 0.52
                ? THEME.success
                : data.p0WinRate !== null && data.p0WinRate < 0.48
                  ? THEME.error
                  : THEME.text,
            }}>
              {formatPct(data.p0WinRate)}
            </span>
            <span style={styles.cardSub}>first player</span>
          </div>

          <div style={styles.card}>
            <span style={styles.cardLabel}>P1 Win Rate</span>
            <span style={{
              ...styles.cardValue,
              color: data.p1WinRate !== null && data.p1WinRate > 0.52
                ? THEME.success
                : data.p1WinRate !== null && data.p1WinRate < 0.48
                  ? THEME.error
                  : THEME.text,
            }}>
              {formatPct(data.p1WinRate)}
            </span>
            <span style={styles.cardSub}>second player</span>
          </div>

          <div style={styles.card}>
            <span style={styles.cardLabel}>Avg Duration</span>
            <span style={styles.cardValue}>{formatDuration(data.avgDurationMs)}</span>
            <span style={styles.cardSub}>per match</span>
          </div>

          <div style={styles.card}>
            <span style={styles.cardLabel}>Most Picked Affix</span>
            <span style={{
              ...styles.cardValue,
              fontSize: data.mostPickedAffix && data.mostPickedAffix.length > 10 ? '16px' : '22px',
              fontFamily: 'monospace',
            }}>
              {data.mostPickedAffix ?? '—'}
            </span>
            <span style={styles.cardSub}>by pick count</span>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
