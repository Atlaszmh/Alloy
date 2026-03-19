import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DamageHistogramProps {
  values: number[];
  title: string;
  color?: string;
  bucketCount?: number;
}

const THEME = {
  bg: '#0f1117',
  surface: '#18181b',
  border: '#27272a',
  text: '#e4e4e7',
  muted: '#a1a1aa',
  accent: '#6366f1',
} as const;

function computeBuckets(values: number[], bucketCount: number): Array<{ range: string; count: number }> {
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return [{ range: String(min), count: values.length }];
  }

  const bucketSize = (max - min) / bucketCount;
  const buckets: number[] = Array(bucketCount).fill(0);

  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / bucketSize), bucketCount - 1);
    buckets[idx]++;
  }

  return buckets.map((count, i) => {
    const lo = min + i * bucketSize;
    const hi = lo + bucketSize;
    const range = `${lo.toFixed(0)}–${hi.toFixed(0)}`;
    return { range, count };
  });
}

export default function DamageHistogram({
  values,
  title,
  color = THEME.accent,
  bucketCount = 20,
}: DamageHistogramProps) {
  const data = computeBuckets(values, bucketCount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: THEME.text }}>{title}</div>
      {data.length === 0 ? (
        <div style={{ fontSize: 13, color: THEME.muted, padding: '24px 0', textAlign: 'center' }}>
          No data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} vertical={false} />
            <XAxis
              dataKey="range"
              tick={{ fontSize: 10, fill: THEME.muted }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: THEME.muted }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: THEME.surface,
                border: `1px solid ${THEME.border}`,
                borderRadius: 6,
                fontSize: 12,
                color: THEME.text,
              }}
              cursor={{ fill: `${color}20` }}
            />
            <Bar dataKey="count" fill={color} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
