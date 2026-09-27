import { formatNumber } from '../format';
import { getDelveRegistry } from '../registry';
import { BUCKET_LABEL, METER_BUCKETS, METER_WINDOW, type MeterSummary } from './meter';

/** The live readout at the top of the Training Grounds HUD: DPS · total · reset (never wraps). */
export function MeterChip({ meter, onReset }: { meter: MeterSummary; onReset: () => void }) {
  return (
    <div
      className="delve-panel pointer-events-auto flex items-center gap-2 whitespace-nowrap px-2.5 py-1 text-xs"
      data-testid="meter-chip"
    >
      <span className="delve-display font-bold text-amber-300" data-testid="meter-dps">
        {formatNumber(meter.dps)} DPS
      </span>
      <span className="text-stone-500">·</span>
      <span
        className="text-stone-200"
        data-testid="meter-total"
        data-total={Math.round(meter.total)}
      >
        {formatNumber(meter.total)}
        <span className="hidden sm:inline"> total</span>
      </span>
      <button
        type="button"
        className="delve-chip px-2 py-0 text-[11px]"
        onClick={onReset}
        data-testid="meter-reset"
      >
        Reset
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="delve-panel p-2">
      <div className="delve-display text-lg font-bold text-stone-100">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
    </div>
  );
}

/** The full breakdown: damage by source, the biggest hit, and reactions by name. */
export function MeterTab({ meter, onReset }: { meter: MeterSummary; onReset: () => void }) {
  const reactions = getDelveRegistry().getArpgData().reactions;
  return (
    <div className="flex flex-col gap-3" data-testid="meter-tab">
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <Stat label={`DPS (last ${METER_WINDOW}s)`} value={formatNumber(meter.dps)} />
        <Stat label="Total" value={formatNumber(meter.total)} />
        <Stat label="Biggest hit" value={formatNumber(meter.biggest)} />
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-stone-500">
            <th className="py-1 text-left font-normal">Source</th>
            <th className="text-right font-normal">Hits</th>
            <th className="text-right font-normal">Damage</th>
            <th className="text-right font-normal">Share</th>
          </tr>
        </thead>
        <tbody>
          {METER_BUCKETS.map((b) => {
            const row = meter.buckets[b];
            return (
              <tr
                key={b}
                className={row.hits > 0 ? 'text-stone-200' : 'text-stone-600'}
                data-testid={`meter-${b}`}
                data-hits={row.hits}
                data-damage={Math.round(row.damage)}
              >
                <td className="py-0.5">{BUCKET_LABEL[b]}</td>
                <td className="text-right">{row.hits}</td>
                <td className="text-right">{formatNumber(row.damage)}</td>
                <td className="text-right">
                  {meter.total > 0 ? Math.round((row.damage / meter.total) * 100) : 0}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" data-testid="meter-reactions">
        {reactions.map((r) => (
          <span
            key={r.id}
            className={meter.reactions[r.id] ? 'text-fuchsia-300' : 'text-stone-600'}
          >
            {r.icon} {r.name} ×{meter.reactions[r.id] ?? 0}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-stone-500">
        Melt, Shatter and Soulfire multiply the hit that set them off, so their damage stays in that
        hit&apos;s row. Time is the fight&apos;s own, so slow motion doesn&apos;t change the DPS.
      </p>
      <button
        type="button"
        className="delve-btn text-sm"
        onClick={onReset}
        data-testid="meter-reset-all"
      >
        Reset the meter
      </button>
    </div>
  );
}
