import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export interface FilterState {
  runId?: string;
  configId?: string;
  source?: 'simulation' | 'live' | 'both';
  dateFrom?: string;
  dateTo?: string;
  includeAffixes?: string[];
  excludeAffixes?: string[];
  roundCount?: 1 | 3;
  winner?: 0 | 1;
}

interface GlobalFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

const THEME = {
  bg: '#0f1117',
  surface: '#18181b',
  border: '#27272a',
  text: '#e4e4e7',
  muted: '#71717a',
  accent: '#6366f1',
} as const;

const styles = {
  bar: {
    backgroundColor: THEME.surface,
    border: `1px solid ${THEME.border}`,
    borderRadius: 8,
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap' as const,
  },
  label: {
    fontSize: 11,
    color: THEME.muted,
    marginBottom: 2,
    display: 'block',
  },
  select: {
    backgroundColor: THEME.bg,
    color: THEME.text,
    border: `1px solid ${THEME.border}`,
    borderRadius: 4,
    padding: '3px 6px',
    fontSize: 13,
    minWidth: 130,
    cursor: 'pointer',
  },
  input: {
    backgroundColor: THEME.bg,
    color: THEME.text,
    border: `1px solid ${THEME.border}`,
    borderRadius: 4,
    padding: '3px 6px',
    fontSize: 13,
    width: 130,
  },
  dateInput: {
    backgroundColor: THEME.bg,
    color: THEME.text,
    border: `1px solid ${THEME.border}`,
    borderRadius: 4,
    padding: '3px 6px',
    fontSize: 13,
    width: 130,
    colorScheme: 'dark' as const,
  },
  radioGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  radioButton: (active: boolean) => ({
    backgroundColor: active ? THEME.accent : THEME.bg,
    color: active ? '#fff' : THEME.muted,
    border: `1px solid ${active ? THEME.accent : THEME.border}`,
    borderRadius: 4,
    padding: '3px 8px',
    fontSize: 12,
    cursor: 'pointer',
  }),
  expandBtn: {
    backgroundColor: 'transparent',
    color: THEME.muted,
    border: 'none',
    padding: '2px 4px',
    fontSize: 12,
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: THEME.border,
    flexShrink: 0,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
} as const;

interface RunSummary {
  id: string;
  started_at: string;
  status: string;
}

export function GlobalFilters({ filters, onChange }: GlobalFiltersProps) {
  const [expanded, setExpanded] = useState(false);
  const [runs, setRuns] = useState<RunSummary[]>([]);

  useEffect(() => {
    api.simulations.list()
      .then((data: RunSummary[]) => setRuns(Array.isArray(data) ? data : []))
      .catch(() => setRuns([]));
  }, []);

  function set<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    onChange({ ...filters, [key]: value === '' ? undefined : value });
  }

  const sourceOptions: Array<{ label: string; value: FilterState['source'] }> = [
    { label: 'Both', value: 'both' },
    { label: 'Simulation', value: 'simulation' },
    { label: 'Live', value: 'live' },
  ];

  const winnerOptions: Array<{ label: string; value: FilterState['winner'] | '' }> = [
    { label: 'All', value: '' },
    { label: 'P0 Wins', value: 0 },
    { label: 'P1 Wins', value: 1 },
  ];

  return (
    <div style={styles.bar}>
      {/* Primary row */}
      <div style={styles.row}>
        {/* Run selector */}
        <div style={styles.fieldGroup}>
          <span style={styles.label}>Run</span>
          <select
            style={styles.select}
            value={filters.runId ?? ''}
            onChange={e => set('runId', e.target.value || undefined)}
          >
            <option value="">All runs</option>
            {runs.map(r => (
              <option key={r.id} value={r.id}>
                {new Date(r.started_at).toLocaleDateString()} ({r.status})
              </option>
            ))}
          </select>
        </div>

        <div style={styles.divider} />

        {/* Source filter */}
        <div style={styles.fieldGroup}>
          <span style={styles.label}>Source</span>
          <div style={styles.radioGroup}>
            {sourceOptions.map(opt => (
              <button
                key={String(opt.value)}
                style={styles.radioButton(
                  (filters.source ?? 'both') === opt.value,
                )}
                onClick={() => set('source', opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.divider} />

        {/* Winner filter */}
        <div style={styles.fieldGroup}>
          <span style={styles.label}>Winner</span>
          <div style={styles.radioGroup}>
            {winnerOptions.map(opt => (
              <button
                key={String(opt.value)}
                style={styles.radioButton(
                  opt.value === ''
                    ? filters.winner === undefined
                    : filters.winner === opt.value,
                )}
                onClick={() =>
                  set('winner', opt.value === '' ? undefined : (opt.value as 0 | 1))
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Expand toggle */}
        <button
          style={styles.expandBtn}
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
        >
          {expanded ? 'Less \u25b2' : 'More \u25bc'}
        </button>
      </div>

      {/* Advanced row */}
      {expanded && (
        <div style={styles.row}>
          {/* Config version */}
          <div style={styles.fieldGroup}>
            <span style={styles.label}>Config ID</span>
            <input
              style={styles.input}
              placeholder="e.g. uuid..."
              value={filters.configId ?? ''}
              onChange={e => set('configId', e.target.value || undefined)}
            />
          </div>

          <div style={styles.divider} />

          {/* Date range */}
          <div style={styles.fieldGroup}>
            <span style={styles.label}>From</span>
            <input
              type="date"
              style={styles.dateInput}
              value={filters.dateFrom ?? ''}
              onChange={e => set('dateFrom', e.target.value || undefined)}
            />
          </div>

          <div style={styles.fieldGroup}>
            <span style={styles.label}>To</span>
            <input
              type="date"
              style={styles.dateInput}
              value={filters.dateTo ?? ''}
              onChange={e => set('dateTo', e.target.value || undefined)}
            />
          </div>

          <div style={styles.divider} />

          {/* Affix text filter */}
          <div style={styles.fieldGroup}>
            <span style={styles.label}>Include affixes (comma-sep)</span>
            <input
              style={styles.input}
              placeholder="fire,ice,..."
              value={(filters.includeAffixes ?? []).join(',')}
              onChange={e => {
                const vals = e.target.value
                  .split(',')
                  .map(s => s.trim())
                  .filter(Boolean);
                set('includeAffixes', vals.length > 0 ? vals : undefined);
              }}
            />
          </div>

          <div style={styles.fieldGroup}>
            <span style={styles.label}>Exclude affixes (comma-sep)</span>
            <input
              style={styles.input}
              placeholder="fire,ice,..."
              value={(filters.excludeAffixes ?? []).join(',')}
              onChange={e => {
                const vals = e.target.value
                  .split(',')
                  .map(s => s.trim())
                  .filter(Boolean);
                set('excludeAffixes', vals.length > 0 ? vals : undefined);
              }}
            />
          </div>

          <div style={styles.divider} />

          {/* Round count */}
          <div style={styles.fieldGroup}>
            <span style={styles.label}>Rounds</span>
            <div style={styles.radioGroup}>
              {([{ label: 'Any', value: undefined }, { label: 'Bo1', value: 1 }, { label: 'Bo3', value: 3 }] as const).map(opt => (
                <button
                  key={String(opt.value)}
                  style={styles.radioButton(filters.roundCount === opt.value)}
                  onClick={() => set('roundCount', opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
