import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { DPS_SECONDS } from '@alloy/engine';
import { formatDps } from './lab-model';

export interface ChartLine {
  key: string;
  label: string;
  color: string;
  /** Average DPS so far, every SAMPLE seconds: index i is at (i + 1) × SAMPLE. */
  series: readonly number[];
}

const H = 240;
const LEFT = 44;
const RIGHT = 12;
const TOP = 10;
const BOTTOM = 22;
const SAMPLE = 0.5;
/** The y scale ignores the samples before this: mana payments front-load, and those clip. */
const SETTLED = 3;

/** Round up to a tidy axis top: 437 → 450, 1046 → 1500. */
function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return (Math.ceil((v / p) * 2) / 2) * p;
}

/**
 * DPS over time for the ticked rows, in plain SVG: one path per line, y from
 * 0 to the highest sample from 3 s on (earlier ones clip at the top edge), a
 * legend, and a crosshair that reads out the time and each line's DPS. The
 * drawing is as wide as its panel, so text keeps its size on any screen.
 */
export function LabChart({ lines }: { lines: readonly ChartLine[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, e.contentRect.width)));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const top = niceCeil(Math.max(0, ...lines.flatMap((l) => l.series.slice(SETTLED / SAMPLE - 1))));
  const x = (t: number) => LEFT + (t / DPS_SECONDS) * (w - LEFT - RIGHT);
  const y = (v: number) => TOP + (1 - Math.min(v, top) / top) * (H - TOP - BOTTOM);
  const last = DPS_SECONDS / SAMPLE - 1;
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0) return;
    const t = ((((e.clientX - r.left) / r.width) * w - LEFT) / (w - LEFT - RIGHT)) * DPS_SECONDS;
    setHover(Math.min(last, Math.max(0, Math.round(t / SAMPLE) - 1)));
  };
  const at = hover ?? last;

  return (
    <div ref={box} className="delve-panel mb-2 p-2" data-testid="lab-chart">
      <svg
        viewBox={`0 0 ${w} ${H}`}
        className="block w-full"
        role="img"
        aria-label="DPS over time"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={LEFT} x2={w - RIGHT} y1={y(top * f)} y2={y(top * f)} stroke="#ffffff1a" />
            <text
              x={LEFT - 6}
              y={y(top * f)}
              dy="0.32em"
              textAnchor="end"
              fontSize={10}
              fill="#a8a29e"
              data-testid={f === 1 ? 'lab-y-top' : undefined}
            >
              {formatDps(top * f)}
            </text>
          </g>
        ))}
        {[0, 5, 10, 15, 20, 25, 30].map((t) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor="middle" fontSize={10} fill="#a8a29e">
            {t}s
          </text>
        ))}
        {lines.map((l) => (
          <path
            key={l.key}
            d={l.series
              .map((v, i) => `${i ? 'L' : 'M'}${x((i + 1) * SAMPLE).toFixed(1)},${y(v).toFixed(1)}`)
              .join('')}
            fill="none"
            stroke={l.color}
            strokeWidth={2}
            strokeLinejoin="round"
            data-testid="lab-line"
          />
        ))}
        {hover !== null && (
          <line
            x1={x((hover + 1) * SAMPLE)}
            x2={x((hover + 1) * SAMPLE)}
            y1={TOP}
            y2={H - BOTTOM}
            stroke="#e7e5e4"
            strokeOpacity={0.5}
            data-testid="lab-crosshair"
          />
        )}
      </svg>
      <ul className="mt-1 flex flex-col gap-0.5 text-[11px]" data-testid="lab-legend">
        <li className="text-stone-500" data-testid="lab-readout-time">
          {hover === null ? 'DPS over 30 s' : `DPS at ${(hover + 1) * SAMPLE} s`}
        </li>
        {lines.map((l) => (
          <li key={l.key} className="flex items-center gap-2">
            <span className="h-0.5 w-4 shrink-0 rounded" style={{ background: l.color }} />
            <b className="w-12 shrink-0 text-right tabular-nums text-stone-100">
              {formatDps(l.series[at] ?? 0)}
            </b>
            <span className="truncate text-stone-400">{l.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
