import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

export interface BoxPlotEntry {
  label: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

interface StatBoxPlotProps {
  data: BoxPlotEntry[];
  title: string;
}

const THEME = {
  bg: '#0f1117',
  surface: '#18181b',
  border: '#27272a',
  text: '#e4e4e7',
  muted: '#a1a1aa',
  accent: '#6366f1',
  success: '#22c55e',
} as const;

interface ChartDatum {
  label: string;
  // Bar: from min to max (full whisker range)
  whiskerBase: number;
  whiskerHeight: number;
  // Bar: from q1 to q3 (IQR)
  iqrBase: number;
  iqrHeight: number;
  // Median marker: base = median - tiny epsilon, height = tiny epsilon * 2
  medianBase: number;
  medianHeight: number;
  // Raw values for tooltip
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

function transform(entries: BoxPlotEntry[]): ChartDatum[] {
  return entries.map((e) => ({
    label: e.label,
    whiskerBase: e.min,
    whiskerHeight: e.max - e.min,
    iqrBase: e.q1,
    iqrHeight: e.q3 - e.q1,
    medianBase: e.median - 0.5,
    medianHeight: 1,
    min: e.min,
    q1: e.q1,
    median: e.median,
    q3: e.q3,
    max: e.max,
  }));
}

function BoxPlotTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  const rows: Array<{ label: string; value: number }> = [
    { label: 'Max', value: d.max },
    { label: 'Q3', value: d.q3 },
    { label: 'Median', value: d.median },
    { label: 'Q1', value: d.q1 },
    { label: 'Min', value: d.min },
  ];
  return (
    <div
      style={{
        background: THEME.surface,
        border: `1px solid ${THEME.border}`,
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: 12,
        color: THEME.text,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.label}</div>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: THEME.muted }}>{r.label}</span>
          <span>{r.value.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

export default function StatBoxPlot({ data, title }: StatBoxPlotProps) {
  const chartData = transform(data);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: THEME.text }}>{title}</div>
      {chartData.length === 0 ? (
        <div style={{ fontSize: 13, color: THEME.muted, padding: '24px 0', textAlign: 'center' }}>
          No data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} horizontal={true} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: THEME.muted }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: THEME.muted }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip content={<BoxPlotTooltip />} cursor={{ fill: `${THEME.accent}10` }} />

            {/* Whisker range (min → max) */}
            <Bar dataKey="whiskerHeight" stackId="box" fill="transparent" stroke={THEME.muted} strokeWidth={1}>
              {chartData.map((_, i) => (
                <Cell key={i} fill="transparent" />
              ))}
            </Bar>

            {/* IQR box (q1 → q3) */}
            <Bar dataKey="iqrHeight" stackId="iqr" fill={THEME.accent} fillOpacity={0.7} radius={[2, 2, 0, 0]} />

            {/* Median marker (thin bar) */}
            <Bar dataKey="medianHeight" stackId="median" fill={THEME.success} radius={[1, 1, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
