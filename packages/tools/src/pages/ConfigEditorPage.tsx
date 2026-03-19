import React, { useCallback, useEffect, useState } from 'react';
import type { GameConfig } from '@alloy/engine';
import { defaultConfig, GameConfigSchema } from '@alloy/engine';
import { api } from '../api/client.js';
import type { ConfigSummary } from '../api/client.js';
import ConfigFormEditor from '../components/ConfigFormEditor.js';
import ConfigRawEditor from '../components/ConfigRawEditor.js';

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    minHeight: 0,
  } as React.CSSProperties,

  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 20px',
    background: '#18181b',
    borderBottom: '1px solid #27272a',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,

  group: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,

  separator: {
    width: '1px',
    height: '24px',
    background: '#27272a',
    flexShrink: 0,
  } as React.CSSProperties,

  label: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#71717a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  textInput: {
    padding: '7px 10px',
    background: '#27272a',
    border: '1px solid #3f3f46',
    borderRadius: '5px',
    color: '#e4e4e7',
    fontSize: '13px',
    outline: 'none',
    width: '160px',
  } as React.CSSProperties,

  versionInput: {
    padding: '7px 10px',
    background: '#27272a',
    border: '1px solid #3f3f46',
    borderRadius: '5px',
    color: '#e4e4e7',
    fontSize: '13px',
    outline: 'none',
    width: '90px',
    fontFamily: 'monospace',
  } as React.CSSProperties,

  select: {
    padding: '7px 10px',
    background: '#27272a',
    border: '1px solid #3f3f46',
    borderRadius: '5px',
    color: '#e4e4e7',
    fontSize: '13px',
    outline: 'none',
    cursor: 'pointer',
    minWidth: '160px',
  } as React.CSSProperties,

  btn: (variant: 'primary' | 'secondary' | 'ghost' | 'warning', disabled?: boolean) => ({
    padding: '7px 14px',
    border: 'none',
    borderRadius: '5px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'opacity 0.15s',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap' as const,
    ...(variant === 'primary'
      ? { background: '#6366f1', color: '#fff' }
      : variant === 'warning'
      ? { background: '#d97706', color: '#fff' }
      : variant === 'secondary'
      ? { background: '#27272a', color: '#e4e4e7', border: '1px solid #3f3f46' }
      : { background: 'transparent', color: '#a1a1aa', border: '1px solid #3f3f46' }),
  }) as React.CSSProperties,

  modeToggle: {
    display: 'flex',
    background: '#0f1117',
    border: '1px solid #27272a',
    borderRadius: '6px',
    overflow: 'hidden',
  } as React.CSSProperties,

  modeBtn: (active: boolean) => ({
    padding: '6px 14px',
    border: 'none',
    background: active ? '#6366f1' : 'transparent',
    color: active ? '#fff' : '#71717a',
    fontSize: '12px',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    transition: 'all 0.15s',
  }) as React.CSSProperties,

  unsavedDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#eab308',
    flexShrink: 0,
  } as React.CSSProperties,

  body: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto' as const,
    minHeight: 0,
  } as React.CSSProperties,

  rawPane: {
    background: '#0f1117',
    border: '1px solid #27272a',
    borderRadius: '8px',
    padding: '20px',
    minHeight: '400px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#52525b',
    fontSize: '14px',
  } as React.CSSProperties,

  toast: (kind: 'success' | 'error' | 'info') => ({
    position: 'fixed' as const,
    bottom: '24px',
    right: '24px',
    padding: '10px 18px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#fff',
    zIndex: 9999,
    background:
      kind === 'success' ? '#16a34a' : kind === 'error' ? '#dc2626' : '#6366f1',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  }) as React.CSSProperties,

  validationBox: {
    background: '#0f1117',
    border: '1px solid #27272a',
    borderRadius: '6px',
    padding: '12px 16px',
    marginBottom: '16px',
    fontSize: '13px',
  } as React.CSSProperties,

  validationSuccess: {
    color: '#4ade80',
    fontWeight: 500,
  } as React.CSSProperties,

  validationError: {
    color: '#f87171',
  } as React.CSSProperties,
};

// ─── Toast helper ─────────────────────────────────────────────────────────────

type ToastState = { message: string; kind: 'success' | 'error' | 'info' } | null;

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConfigEditorPage() {
  const [config, setConfig] = useState<GameConfig>(() => defaultConfig());
  const [baselineConfig] = useState<GameConfig>(() => defaultConfig());

  const [name, setName] = useState('baseline');
  const [version, setVersion] = useState('1.0.0');
  const [parentId, setParentId] = useState<string | undefined>(undefined);

  const [mode, setMode] = useState<'form' | 'raw'>('form');
  const [rawJson, setRawJson] = useState<string>(() => JSON.stringify(defaultConfig(), null, 2));
  const [rawValidationErrors, setRawValidationErrors] = useState<string[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<ConfigSummary[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [validationResult, setValidationResult] = useState<
    { ok: true } | { ok: false; errors: string[] } | null
  >(null);

  const [toast, setToast] = useState<ToastState>(null);

  // ─── Load saved configs list on mount ──────────────────────────────────

  useEffect(() => {
    api.configs
      .list()
      .then((list) => setSavedConfigs(list))
      .catch(() => {
        // Server may not be running — silently ignore
      });
  }, []);

  // ─── Dismiss toast after 3s ────────────────────────────────────────────

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ─── Config change handler ─────────────────────────────────────────────

  const handleConfigChange = useCallback((updated: GameConfig) => {
    setConfig(updated);
    setHasUnsavedChanges(true);
    setValidationResult(null);
  }, []);

  // ─── Load a saved config from API ──────────────────────────────────────

  async function handleLoadConfig(id: string) {
    if (!id) return;
    setIsLoading(true);
    try {
      const row = await api.configs.get(id);
      const parsed = GameConfigSchema.safeParse(row.config);
      if (!parsed.success) {
        setToast({ message: 'Config failed schema validation — check console', kind: 'error' });
        console.error('Config validation errors:', parsed.error.issues);
        return;
      }
      setConfig(parsed.data as unknown as GameConfig);
      setRawJson(JSON.stringify(parsed.data, null, 2));
      setRawValidationErrors([]);
      setName(row.name);
      setVersion(row.version);
      setParentId(row.id);
      setSelectedConfigId(id);
      setHasUnsavedChanges(false);
      setValidationResult(null);
      setToast({ message: `Loaded "${row.name}" v${row.version}`, kind: 'success' });
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : 'Failed to load config',
        kind: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }

  // ─── Validate ─────────────────────────────────────────────────────────

  function handleValidate() {
    const result = GameConfigSchema.safeParse(config);
    if (result.success) {
      setValidationResult({ ok: true });
      setToast({ message: 'Config is valid', kind: 'success' });
    } else {
      const errors = result.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      );
      setValidationResult({ ok: false, errors });
      setToast({ message: `${errors.length} validation error(s)`, kind: 'error' });
    }
  }

  // ─── Save ─────────────────────────────────────────────────────────────

  async function handleSave() {
    setIsSaving(true);
    try {
      const row = await api.configs.create({
        name,
        version,
        config: config as unknown,
        parent_id: parentId,
      });
      setSavedConfigs((prev) => [...prev, row]);
      setSelectedConfigId(row.id);
      setParentId(row.id);
      setHasUnsavedChanges(false);
      setToast({ message: `Saved "${row.name}" v${row.version}`, kind: 'success' });
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : 'Save failed',
        kind: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  }

  // ─── Fork ─────────────────────────────────────────────────────────────

  async function handleFork() {
    const forkName = `${name} (fork)`;
    setIsSaving(true);
    try {
      const row = await api.configs.create({
        name: forkName,
        version,
        config: config as unknown,
        parent_id: selectedConfigId || parentId,
      });
      setSavedConfigs((prev) => [...prev, row]);
      setSelectedConfigId(row.id);
      setName(row.name);
      setParentId(row.id);
      setHasUnsavedChanges(false);
      setToast({ message: `Forked as "${row.name}"`, kind: 'success' });
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : 'Fork failed',
        kind: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  }

  // ─── Mode switching ───────────────────────────────────────────────────

  function switchToRaw() {
    // Serialize current config state to formatted JSON
    const json = JSON.stringify(config, null, 2);
    setRawJson(json);
    setRawValidationErrors([]);
    setMode('raw');
  }

  function switchToForm() {
    // Attempt to parse and validate the raw JSON before switching
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      setToast({ message: 'Invalid JSON — fix syntax errors before switching to Form mode', kind: 'error' });
      return;
    }

    const result = GameConfigSchema.safeParse(parsed);
    if (!result.success) {
      const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      setRawValidationErrors(errors);
      setToast({ message: `${errors.length} validation error(s) — fix before switching to Form mode`, kind: 'error' });
      return;
    }

    setConfig(result.data as unknown as GameConfig);
    setRawValidationErrors([]);
    setHasUnsavedChanges(true);
    setValidationResult(null);
    setMode('form');
  }

  function handleRawChange(json: string) {
    setRawJson(json);
    setHasUnsavedChanges(true);
    // Live-validate JSON syntax and schema so markers update
    try {
      const parsed = JSON.parse(json);
      const result = GameConfigSchema.safeParse(parsed);
      if (result.success) {
        setRawValidationErrors([]);
      } else {
        const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
        setRawValidationErrors(errors);
      }
    } catch {
      setRawValidationErrors(['Invalid JSON syntax']);
    }
  }

  // ─── Run simulation (stub) ─────────────────────────────────────────────

  function handleRunSimulation() {
    console.log('[ConfigEditorPage] Run simulation requested with config:', config);
    setToast({ message: 'Navigation to simulation wired up later', kind: 'info' });
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>
      {/* Top bar */}
      <div style={S.topBar}>
        {/* Name + Version */}
        <div style={S.group}>
          <span style={S.label}>Name</span>
          <input
            style={S.textInput}
            value={name}
            onChange={(e) => { setName(e.target.value); setHasUnsavedChanges(true); }}
            placeholder="Config name"
          />
        </div>

        <div style={S.group}>
          <span style={S.label}>Version</span>
          <input
            style={S.versionInput}
            value={version}
            onChange={(e) => { setVersion(e.target.value); setHasUnsavedChanges(true); }}
            placeholder="1.0.0"
          />
        </div>

        <div style={S.separator} />

        {/* Config selector */}
        <div style={S.group}>
          <span style={S.label}>Load</span>
          <select
            style={S.select}
            value={selectedConfigId}
            onChange={(e) => handleLoadConfig(e.target.value)}
            disabled={isLoading}
          >
            <option value="">— select saved config —</option>
            {savedConfigs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} v{c.version}
                {c.parent_id ? ' (fork)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={S.separator} />

        {/* Actions */}
        <div style={S.group}>
          {hasUnsavedChanges && <div style={S.unsavedDot} title="Unsaved changes" />}
          <button
            style={S.btn('primary', isSaving)}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
          <button
            style={S.btn('secondary', isSaving)}
            onClick={handleFork}
            disabled={isSaving}
          >
            Fork
          </button>
          <button
            style={S.btn('ghost')}
            onClick={handleValidate}
          >
            Validate
          </button>
        </div>

        <div style={S.separator} />

        {/* Run simulation */}
        <div style={S.group}>
          <button style={S.btn('warning')} onClick={handleRunSimulation}>
            Run Simulation
          </button>
        </div>

        <div style={{ marginLeft: 'auto' }}>
          {/* Mode toggle */}
          <div style={S.modeToggle}>
            <button style={S.modeBtn(mode === 'form')} onClick={switchToForm}>
              Form
            </button>
            <button style={S.modeBtn(mode === 'raw')} onClick={switchToRaw}>
              Raw
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={S.body}>
        {/* Validation result banner */}
        {validationResult && (
          <div style={S.validationBox}>
            {validationResult.ok ? (
              <span style={S.validationSuccess}>Config is valid</span>
            ) : (
              <div>
                <div style={{ ...S.validationError, fontWeight: 600, marginBottom: '6px' }}>
                  {validationResult.errors.length} validation error(s):
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                  {validationResult.errors.map((err, i) => (
                    <li key={i} style={S.validationError}>
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {mode === 'form' ? (
          <ConfigFormEditor
            config={config}
            baselineConfig={baselineConfig}
            onChange={handleConfigChange}
          />
        ) : (
          <ConfigRawEditor
            configJson={rawJson}
            onChange={handleRawChange}
            validationErrors={rawValidationErrors}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={S.toast(toast.kind)} onClick={() => setToast(null)}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
