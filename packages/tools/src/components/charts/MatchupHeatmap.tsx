import React from 'react';
import type { MatchupData } from '../../api/client.js';
import { exportCSV } from '../../utils/export.js';

interface MatchupHeatmapProps {
  data: MatchupData;
}

const THEME = {
  bg: '#0f1117',
  surface: '#18181b',
  border: '#27272a',
  text: '#e4e4e7',
  muted: '#a1a1aa',
} as const;

const styles = {
  wrapper: {
    overflowX: 'auto' as const,
  },
  emptyState: {
    padding: '40px',
    textAlign: 'center' as const,
    color: THEME.muted,
    fontSize: '14px',
  },
  table: {
    borderCollapse: 'collapse' as const,
    fontSize: '12px',
    color: THEME.text,
  },
  cornerTh: {
    padding: '6px 10px',
    border: `1px solid ${THEME.border}`,
    fontSize: '11px',
    color: THEME.muted,
    backgroundColor: THEME.surface,
    whiteSpace: 'nowrap' as const,
  },
  rowHeaderTh: {
    padding: '6px 10px',
    border: `1px solid ${THEME.border}`,
    fontSize: '11px',
    color: THEME.muted,
    backgroundColor: THEME.surface,
    whiteSpace: 'nowrap' as const,
    fontWeight: 600,
    textAlign: 'left' as const,
  },
  colHeaderTh: {
    padding: '6px 10px',
    border: `1px solid ${THEME.border}`,
    fontSize: '11px',
    color: THEME.muted,
    backgroundColor: THEME.surface,
    whiteSpace: 'nowrap' as const,
    fontWeight: 600,
  },
  cell: (winRate: number | null, isDiagonal: boolean) => {
    if (isDiagonal) {
      return {
        padding: '6px 10px',
        border: `1px solid ${THEME.border}`,
        backgroundColor: '#27272a',
        textAlign: 'center' as const,
        color: THEME.muted,
        fontSize: '12px',
        minWidth: '52px',
      };
    }
    if (winRate === null) {
      return {
        padding: '6px 10px',
        border: `1px solid ${THEME.border}`,
        backgroundColor: 'transparent',
        textAlign: 'center' as const,
        color: THEME.muted,
        fontSize: '12px',
        minWidth: '52px',
      };
    }
    const bg = interpolateColor(winRate);
    const textColor = winRate > 0.7 || winRate < 0.3 ? '#fff' : THEME.text;
    return {
      padding: '6px 10px',
      border: `1px solid ${THEME.border}`,
      backgroundColor: bg,
      textAlign: 'center' as const,
      color: textColor,
      fontSize: '12px',
      fontWeight: 600,
      minWidth: '52px',
    };
  },
} as const;

/** Interpolate between red (<40%) → white (50%) → green (>60%) */
function interpolateColor(rate: number): string {
  if (rate <= 0.4) {
    // red to white: rate 0→0.4 maps opacity 100→0 of red
    const t = rate / 0.4; // 0 at rate=0, 1 at rate=0.4
    const r = 239;
    const g = Math.round(68 + (255 - 68) * t);
    const b = Math.round(68 + (255 - 68) * t);
    return `rgb(${r},${g},${b})`;
  } else if (rate >= 0.6) {
    // white to green: rate 0.6→1 maps white→green
    const t = (rate - 0.6) / 0.4; // 0 at rate=0.6, 1 at rate=1
    const r = Math.round(255 - (255 - 34) * t);
    const g = 255;
    const b = Math.round(255 - (255 - 94) * t);
    return `rgb(${r},${g},${b})`;
  } else {
    // neutral zone 40%–60%: white-ish
    return '#2a2a2e';
  }
}

function formatPct(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(0)}%`;
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

export default function MatchupHeatmap({ data }: MatchupHeatmapProps) {
  if (!data || !data.archetypes || data.archetypes.length === 0) {
    return <div style={styles.emptyState}>No matchup data available</div>;
  }

  const { archetypes, matrix } = data;

  function handleExportCSV() {
    const records = archetypes.map((row, rowIdx) => {
      const record: Record<string, unknown> = { archetype: row };
      archetypes.forEach((col, colIdx) => {
        const value = matrix[rowIdx]?.[colIdx] ?? null;
        record[col] = value !== null ? (value * 100).toFixed(0) + '%' : '—';
      });
      return record;
    });
    exportCSV(records, 'matchup-heatmap');
  }

  return (
    <div style={styles.wrapper}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <button style={exportBtnStyle} onClick={handleExportCSV}>Export CSV</button>
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.cornerTh}>Row vs Col →</th>
            {archetypes.map((col) => (
              <th key={col} style={styles.colHeaderTh}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {archetypes.map((row, rowIdx) => (
            <tr key={row}>
              <th style={styles.rowHeaderTh}>{row}</th>
              {archetypes.map((col, colIdx) => {
                const isDiagonal = rowIdx === colIdx;
                const value = matrix[rowIdx]?.[colIdx] ?? null;
                return (
                  <td key={col} style={styles.cell(value, isDiagonal)}>
                    {isDiagonal ? '—' : formatPct(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
