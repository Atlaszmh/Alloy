import { useEffect, useState, type PointerEvent } from 'react';
import { BOON_FAMILIES, RARITY_ORDER, type EconomyReport } from '@alloy/engine';
import { Button, Panel } from '../kit';
import { niceCeil } from './LabChart';
import {
  MATERIAL_TOTALS,
  economyLines,
  economyMaterials,
  formatAmount,
  parseSeeds,
  perDive,
  type EconomyLine,
  type EconomyRequest,
} from './economy-model';

/** The most dives a run takes. */
const MAX_DIVES = 50;
const FIELD = 'k-well px-2 py-1.5 text-[14px] text-[var(--k-text)]';
const LABEL = 'flex items-center gap-2 text-[16px] text-[var(--k-text-2)]';
const HEAD = 'px-1 py-1 text-left font-normal text-stone-500';
/** What the chart shows besides a material. */
const OTHER_CHARTS = [
  { id: 'forged', label: 'Items forged' },
  { id: 'boons', label: 'Boons by family' },
  { id: 'depth', label: 'Deepest depth' },
  { id: 'deaths', label: 'Deaths' },
];

/**
 * The DPS Lab's Economy view (dev builds only; see the crafting spec): the
 * engine's economy sim (the autopilot over N dives from a new save) for the
 * chosen seeds, run in a worker on Run, charted dive by dive (a material's
 * income, quest rewards claimed, Anvil salvage, spending (the Anvil's and the stops') and death loss,
 * the items forged by rarity, the boons taken by family, the deepest
 * depth or the deaths) over a table of every dive. Each value is the mean over the seeds;
 * deaths are a count. The page keeps it mounted, `hidden` under the other views.
 */
export function EconomyView({ hidden = false }: { hidden?: boolean }) {
  const [seedsText, setSeedsText] = useState('1, 2, 3');
  const [dives, setDives] = useState(12);
  const [show, setShow] = useState('scrap');
  const [run, setRun] = useState<EconomyRequest | null>(null);
  const [reports, setReports] = useState<EconomyReport[]>([]);
  /** The worker's error, if the sim threw: it ends the run. */
  const [error, setError] = useState<string | null>(null);
  const seeds = parseSeeds(seedsText);
  const valid = seeds.length > 0 && Number.isInteger(dives) && dives >= 1 && dives <= MAX_DIVES;
  const running = run !== null && reports.length < run.seeds.length && error === null;

  // Each Run gets a fresh worker; a new Run, or leaving the page, ends the last.
  useEffect(() => {
    if (!run) return;
    const worker = new Worker(new URL('./economy-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<EconomyReport>) => setReports((prev) => [...prev, e.data]);
    // A throw inside the sim would otherwise leave the progress bar stuck in silence.
    worker.onerror = (e) => {
      console.error('Economy worker', e.message);
      setError(e.message || 'The economy sim failed');
    };
    worker.postMessage(run);
    return () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };
  }, [run]);

  const onRun = () => {
    setReports([]);
    setError(null);
    setRun({ seeds, dives });
  };

  const depth = perDive(reports, (d) => d.depth);
  const deaths = perDive(reports, (d) => (d.died ? 1 : 0), true);
  const forged = RARITY_ORDER.map((r) => perDive(reports, (d) => d.forged[r] ?? 0));
  const boons = BOON_FAMILIES.map((f) => perDive(reports, (d) => d.boons[f]));
  const materials = MATERIAL_TOTALS.map((m) => [
    perDive(reports, (d) => m.of(d.income)),
    perDive(reports, (d) => m.of(d.quests)),
    perDive(reports, (d) => m.of(d.salvaged)),
    perDive(reports, (d) => m.of(d.spent)),
    perDive(reports, (d) => (d.lost ? m.of(d.lost) : 0)),
  ]);

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-4 px-8 py-5"
      hidden={hidden}
      data-testid="economy-view"
    >
      <Panel material="well" scroll={false} className="shrink-0">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className={LABEL}>
            Seeds
            <input
              type="text"
              className={FIELD}
              value={seedsText}
              onChange={(e) => setSeedsText(e.target.value)}
              data-testid="economy-seeds"
            />
          </label>
          <label className={LABEL}>
            Dives
            <input
              type="number"
              className={`${FIELD} w-20`}
              min={1}
              max={MAX_DIVES}
              value={dives}
              onChange={(e) => setDives(Number(e.target.value))}
              data-testid="economy-dives"
            />
          </label>
          <Button variant="go" disabled={!valid} onClick={onRun} testId="economy-run">
            Run
          </Button>
          <label className={LABEL}>
            Chart
            <select
              className={FIELD}
              value={show}
              onChange={(e) => setShow(e.target.value)}
              data-testid="economy-show"
            >
              {[...economyMaterials(), ...OTHER_CHARTS].map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <span className="k-caption">Each dive: the mean over the seeds; deaths a count</span>
        </div>
        {running && (
          <div className="h-1.5 overflow-hidden bg-white/10" data-testid="economy-progress">
            <div
              className="h-full bg-[var(--k-hot)]"
              style={{ width: `${(reports.length / run.seeds.length) * 100}%` }}
            />
          </div>
        )}
      </Panel>
      <Panel className="min-h-0 flex-1" testId="economy-results">
        {error && (
          <p className="k-body-2 text-[var(--k-bad)]" role="alert" data-testid="economy-error">
            The economy sim failed: {error}
          </p>
        )}
        {reports.length === 0 ? (
          <p className="k-body-2">
            {running ? 'Running the autopilot…' : 'Pick seeds and dives, then Run.'}
          </p>
        ) : (
          <>
            <EconomyChart lines={economyLines(reports, show)} />
            <table className="w-full text-[14px] text-stone-200" data-testid="economy-table">
              <thead>
                <tr>
                  <th className={HEAD}>Dive</th>
                  <th className={HEAD}>Depth</th>
                  <th className={HEAD}>Deaths</th>
                  <th className={HEAD}>Forged (common to legendary)</th>
                  {MATERIAL_TOTALS.map((m) => (
                    <th key={m.id} className={HEAD}>
                      {m.label} in / quests / salvaged / spent / lost
                    </th>
                  ))}
                  <th className={HEAD}>Boons (offense to floor)</th>
                </tr>
              </thead>
              <tbody>
                {depth.map((_, i) => (
                  <tr key={i} className="tabular-nums" data-testid="economy-row">
                    <td className="px-1">{i + 1}</td>
                    <td className="px-1">{formatAmount(depth[i])}</td>
                    <td className="px-1">{deaths[i]}</td>
                    <td className="px-1">{forged.map((f) => formatAmount(f[i])).join(' · ')}</td>
                    {materials.map((cols, j) => (
                      <td key={MATERIAL_TOTALS[j].id} className="px-1">
                        {cols.map((c) => formatAmount(c[i])).join(' / ')}
                      </td>
                    ))}
                    <td className="px-1">{boons.map((b) => formatAmount(b[i])).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Panel>
    </div>
  );
}

const W = 960;
const H = 260;
const LEFT = 56;
const RIGHT = 16;
const TOP = 12;
const BOTTOM = 28;

/**
 * The chosen lines over the dives, in plain SVG: y from 0 to a tidy top, the
 * dive numbers below, and a legend that reads out each line's value at the
 * dive under the pointer (the last dive until then).
 */
function EconomyChart({ lines }: { lines: readonly EconomyLine[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(0, ...lines.map((l) => l.values.length));
  const top = niceCeil(Math.max(0, ...lines.flatMap((l) => l.values)));
  const x = (i: number) => LEFT + (n > 1 ? i / (n - 1) : 0.5) * (W - LEFT - RIGHT);
  const y = (v: number) => TOP + (1 - v / top) * (H - TOP - BOTTOM);
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0 || n === 0) return;
    const f = (((e.clientX - r.left) / r.width) * W - LEFT) / (W - LEFT - RIGHT);
    setHover(Math.min(n - 1, Math.max(0, Math.round(f * (n - 1)))));
  };
  const at = Math.min(hover ?? n - 1, n - 1);

  return (
    <div className="k-well mb-2 p-2" data-testid="economy-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label="Per dive"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(top * f)} y2={y(top * f)} stroke="#ffffff1a" />
            <text
              x={LEFT - 6}
              y={y(top * f)}
              dy="0.32em"
              textAnchor="end"
              fontSize={14}
              fill="#a8a29e"
            >
              {formatAmount(top * f)}
            </text>
          </g>
        ))}
        {Array.from({ length: n }, (_, i) =>
          n <= 20 || (i + 1) % 5 === 0 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={14} fill="#a8a29e">
              {i + 1}
            </text>
          ) : null,
        )}
        {hover !== null && (
          <line
            x1={x(at)}
            x2={x(at)}
            y1={TOP}
            y2={H - BOTTOM}
            stroke="#e7e5e4"
            strokeOpacity={0.5}
          />
        )}
        {lines.map((l) => (
          <path
            key={l.key}
            d={l.values
              .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
              .join('')}
            fill="none"
            stroke={l.color}
            strokeWidth={2}
            strokeLinejoin="round"
            data-testid="economy-line"
          />
        ))}
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[14px]" data-testid="economy-legend">
        <li className="text-stone-500">Dive {at + 1}</li>
        {lines.map((l) => (
          <li key={l.key} className="flex items-center gap-2">
            <span className="h-0.5 w-4 shrink-0" style={{ background: l.color }} />
            <b className="tabular-nums text-stone-100">{formatAmount(l.values[at] ?? 0)}</b>
            <span className="text-stone-400">{l.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
