import React from 'react';
import type { AffixStat } from '../../api/client.js';
import { exportCSV } from '../../utils/export.js';

interface WinRateMatrixProps {
  data: AffixStat[];
  totalMatches: number;
}

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
  wrapper: {
    overflowX: 'auto' as const,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
    color: THEME.text,
  },
  th: {
    padding: '8px 12px',
    textAlign: 'left' as const,
    fontSize: '11px',
    fontWeight: 600,
    color: THEME.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    borderBottom: `1px solid ${THEME.border}`,
    whiteSpace: 'nowrap' as const,
  },
  thRight: {
    padding: '8px 12px',
    textAlign: 'right' as const,
    fontSize: '11px',
    fontWeight: 600,
    color: THEME.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    borderBottom: `1px solid ${THEME.border}`,
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '8px 12px',
    borderBottom: `1px solid ${THEME.border}`,
  },
  tdRight: {
    padding: '8px 12px',
    borderBottom: `1px solid ${THEME.border}`,
    textAlign: 'right' as const,
  },
  emptyState: {
    padding: '40px',
    textAlign: 'center' as const,
    color: THEME.muted,
    fontSize: '14px',
  },
} as const;

function winRateBg(winRate: number | null): string {
  if (winRate === null) return 'transparent';
  if (winRate > 0.55) return '#22c55e20';
  if (winRate < 0.45) return '#ef444420';
  return 'transparent';
}

function formatPct(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

const exportBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '12px',
  background: '#27272a',
  border: '1px solid #3f3f46',
  borderRadius: '4px',
  color: '#a1a1aa',
  cursor: 'pointer',
};

export default function WinRateMatrix({ data, totalMatches }: WinRateMatrixProps) {
  if (!data || data.length === 0) {
    return <div style={styles.emptyState}>No affix data available</div>;
  }

  const sorted = [...data].sort((a, b) => {
    const wr_a = a.winRate ?? -1;
    const wr_b = b.winRate ?? -1;
    return wr_b - wr_a;
  });

  const playerSlots = totalMatches * 2;

  function handleExportCSV() {
    const records = sorted.map((row) => {
      const pickRate = playerSlots > 0 ? row.pickCount / playerSlots : null;
      return {
        affixId: row.affixId,
        pickCount: row.pickCount,
        winCount: row.winCount,
        winRate: row.winRate !== null ? (row.winRate * 100).toFixed(1) + '%' : '',
        pickRate: pickRate !== null ? (pickRate * 100).toFixed(1) + '%' : '',
      };
    });
    exportCSV(records as Record<string, unknown>[], 'win-rate-matrix');
  }

  return (
    <div style={styles.wrapper}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <button style={exportBtnStyle} onClick={handleExportCSV}>Export CSV</button>
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Affix</th>
            <th style={styles.thRight}>Pick Count</th>
            <th style={styles.thRight}>Win Count</th>
            <th style={styles.thRight}>Win Rate</th>
            <th style={styles.thRight}>Pick Rate</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const bg = winRateBg(row.winRate);
            const pickRate = playerSlots > 0 ? row.pickCount / playerSlots : null;
            return (
              <tr key={row.affixId} style={{ backgroundColor: bg }}>
                <td style={styles.td}>
                  <span style={{ fontFamily: 'monospace', fontSize: '12px', color: THEME.muted }}>
                    {row.affixId}
                  </span>
                </td>
                <td style={styles.tdRight}>{row.pickCount.toLocaleString()}</td>
                <td style={styles.tdRight}>{row.winCount.toLocaleString()}</td>
                <td style={{ ...styles.tdRight, fontWeight: 600 }}>
                  {formatPct(row.winRate)}
                </td>
                <td style={styles.tdRight}>{formatPct(pickRate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
