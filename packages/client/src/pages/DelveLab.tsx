import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { dpsCombos, dpsKey, type DpsOptions, type DpsSetup } from '@alloy/engine';
import { MAX_DEPTH } from '@/stores/sandboxStore';
import { Chip } from '@/features/delve/AbilitiesPanel';
import { getDelveRegistry } from '@/features/delve/registry';
import { LabChart } from '@/features/delve/lab/LabChart';
import { LabTable } from '@/features/delve/lab/LabTable';
import {
  BY_LINE,
  baseRatios,
  dimGroups,
  lineColor,
  passes,
  rank,
  recall,
  remember,
  topTicks,
  type LabFilter,
  type LabRow,
} from '@/features/delve/lab/lab-model';
import '@/features/delve/delve.css';

type View = DpsSetup['view'];
/** The Mana select's options: full mana, or sustained (`DpsOptions.sustained`; the rune costs spec). */
type Mana = 'full' | NonNullable<DpsOptions['sustained']>;
const MANAS: [Mana, string][] = [
  ['full', 'Full'],
  ['starved', 'Starved'],
  ['supported', 'Supported'],
];

const VIEWS: [View, string][] = [
  ['basic', 'Basics'],
  ['ability', 'Abilities'],
  ['rune', 'Runes'],
];
const SELECT = 'rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-xs text-stone-200';

/**
 * The DPS Lab (dev builds only): every basic-attack, ability and rune combo's
 * baseline DPS over 30 s, simulated by the engine in a worker, as a ranked
 * table and a chart of the ticked rows; the Runes view adds each row's ratio
 * to its baseline ("× none"). See the DPS Lab and runes specs.
 */
export function DelveLab() {
  const navigate = useNavigate();
  const grid = useMemo(() => dpsCombos(getDelveRegistry()), []);
  const keys = useMemo(() => grid.map(dpsKey), [grid]);
  const [view, setView] = useState<View>('basic');
  /** The slider's value while dragged; `depth` follows on release. */
  const [slider, setSlider] = useState(10);
  const [depth, setDepth] = useState(10);
  const [pack, setPack] = useState(false);
  const [mana, setMana] = useState<Mana>('full');
  const sustained = mana === 'full' ? undefined : mana;
  const [colorBy, setColorBy] = useState(BY_LINE);
  const [off, setOff] = useState<LabFilter>({});
  /** The ticked rows, or null for the top 8. */
  const [ticks, setTicks] = useState<ReadonlySet<string> | null>(null);
  const [rows, setRows] = useState<LabRow[]>([]);

  // The whole grid at this depth, pack and mana, unless the session has it already. Each request gets
  // a fresh worker: a synchronous one can't see a newer message mid-run. A layout effect, so the
  // reset lands before paint and no frame shows the last run's rows under the new controls.
  // (Under StrictMode, in dev, this effect runs twice on load: one worker is made, terminated
  // and made again.)
  useLayoutEffect(() => {
    const kept = recall(depth, pack, sustained, keys);
    if (kept.length === keys.length) {
      setRows(kept);
      return;
    }
    setRows([]);
    const worker = new Worker(new URL('../features/delve/lab/lab-worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<LabRow[]>) => {
      remember(depth, pack, sustained, e.data);
      setRows((prev) => [...prev, ...e.data]);
    };
    // A throw inside simulateDps would otherwise leave the progress bar stuck in silence.
    worker.onerror = (e) => console.error('DPS Lab worker', e.message);
    worker.postMessage({ depth, pack, sustained } satisfies DpsOptions);
    return () => {
      worker.onmessage = null;
      worker.terminate();
    };
  }, [depth, pack, sustained, keys]);

  const groups = useMemo(() => dimGroups(grid.filter((s) => s.view === view)), [grid, view]);
  const columns = useMemo(() => groups.map((g) => g.key), [groups]);
  const ranked = useMemo(
    () => rank(rows.filter((r) => r.setup.view === view && passes(r.setup, off))),
    [rows, view, off],
  );
  const charted = ticks ?? topTicks(ranked);
  // The Runes view's "× none": each row's DPS over its baseline's.
  const ratios = useMemo(() => (view === 'rune' ? baseRatios(rows) : undefined), [rows, view]);
  const lines = ranked
    .filter((r) => charted.has(r.key))
    .map((r, i) => ({
      key: r.key,
      label: Object.values(r.setup.dims).join(' · '),
      color: lineColor(colorBy, r, i, groups),
      series: r.result.series,
    }));

  const pickView = (v: View) => {
    setView(v);
    setColorBy(BY_LINE);
    setTicks(null);
  };
  const toggleChip = (key: string, value: string) => {
    const now = off[key] ?? [];
    setOff({
      ...off,
      [key]: now.includes(value) ? now.filter((v) => v !== value) : [...now, value],
    });
    setTicks(null);
  };
  // One tick handler for the page's life, so the table's memoised rows don't all re-render.
  const chartedNow = useRef(charted);
  useLayoutEffect(() => {
    chartedNow.current = charted;
  });
  const tick = useCallback((key: string) => {
    const next = new Set(chartedNow.current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setTicks(next);
  }, []);

  return (
    <div className="delve-page bg-black" data-testid="delve-lab">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 px-3 py-2">
        <button
          type="button"
          className="delve-btn px-2.5 py-1.5 text-sm"
          onClick={() => navigate('/delve/training')}
          data-pad-back
          data-testid="lab-back"
        >
          ◂ Training
        </button>
        <div className="flex gap-1 rounded-xl bg-black/30 p-1" role="tablist" data-pad-tabs>
          {VIEWS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => pickView(v)}
              className="delve-display rounded-lg px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
              style={{
                background: view === v ? 'linear-gradient(180deg,#2c2c3e,#1f1f2c)' : 'transparent',
                color: view === v ? '#fde68a' : '#8a8a9a',
              }}
              data-testid={`lab-tab-${v}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-stone-300">
          Depth
          {/* Commits on release, a key up, or losing focus: a controller only nudges the value. */}
          <input
            type="range"
            min={1}
            max={MAX_DEPTH}
            value={slider}
            onChange={(e) => setSlider(Number(e.target.value))}
            onPointerUp={(e) => setDepth(Number(e.currentTarget.value))}
            onKeyUp={(e) => setDepth(Number(e.currentTarget.value))}
            onBlur={(e) => setDepth(Number(e.currentTarget.value))}
            data-testid="lab-depth"
          />
          <b className="w-5 text-right text-stone-100">{slider}</b>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-stone-300">
          <input
            type="checkbox"
            checked={pack}
            onChange={(e) => setPack(e.target.checked)}
            data-testid="lab-pack"
          />
          Pack of 5
        </label>
        <label className="flex items-center gap-1.5 text-xs text-stone-300">
          Mana
          <select
            className={SELECT}
            value={mana}
            onChange={(e) => setMana(e.target.value as Mana)}
            data-testid="lab-mana"
          >
            {MANAS.map(([m, label]) => (
              <option key={m} value={m}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-stone-300">
          Colour by
          <select
            className={SELECT}
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value)}
            data-testid="lab-color"
          >
            <option value={BY_LINE}>Line</option>
            {groups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.key}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-1 px-3 py-2">
        {groups.map((g) => (
          <div key={g.key} className="flex flex-wrap items-center gap-1">
            <span className="w-16 shrink-0 text-[10px] uppercase tracking-widest text-stone-500">
              {g.key}
            </span>
            {g.values.map((v) => (
              <Chip
                key={v}
                pressed={!off[g.key]?.includes(v)}
                onClick={() => toggleChip(g.key, v)}
                testId={`lab-chip-${g.key}-${v}`}
              >
                {v}
              </Chip>
            ))}
          </div>
        ))}
      </div>

      {rows.length < keys.length && (
        <div
          className="mx-3 h-1 overflow-hidden rounded-full bg-white/10"
          data-testid="lab-progress"
        >
          <div
            className="h-full bg-amber-400"
            style={{ width: `${(rows.length / keys.length) * 100}%` }}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <LabChart lines={lines} />
        <LabTable rows={ranked} columns={columns} ticked={charted} onTick={tick} ratios={ratios} />
      </div>
    </div>
  );
}
