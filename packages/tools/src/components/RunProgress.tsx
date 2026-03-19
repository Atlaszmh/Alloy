import React, { useEffect, useRef, useState } from 'react';
import type { ProgressData } from '../api/sse.js';

interface RunProgressProps {
  progress: ProgressData | null;
  onCancel: () => void;
}

const styles = {
  container: {
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: '8px',
    padding: '20px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  } as React.CSSProperties,
  label: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e4e4e7',
  } as React.CSSProperties,
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  dot: (color: string) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }) as React.CSSProperties,
  statusText: (color: string) => ({
    fontSize: '13px',
    color,
    fontWeight: 500,
  }) as React.CSSProperties,
  progressTrack: {
    height: '8px',
    background: '#27272a',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '12px',
  } as React.CSSProperties,
  progressFill: (pct: number, color: string) => ({
    height: '100%',
    width: `${Math.min(100, Math.max(0, pct * 100))}%`,
    background: color,
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  }) as React.CSSProperties,
  metaRow: {
    display: 'flex',
    gap: '24px',
    marginBottom: '16px',
  } as React.CSSProperties,
  metaItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  } as React.CSSProperties,
  metaLabel: {
    fontSize: '11px',
    color: '#a1a1aa',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  metaValue: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#e4e4e7',
  } as React.CSSProperties,
  cancelBtn: {
    padding: '6px 14px',
    background: 'transparent',
    border: '1px solid #27272a',
    borderRadius: '6px',
    color: '#a1a1aa',
    fontSize: '13px',
    cursor: 'pointer',
  } as React.CSSProperties,
};

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

export default function RunProgress({ progress, onCancel }: RunProgressProps) {
  const startRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 500);
    return () => clearInterval(id);
  }, []);

  const status = progress?.status ?? 'running';
  const pct = progress?.progress ?? 0;
  const completed = progress?.completed ?? 0;
  const total = progress?.total ?? 0;

  const isDone = status === 'complete';
  const isFailed = status === 'failed' || status === 'cancelled';
  const isRunning = !isDone && !isFailed;

  const barColor = isDone ? '#22c55e' : isFailed ? '#ef4444' : '#6366f1';
  const dotColor = isDone ? '#22c55e' : isFailed ? '#ef4444' : '#6366f1';

  const statusLabel = isDone
    ? 'Complete'
    : isFailed
    ? status === 'cancelled' ? 'Cancelled' : 'Failed'
    : 'Running';

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.statusRow}>
          <span style={styles.dot(dotColor)} />
          <span style={styles.label}>Run Progress</span>
          <span style={styles.statusText(dotColor)}>{statusLabel}</span>
        </div>
        {isRunning && (
          <button style={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      <div style={styles.progressTrack}>
        <div style={styles.progressFill(pct, barColor)} />
      </div>

      <div style={styles.metaRow}>
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>Progress</span>
          <span style={styles.metaValue}>{Math.round(pct * 100)}%</span>
        </div>
        {total > 0 && (
          <div style={styles.metaItem}>
            <span style={styles.metaLabel}>Matches</span>
            <span style={styles.metaValue}>
              {completed.toLocaleString()} / {total.toLocaleString()}
            </span>
          </div>
        )}
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>Elapsed</span>
          <span style={styles.metaValue}>{formatElapsed(elapsed)}</span>
        </div>
        {isDone && total > 0 && elapsed > 0 && (
          <div style={styles.metaItem}>
            <span style={styles.metaLabel}>Avg per match</span>
            <span style={styles.metaValue}>{((elapsed / total) * 1000).toFixed(1)} µs</span>
          </div>
        )}
      </div>

      {isFailed && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '6px',
            color: '#ef4444',
            fontSize: '13px',
          }}
        >
          {status === 'cancelled' ? 'Run was cancelled.' : 'Run failed. Check server logs for details.'}
        </div>
      )}

      {isDone && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: '6px',
            color: '#22c55e',
            fontSize: '13px',
          }}
        >
          Simulation complete — {total.toLocaleString()} matches processed.
        </div>
      )}
    </div>
  );
}
