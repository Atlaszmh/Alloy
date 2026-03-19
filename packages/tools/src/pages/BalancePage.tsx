import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { AffixStat, MatchupData, OverviewStats } from '../api/client.js';
import { GlobalFilters } from '../components/GlobalFilters.js';
import type { FilterState } from '../components/GlobalFilters.js';
import WinRateMatrix from '../components/charts/WinRateMatrix.js';
import MatchupHeatmap from '../components/charts/MatchupHeatmap.js';

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
  section: {
    backgroundColor: THEME.surface,
    border: `1px solid ${THEME.border}`,
    borderRadius: '8px',
    padding: '20px',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: THEME.text,
    marginBottom: '16px',
  },
  loadingState: {
    padding: '20px',
    color: THEME.muted,
    fontSize: '13px',
    textAlign: 'center' as const,
  },
  errorState: {
    padding: '12px',
    color: THEME.error,
    fontSize: '13px',
  },
  advantageRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  advantageLabel: {
    fontSize: '13px',
    color: THEME.muted,
  },
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '999px',
    fontSize: '14px',
    fontWeight: 700,
    backgroundColor: color + '22',
    color: color,
    border: `1px solid ${color}44`,
  }),
  flagList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  flagItem: (color: string) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    backgroundColor: color + '14',
    border: `1px solid ${color}33`,
    borderRadius: '6px',
    fontSize: '13px',
    color: THEME.text,
  }),
  flagDot: (color: string) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: color,
    flexShrink: 0,
  }),
  flagMeta: {
    fontSize: '11px',
    color: THEME.muted,
    marginLeft: 'auto',
  },
  emptyFlags: {
    fontSize: '13px',
    color: THEME.muted,
    padding: '8px 0',
  },
} as const;

function advantageColor(p0WinRate: number | null): string {
  if (p0WinRate === null) return THEME.muted;
  if (p0WinRate >= 0.48 && p0WinRate <= 0.52) return THEME.success;
  if (p0WinRate >= 0.45 && p0WinRate <= 0.55) return THEME.warning;
  return THEME.error;
}

function advantageLabel(p0WinRate: number | null): string {
  if (p0WinRate === null) return 'No data';
  const pct = (p0WinRate * 100).toFixed(1);
  if (p0WinRate >= 0.48 && p0WinRate <= 0.52) return `Balanced (P0: ${pct}%)`;
  if (p0WinRate >= 0.45 && p0WinRate <= 0.55) return `Slight advantage (P0: ${pct}%)`;
  return `Significant imbalance (P0: ${pct}%)`;
}

interface FlaggedAffix {
  affixId: string;
  pickRate: number;
  reason: 'must-pick' | 'never-pick';
}

export default function BalancePage() {
  const [filters, setFilters] = useState<FilterState>({});
  const [affixStats, setAffixStats] = useState<AffixStat[]>([]);
  const [matchupData, setMatchupData] = useState<MatchupData>({ archetypes: [], matrix: [] });
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const runId = filters.runId;

    Promise.all([
      api.reports.affixStats(runId),
      api.reports.matchups(runId),
      api.reports.overview(buildOverviewParams(filters)),
    ])
      .then(([affix, matchup, ov]) => {
        setAffixStats(Array.isArray(affix) ? affix : []);
        setMatchupData(matchup ?? { archetypes: [], matrix: [] });
        setOverview(ov);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load balance data');
      })
      .finally(() => setLoading(false));
  }, [filters]);

  const totalMatches = overview?.totalMatches ?? 0;
  const playerSlots = totalMatches * 2;

  const flaggedAffixes: FlaggedAffix[] = affixStats
    .filter(() => playerSlots > 0)
    .map((a) => {
      const pickRate = playerSlots > 0 ? a.pickCount / playerSlots : 0;
      return { affixId: a.affixId, pickRate };
    })
    .filter(({ pickRate }) => pickRate > 0.6 || pickRate < 0.05)
    .map(({ affixId, pickRate }) => ({
      affixId,
      pickRate,
      reason: pickRate > 0.6 ? ('must-pick' as const) : ('never-pick' as const),
    }))
    .sort((a, b) => {
      // must-picks first, then never-picks
      if (a.reason !== b.reason) return a.reason === 'must-pick' ? -1 : 1;
      return a.reason === 'must-pick' ? b.pickRate - a.pickRate : a.pickRate - b.pickRate;
    });

  const p0WinRate = overview?.p0WinRate ?? null;
  const badgeColor = advantageColor(p0WinRate);

  return (
    <div style={styles.page}>
      <GlobalFilters filters={filters} onChange={setFilters} />

      {loading && (
        <div style={{ ...styles.section, ...styles.loadingState }}>
          Loading balance data…
        </div>
      )}

      {!loading && error && (
        <div style={styles.section}>
          <div style={styles.errorState}>Error: {error}</div>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* First-player advantage indicator */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>First-Player Advantage</div>
            <div style={styles.advantageRow}>
              <span style={styles.advantageLabel}>P0 Win Rate:</span>
              <span style={styles.badge(badgeColor)}>
                {advantageLabel(p0WinRate)}
              </span>
            </div>
          </div>

          {/* Must-pick / Never-pick */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Must-Pick / Never-Pick Flags</div>
            {flaggedAffixes.length === 0 ? (
              <div style={styles.emptyFlags}>
                {totalMatches === 0
                  ? 'No match data available.'
                  : 'No flagged affixes — pick rates are within normal range.'}
              </div>
            ) : (
              <div style={styles.flagList}>
                {flaggedAffixes.map((f) => {
                  const color = f.reason === 'must-pick' ? THEME.error : THEME.warning;
                  return (
                    <div key={f.affixId} style={styles.flagItem(color)}>
                      <div style={styles.flagDot(color)} />
                      <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                        {f.affixId}
                      </span>
                      <span style={{ fontSize: '12px', color: THEME.muted }}>
                        {f.reason === 'must-pick' ? 'Must-pick' : 'Never-pick'}
                      </span>
                      <span style={styles.flagMeta}>
                        {(f.pickRate * 100).toFixed(1)}% pick rate
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Win Rate Matrix */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Affix Win Rates</div>
            <WinRateMatrix data={affixStats} totalMatches={totalMatches} />
          </div>

          {/* Matchup Heatmap */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Archetype Matchup Heatmap</div>
            <MatchupHeatmap data={matchupData} />
          </div>
        </>
      )}
    </div>
  );
}

function buildOverviewParams(filters: FilterState): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.runId) params['runId'] = filters.runId;
  if (filters.configId) params['configId'] = filters.configId;
  if (filters.source) params['source'] = filters.source;
  if (filters.dateFrom) params['dateFrom'] = filters.dateFrom;
  if (filters.dateTo) params['dateTo'] = filters.dateTo;
  if (filters.winner !== undefined) params['winner'] = String(filters.winner);
  return params;
}
