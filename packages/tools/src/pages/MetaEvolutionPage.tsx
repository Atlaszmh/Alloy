import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../api/client.js';
import type { ConfigSummary, ConfigRow, ConfigComparisonResult } from '../api/client.js';

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    color: '#e4e4e7',
  } as React.CSSProperties,
  heading: {
    fontSize: '20px',
    fontWeight: 700,
    marginBottom: '20px',
    color: '#e4e4e7',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#a1a1aa',
    marginBottom: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  card: {
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '16px',
  } as React.CSSProperties,
  row: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap' as const,
    marginBottom: '16px',
  } as React.CSSProperties,
  checkLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: '#0f1117',
    border: '1px solid #27272a',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#e4e4e7',
    userSelect: 'none' as const,
  } as React.CSSProperties,
  checkLabelActive: {
    border: '1px solid #6366f1',
    background: '#1e1e3a',
  } as React.CSSProperties,
  diffTree: {
    fontFamily: 'monospace',
    fontSize: '13px',
    lineHeight: '1.6',
  } as React.CSSProperties,
  diffAdded: {
    color: '#22c55e',
    background: '#052e1640',
    borderRadius: '3px',
    padding: '0 4px',
  } as React.CSSProperties,
  diffRemoved: {
    color: '#ef4444',
    background: '#2e050540',
    borderRadius: '3px',
    padding: '0 4px',
  } as React.CSSProperties,
  diffChanged: {
    color: '#eab308',
    background: '#2e250540',
    borderRadius: '3px',
    padding: '0 4px',
  } as React.CSSProperties,
  diffKey: {
    color: '#a1a1aa',
  } as React.CSSProperties,
  muted: {
    color: '#a1a1aa',
    fontSize: '14px',
  } as React.CSSProperties,
  select: {
    padding: '6px 10px',
    background: '#0f1117',
    border: '1px solid #27272a',
    borderRadius: '6px',
    color: '#e4e4e7',
    fontSize: '13px',
  } as React.CSSProperties,
  tooltipStyle: {
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: '6px',
    color: '#e4e4e7',
    fontSize: '13px',
  } as React.CSSProperties,
};

// ─── Diff Logic ───────────────────────────────────────────────────────────────

type DiffEntry =
  | { type: 'added'; key: string; value: unknown }
  | { type: 'removed'; key: string; value: unknown }
  | { type: 'changed'; key: string; oldValue: unknown; newValue: unknown }
  | { type: 'same'; key: string; value: unknown };

function shallowDiff(a: Record<string, unknown>, b: Record<string, unknown>): DiffEntry[] {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const entries: DiffEntry[] = [];

  for (const key of allKeys) {
    if (!(key in a)) {
      entries.push({ type: 'added', key, value: b[key] });
    } else if (!(key in b)) {
      entries.push({ type: 'removed', key, value: a[key] });
    } else {
      const av = JSON.stringify(a[key]);
      const bv = JSON.stringify(b[key]);
      if (av !== bv) {
        entries.push({ type: 'changed', key, oldValue: a[key], newValue: b[key] });
      } else {
        entries.push({ type: 'same', key, value: a[key] });
      }
    }
  }

  return entries.sort((a, b) => {
    const order = { changed: 0, added: 1, removed: 2, same: 3 };
    return order[a.type] - order[b.type];
  });
}

function renderValue(v: unknown): string {
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return String(v);
}

function ConfigDiffViewer({
  configA,
  configB,
  nameA,
  nameB,
}: {
  configA: Record<string, unknown>;
  configB: Record<string, unknown>;
  nameA: string;
  nameB: string;
}) {
  const diffs = useMemo(() => shallowDiff(configA, configB), [configA, configB]);
  const hasChanges = diffs.some((d) => d.type !== 'same');

  return (
    <div style={S.diffTree}>
      <div style={{ marginBottom: '10px', display: 'flex', gap: '24px', fontSize: '13px' }}>
        <span style={{ color: '#ef4444' }}>— {nameA}</span>
        <span style={{ color: '#22c55e' }}>+ {nameB}</span>
      </div>
      {!hasChanges && (
        <div style={S.muted}>No differences found between the two configs.</div>
      )}
      {diffs.map((entry) => {
        if (entry.type === 'same') return null;
        return (
          <div key={entry.key} style={{ marginBottom: '6px', padding: '4px 0', borderBottom: '1px solid #27272a22' }}>
            <span style={S.diffKey}>{entry.key}: </span>
            {entry.type === 'added' && (
              <span style={S.diffAdded}>+ {renderValue(entry.value)}</span>
            )}
            {entry.type === 'removed' && (
              <span style={S.diffRemoved}>- {renderValue(entry.value)}</span>
            )}
            {entry.type === 'changed' && (
              <>
                <span style={S.diffRemoved}>{renderValue(entry.oldValue)}</span>
                {' → '}
                <span style={S.diffAdded}>{renderValue(entry.newValue)}</span>
              </>
            )}
          </div>
        );
      })}
      {hasChanges && (
        <div style={{ marginTop: '10px', color: '#a1a1aa', fontSize: '12px' }}>
          {diffs.filter((d) => d.type === 'changed').length} changed,{' '}
          {diffs.filter((d) => d.type === 'added').length} added,{' '}
          {diffs.filter((d) => d.type === 'removed').length} removed
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MetaEvolutionPage() {
  const [configs, setConfigs] = useState<ConfigSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [comparison, setComparison] = useState<ConfigComparisonResult[]>([]);
  const [configDetails, setConfigDetails] = useState<Map<string, Record<string, unknown>>>(new Map());
  const [diffIdA, setDiffIdA] = useState<string>('');
  const [diffIdB, setDiffIdB] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load config list on mount
  useEffect(() => {
    api.configs.list()
      .then(setConfigs)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Fetch comparison data when selection changes
  useEffect(() => {
    if (selectedIds.size < 1) {
      setComparison([]);
      return;
    }
    setLoading(true);
    api.reports.configComparison(Array.from(selectedIds))
      .then(setComparison)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [selectedIds]);

  function toggleConfig(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Fetch config detail if not already loaded
        if (!configDetails.has(id)) {
          api.configs.get(id)
            .then((row: ConfigRow) => {
              setConfigDetails((m) => {
                const next = new Map(m);
                next.set(id, (row.config ?? {}) as Record<string, unknown>);
                return next;
              });
            })
            .catch(() => {/* non-fatal */});
        }
      }
      return next;
    });
  }

  function getConfigName(id: string): string {
    const c = configs.find((c) => c.id === id);
    return c ? `${c.name} v${c.version}` : id.slice(0, 8);
  }

  const chartData = comparison.map((r) => ({
    name: getConfigName(r.configId),
    p0WinRate: r.p0WinRate !== null ? Math.round(r.p0WinRate * 1000) / 10 : null,
    avgDurationMs: Math.round(r.avgDurationMs),
    totalMatches: r.totalMatches,
  }));

  const diffConfigA = diffIdA ? configDetails.get(diffIdA) : undefined;
  const diffConfigB = diffIdB ? configDetails.get(diffIdB) : undefined;

  return (
    <div style={S.page}>
      <h2 style={S.heading}>Meta Evolution</h2>

      {error && (
        <div style={{ ...S.card, borderColor: '#ef4444', color: '#ef4444', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* Config selector */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Select Configs to Compare</div>
        {configs.length === 0 ? (
          <div style={S.muted}>No configs found. Run a simulation to generate config data.</div>
        ) : (
          <div style={S.row}>
            {configs.map((c) => {
              const active = selectedIds.has(c.id);
              return (
                <label
                  key={c.id}
                  style={{ ...S.checkLabel, ...(active ? S.checkLabelActive : {}) }}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleConfig(c.id)}
                    style={{ accentColor: '#6366f1' }}
                  />
                  <span>{c.name} <span style={{ color: '#a1a1aa', fontSize: '12px' }}>v{c.version}</span></span>
                </label>
              );
            })}
          </div>
        )}
        {selectedIds.size > 0 && (
          <div style={{ color: '#a1a1aa', fontSize: '13px' }}>
            {selectedIds.size} config{selectedIds.size !== 1 ? 's' : ''} selected
            {loading && ' — loading…'}
          </div>
        )}
      </div>

      {/* Charts */}
      {chartData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          {/* Win Rate Chart */}
          <div style={S.card}>
            <div style={S.sectionTitle}>P0 Win Rate by Config</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 32 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="name"
                  stroke="#71717a"
                  tick={{ fontSize: 11, fill: '#a1a1aa' }}
                  angle={-20}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis stroke="#71717a" tick={{ fontSize: 11, fill: '#a1a1aa' }} unit="%" domain={[0, 100]} />
                <Tooltip
                  contentStyle={S.tooltipStyle}
                  formatter={(v: unknown) => [`${v}%`, 'P0 Win Rate']}
                />
                <Legend wrapperStyle={{ color: '#a1a1aa', fontSize: '13px' }} />
                <Bar dataKey="p0WinRate" name="P0 Win Rate %" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Avg Duration Chart */}
          <div style={S.card}>
            <div style={S.sectionTitle}>Avg Match Duration by Config</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 32 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="name"
                  stroke="#71717a"
                  tick={{ fontSize: 11, fill: '#a1a1aa' }}
                  angle={-20}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis stroke="#71717a" tick={{ fontSize: 11, fill: '#a1a1aa' }} unit="ms" />
                <Tooltip
                  contentStyle={S.tooltipStyle}
                  formatter={(v: unknown) => [`${v}ms`, 'Avg Duration']}
                />
                <Legend wrapperStyle={{ color: '#a1a1aa', fontSize: '13px' }} />
                <Bar dataKey="avgDurationMs" name="Avg Duration (ms)" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Config Diff Viewer */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Config Diff Viewer</div>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#ef4444', fontSize: '13px', fontWeight: 600 }}>A (base):</span>
            <select
              style={S.select}
              value={diffIdA}
              onChange={(e) => setDiffIdA(e.target.value)}
            >
              <option value="">— Select config —</option>
              {configs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} v{c.version}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#22c55e', fontSize: '13px', fontWeight: 600 }}>B (compare):</span>
            <select
              style={S.select}
              value={diffIdB}
              onChange={(e) => setDiffIdB(e.target.value)}
            >
              <option value="">— Select config —</option>
              {configs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} v{c.version}
                </option>
              ))}
            </select>
          </div>
          {(diffIdA && !configDetails.has(diffIdA)) || (diffIdB && !configDetails.has(diffIdB)) ? (
            <button
              style={{
                padding: '6px 14px',
                background: '#6366f1',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '13px',
              }}
              onClick={() => {
                [diffIdA, diffIdB].filter(Boolean).forEach((id) => {
                  if (!configDetails.has(id)) {
                    api.configs.get(id)
                      .then((row: ConfigRow) => {
                        setConfigDetails((m) => {
                          const next = new Map(m);
                          next.set(id, (row.config ?? {}) as Record<string, unknown>);
                          return next;
                        });
                      })
                      .catch(() => {/* non-fatal */});
                  }
                });
              }}
            >
              Load
            </button>
          ) : null}
        </div>

        {diffIdA && diffIdB && diffIdA === diffIdB && (
          <div style={S.muted}>Select two different configs to compare.</div>
        )}
        {diffIdA && diffIdB && diffIdA !== diffIdB && diffConfigA && diffConfigB ? (
          <ConfigDiffViewer
            configA={diffConfigA}
            configB={diffConfigB}
            nameA={getConfigName(diffIdA)}
            nameB={getConfigName(diffIdB)}
          />
        ) : diffIdA && diffIdB && diffIdA !== diffIdB && (
          <div style={S.muted}>
            Loading config data…
            {' '}Select configs and click Load if they are not yet cached.
          </div>
        )}
        {(!diffIdA || !diffIdB) && (
          <div style={S.muted}>Select two configs above to see a diff.</div>
        )}
      </div>
    </div>
  );
}
