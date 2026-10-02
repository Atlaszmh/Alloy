import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { dpsCombos, dpsKey, type DpsOptions, type DpsSetup } from '@alloy/engine';
import { MAX_DEPTH } from '@/stores/sandboxStore';
import {
  Button,
  Chip,
  Footer,
  Header,
  Panel,
  Screen,
  Tabs,
} from '@/features/delve/kit';
import { getDelveRegistry } from '@/features/delve/registry';
import { LabChart } from '@/features/delve/lab/LabChart';
import { LabTable } from '@/features/delve/lab/LabTable';
import { EconomyView } from '@/features/delve/lab/EconomyView';
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

/** The DPS views, and the Economy view (see the crafting spec). */
type View = DpsSetup['view'] | 'economy';
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
  ['economy', 'Economy'],
];
const SELECT = 'k-well px-2 py-1.5 text-[14px] text-[var(--k-text)]';
const LABEL = 'flex items-center gap-2 text-[16px] text-[var(--k-text-2)]';

/**
 * The DPS Lab (dev builds only): every basic-attack, ability and rune combo's
 * baseline DPS over 30 s, simulated by the engine in a worker, as a ranked
 * table and a chart of the ticked rows; the Runes view adds each row's ratio
 * to its baseline ("× none"). See the DPS Lab and runes specs. The Economy view
 * runs the economy sim instead (see the crafting spec); both stay mounted, the
 * one not shown `hidden`, so neither loses its run.
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
    <div className="delve-page">
      <Screen
        backdrop="wall"
        headerStyle="band"
        testId="delve-lab"
        header={
          <Header
            title="DPS Lab"
            subtitle={view === 'economy' ? 'The autopilot, dive by dive' : '30 s on the dummies'}
            nav={
              <Tabs
                level="top"
                glyphs
                aria-label="Lab views"
                value={view}
                onChange={pickView}
                tabs={VIEWS.map(([v, label]) => ({ id: v, label, testId: `lab-tab-${v}` }))}
              />
            }
            aside={
              <Button
                onClick={() => navigate('/delve/training')}
                binding={{ key: 'Escape', pad: 'b' }}
                data-pad-back
                testId="lab-back"
              >
                ◂ Training
              </Button>
            }
          />
        }
        // No footer prompts: the header's ◂ Training already carries Esc and B (`data-pad-back`).
        footer={<Footer prompts={[]} />}
      >
        <EconomyView hidden={view !== 'economy'} />
        <div className="flex h-full min-h-0 flex-col gap-4 px-8 py-5" hidden={view === 'economy'}>
          <Panel material="well" scroll={false} className="shrink-0">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <label className={LABEL}>
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
                <b className="w-6 text-right text-[var(--k-text)]">{slider}</b>
              </label>
              <label className={LABEL}>
                <input
                  type="checkbox"
                  checked={pack}
                  onChange={(e) => setPack(e.target.checked)}
                  data-testid="lab-pack"
                />
                Pack of 5
              </label>
              <label className={LABEL}>
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
              <label className={LABEL}>
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
            {groups.map((g) => (
              <div key={g.key} className="flex flex-wrap items-center gap-1.5">
                <span className="k-label w-28 shrink-0">{g.key}</span>
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
            {rows.length < keys.length && (
              <div className="h-1.5 overflow-hidden bg-white/10" data-testid="lab-progress">
                <div
                  className="h-full bg-[var(--k-hot)]"
                  style={{ width: `${(rows.length / keys.length) * 100}%` }}
                />
              </div>
            )}
          </Panel>
          <Panel className="min-h-0 flex-1" testId="lab-results">
            <LabChart lines={lines} />
            <LabTable
              rows={ranked}
              columns={columns}
              ticked={charted}
              onTick={tick}
              ratios={ratios}
            />
          </Panel>
        </div>
      </Screen>
    </div>
  );
}
