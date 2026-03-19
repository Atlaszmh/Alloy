import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { ConfigSummary, SimulationRun } from '../api/client.js';
import { useSimulationProgress } from '../api/sse.js';
import RunProgress from '../components/RunProgress.js';

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  } as React.CSSProperties,
  section: {
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: '8px',
    padding: '20px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#e4e4e7',
    marginBottom: '16px',
  } as React.CSSProperties,
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '20px',
  } as React.CSSProperties,
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  } as React.CSSProperties,
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#a1a1aa',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  input: {
    padding: '8px 12px',
    background: '#0f1117',
    border: '1px solid #27272a',
    borderRadius: '6px',
    color: '#e4e4e7',
    fontSize: '14px',
    outline: 'none',
  } as React.CSSProperties,
  select: {
    padding: '8px 12px',
    background: '#0f1117',
    border: '1px solid #27272a',
    borderRadius: '6px',
    color: '#e4e4e7',
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  runBtn: (disabled: boolean) => ({
    padding: '10px 24px',
    background: disabled ? '#3f3f46' : '#6366f1',
    border: 'none',
    borderRadius: '6px',
    color: disabled ? '#71717a' : '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s',
  }) as React.CSSProperties,
  errorText: {
    fontSize: '13px',
    color: '#ef4444',
    marginTop: '8px',
  } as React.CSSProperties,
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '12px',
  } as React.CSSProperties,
  summaryCard: {
    background: '#0f1117',
    border: '1px solid #27272a',
    borderRadius: '6px',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
  cardLabel: {
    fontSize: '11px',
    color: '#a1a1aa',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  cardValue: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#e4e4e7',
  } as React.CSSProperties,
  cardSub: {
    fontSize: '12px',
    color: '#71717a',
  } as React.CSSProperties,
};

const AI_TIERS = [1, 2, 3, 4, 5];

export default function SimulationPage() {
  const [configs, setConfigs] = useState<ConfigSummary[]>([]);
  const [configId, setConfigId] = useState('');
  const [matchCount, setMatchCount] = useState(10000);
  const [aiTier1, setAiTier1] = useState(3);
  const [aiTier2, setAiTier2] = useState(3);
  const [seedStart, setSeedStart] = useState(0);

  const [run, setRun] = useState<SimulationRun | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const progress = useSimulationProgress(runId);

  useEffect(() => {
    api.configs.list().then((list) => {
      setConfigs(list);
      if (list.length > 0) setConfigId(list[0].id);
    }).catch(() => {
      // Server may not be running; silently ignore
    });
  }, []);

  async function handleRun() {
    if (!configId) {
      setError('Select a config before running.');
      return;
    }
    setError(null);
    setIsStarting(true);
    setRun(null);
    setRunId(null);
    try {
      const newRun = await api.simulations.start({
        configId,
        matchCount,
        aiTiers: [aiTier1, aiTier2],
        seedStart,
      });
      setRun(newRun);
      setRunId(newRun.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start simulation');
    } finally {
      setIsStarting(false);
    }
  }

  async function handleCancel() {
    if (!runId) return;
    try {
      await api.simulations.cancel(runId);
    } catch {
      // ignore
    }
  }

  const isRunning = !!runId && progress?.status === 'running';
  const isDone = progress?.status === 'complete';
  const canRun = !isRunning && !isStarting;

  const selectedConfig = configs.find((c) => c.id === configId);

  return (
    <div style={styles.page}>
      {/* Config + params section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Simulation Setup</div>
        <div style={styles.formGrid}>
          <div style={styles.field}>
            <label style={styles.label}>Config</label>
            <select
              style={styles.select}
              value={configId}
              onChange={(e) => setConfigId(e.target.value)}
            >
              {configs.length === 0 && (
                <option value="">No configs available</option>
              )}
              {configs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} v{c.version}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Match Count</label>
            <input
              type="number"
              style={styles.input}
              value={matchCount}
              min={1}
              max={1000000}
              onChange={(e) => setMatchCount(Number(e.target.value))}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>AI Tier (P1)</label>
            <select
              style={styles.select}
              value={aiTier1}
              onChange={(e) => setAiTier1(Number(e.target.value))}
            >
              {AI_TIERS.map((t) => (
                <option key={t} value={t}>Tier {t}</option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>AI Tier (P2)</label>
            <select
              style={styles.select}
              value={aiTier2}
              onChange={(e) => setAiTier2(Number(e.target.value))}
            >
              {AI_TIERS.map((t) => (
                <option key={t} value={t}>Tier {t}</option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Seed Start</label>
            <input
              type="number"
              style={styles.input}
              value={seedStart}
              min={0}
              onChange={(e) => setSeedStart(Number(e.target.value))}
            />
          </div>
        </div>

        <button
          style={styles.runBtn(!canRun)}
          onClick={handleRun}
          disabled={!canRun}
        >
          {isStarting ? 'Starting…' : isRunning ? 'Running…' : 'Run Simulation'}
        </button>

        {error && <div style={styles.errorText}>{error}</div>}

        {selectedConfig && (
          <div
            style={{
              marginTop: '12px',
              fontSize: '12px',
              color: '#71717a',
            }}
          >
            Config: {selectedConfig.name} v{selectedConfig.version}
            {selectedConfig.parent_id && ' (fork)'}
            {' · '}ID: {selectedConfig.id}
          </div>
        )}
      </div>

      {/* Run progress */}
      {(run || progress) && (
        <RunProgress progress={progress} onCancel={handleCancel} />
      )}

      {/* Summary cards when complete */}
      {isDone && run && progress && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Run Summary</div>
          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <span style={styles.cardLabel}>Total Matches</span>
              <span style={styles.cardValue}>{progress.total.toLocaleString()}</span>
              <span style={styles.cardSub}>completed</span>
            </div>
            <div style={styles.summaryCard}>
              <span style={styles.cardLabel}>Config</span>
              <span style={styles.cardValue}>{selectedConfig?.name ?? '—'}</span>
              <span style={styles.cardSub}>v{selectedConfig?.version ?? '—'}</span>
            </div>
            <div style={styles.summaryCard}>
              <span style={styles.cardLabel}>AI Tiers</span>
              <span style={styles.cardValue}>
                {aiTier1} vs {aiTier2}
              </span>
              <span style={styles.cardSub}>player tiers</span>
            </div>
            <div style={styles.summaryCard}>
              <span style={styles.cardLabel}>Seed Start</span>
              <span style={styles.cardValue}>{seedStart}</span>
              <span style={styles.cardSub}>deterministic</span>
            </div>
            <div style={styles.summaryCard}>
              <span style={styles.cardLabel}>Run ID</span>
              <span
                style={{
                  ...styles.cardValue,
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all' as const,
                }}
              >
                {run.id}
              </span>
              <span style={styles.cardSub}>server run</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
