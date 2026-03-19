import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { DistributionData } from '../api/client.js';
import { GlobalFilters } from '../components/GlobalFilters.js';
import type { FilterState } from '../components/GlobalFilters.js';
import DamageHistogram from '../components/charts/DamageHistogram.js';

const THEME = {
  bg: '#0f1117',
  surface: '#18181b',
  border: '#27272a',
  text: '#e4e4e7',
  muted: '#a1a1aa',
  accent: '#6366f1',
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
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: 20,
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

export default function DistributionsPage() {
  const [filters, setFilters] = useState<FilterState>({});
  const [data, setData] = useState<DistributionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.reports
      .distributions(filters.runId)
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load distributions'))
      .finally(() => setLoading(false));
  }, [filters.runId]);

  return (
    <div style={styles.page}>
      <GlobalFilters filters={filters} onChange={setFilters} />

      {error && <div style={styles.errorText}>{error}</div>}

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Match Distributions</div>
        {loading ? (
          <div style={styles.emptyText}>Loading…</div>
        ) : !data ? (
          <div style={styles.emptyText}>No distribution data available</div>
        ) : (
          <div style={styles.chartsGrid}>
            <DamageHistogram
              values={data.durationMs}
              title="Match Duration (ms)"
              color={THEME.accent}
              bucketCount={20}
            />
            <DamageHistogram
              values={data.rounds}
              title="Rounds per Match"
              color="#f59e0b"
              bucketCount={10}
            />
          </div>
        )}
      </div>

      {/* Damage breakdowns notice */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Damage Breakdowns</div>
        <div style={styles.infoBox}>
          Detailed damage breakdowns and HP curves require combat log storage. Run a small sample
          with logs enabled.
        </div>
      </div>
    </div>
  );
}
