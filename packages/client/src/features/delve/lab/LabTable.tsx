import { memo } from 'react';
import { formatDps, type LabRow } from './lab-model';

/**
 * The results that pass the filters, ranked: their dimensions, then DPS as a
 * number and a bar scaled to the top row. A row whose held button never acted
 * is greyed as "can't afford". Each row's tick decides whether it is charted.
 */
export function LabTable({
  rows,
  columns,
  ticked,
  onTick,
}: {
  /** Already ranked (`rank`). */
  rows: readonly LabRow[];
  /** The view's `dims` keys, in order. */
  columns: readonly string[];
  ticked: ReadonlySet<string>;
  /** Keep it the same function: the rows are memoised on it. */
  onTick: (key: string) => void;
}) {
  const top = rows[0]?.result.dps || 1;
  return (
    <table className="w-full text-xs" data-testid="lab-table">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-widest text-stone-500">
          <th className="w-6 font-normal" />
          {columns.map((c) => (
            <th key={c} className="px-1 py-1 font-normal">
              {c}
            </th>
          ))}
          <th className="w-2/5 px-1 py-1 font-normal">DPS</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Row
            key={r.key}
            row={r}
            columns={columns}
            top={top}
            ticked={ticked.has(r.key)}
            onTick={onTick}
          />
        ))}
      </tbody>
    </table>
  );
}

/** One result. Memoised: thousands of rows, and a chip or a tick changes few of them. */
const Row = memo(function Row({
  row,
  columns,
  top,
  ticked,
  onTick,
}: {
  row: LabRow;
  columns: readonly string[];
  top: number;
  ticked: boolean;
  onTick: (key: string) => void;
}) {
  const acted = row.result.casts > 0;
  return (
    <tr
      className={acted ? 'text-stone-200' : 'text-stone-500'}
      data-testid="lab-row"
      data-key={row.key}
    >
      <td>
        <input
          type="checkbox"
          checked={ticked}
          onChange={() => onTick(row.key)}
          aria-label={`Chart ${row.key}`}
          data-testid={`lab-tick-${row.key}`}
        />
      </td>
      {columns.map((c) => (
        <td key={c} className="px-1">
          {row.setup.dims[c]}
        </td>
      ))}
      <td className="px-1">
        {acted ? (
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-right tabular-nums">
              {formatDps(row.result.dps)}
            </span>
            <div className="h-1.5 flex-1">
              <div
                className="h-full rounded-full bg-amber-400/70"
                data-testid="lab-bar"
                style={{ width: `${(row.result.dps / top) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          "can't afford"
        )}
      </td>
    </tr>
  );
});
