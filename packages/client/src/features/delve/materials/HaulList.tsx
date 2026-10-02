import type { ReactElement } from 'react';
import { formatNumber } from '../format';
import type { HaulRow } from './material-style';

/** A haul's rows: each a swatch in its colour, its name and its count; `struck` crosses the names out. */
export function HaulList({
  rows,
  struck = false,
}: {
  rows: readonly HaulRow[];
  struck?: boolean;
}): ReactElement {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-2 text-[14px]" data-testid="haul-row">
          <span aria-hidden className="size-[10px] flex-none" style={{ background: r.color }} />
          <span className={struck ? 'line-through' : undefined}>{r.name}</span>
          <b className="ml-auto pl-3">×{formatNumber(r.count)}</b>
        </li>
      ))}
    </ul>
  );
}
