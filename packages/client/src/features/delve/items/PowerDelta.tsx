import type { ReactElement } from 'react';
import type { ItemComparison } from '@alloy/engine';
import { UPGRADE_EPSILON, formatDelta } from '../format';

/**
 * Power, Damage and Toughness against what's worn, under `label` when given;
 * with no comparison, dashes.
 */
export function PowerDelta({
  cmp,
  label,
}: {
  cmp: ItemComparison | null;
  label?: string;
}): ReactElement {
  const row = (
    <div className="flex">
      <DeltaCell label="Power" value={cmp ? cmp.powerPct : null} />
      <DeltaCell label="Damage" value={cmp ? cmp.dpsPct : null} />
      <DeltaCell label="Toughness" value={cmp ? cmp.ehpPct : null} />
    </div>
  );
  if (!label) return row;
  return (
    <>
      <div className="k-label text-center">{label}</div>
      {row}
    </>
  );
}

function DeltaCell({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0;
  // Gain and loss text (the kit's `--k-ok` and `--k-bad-text`), else secondary.
  const color = v > UPGRADE_EPSILON ? '#63c74d' : v < -UPGRADE_EPSILON ? '#f6757a' : '#c0cbdc';
  const arrow = v > UPGRADE_EPSILON ? '▲' : v < -UPGRADE_EPSILON ? '▼' : '';
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <span className="k-label">{label}</span>
      <span className="k-disp text-[22px]" style={{ color }}>
        {value === null ? (
          '—'
        ) : (
          <>
            {arrow} {formatDelta(value)}
          </>
        )}
      </span>
    </div>
  );
}
