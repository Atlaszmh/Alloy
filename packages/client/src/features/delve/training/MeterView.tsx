import { Button, Chip } from '@/features/delve/kit';
import { formatNumber } from '../format';
import { getDelveRegistry } from '../registry';
import { BUCKET_LABEL, METER_BUCKETS, METER_WINDOW, type MeterSummary } from './meter';

/** The live readout in the Training bar: DPS · total · reset (never wraps). */
export function MeterChip({ meter, onReset }: { meter: MeterSummary; onReset: () => void }) {
  return (
    <div
      className="k-well flex items-center gap-3 whitespace-nowrap px-3 py-0.5 text-[16px]"
      data-testid="meter-chip"
    >
      <span className="k-disp text-[20px] text-[var(--k-hot)]" data-testid="meter-dps">
        {formatNumber(meter.dps)} DPS
      </span>
      <span className="text-[var(--k-text-3)]">·</span>
      <span
        className="text-[var(--k-text-2)]"
        data-testid="meter-total"
        data-total={Math.round(meter.total)}
      >
        {formatNumber(meter.total)} total
      </span>
      <Chip onClick={onReset} testId="meter-reset">
        Reset
      </Chip>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="k-well flex flex-col gap-1 p-2">
      <div className="k-disp text-[24px]">{value}</div>
      <div className="k-caption">{label}</div>
    </div>
  );
}

/** The full breakdown: damage by source, the biggest hit, and reactions by name. */
export function MeterTab({ meter, onReset }: { meter: MeterSummary; onReset: () => void }) {
  const reactions = getDelveRegistry().getArpgData().reactions;
  return (
    <div className="flex flex-col gap-3 text-[16px]" data-testid="meter-tab">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label={`DPS (last ${METER_WINDOW}s)`} value={formatNumber(meter.dps)} />
        <Stat label="Total" value={formatNumber(meter.total)} />
        <Stat label="Biggest hit" value={formatNumber(meter.biggest)} />
      </div>
      <table className="w-full">
        <thead>
          <tr className="k-caption">
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
                style={{ color: row.hits > 0 ? 'var(--k-text)' : 'var(--k-text-3)' }}
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
      <div className="flex flex-wrap gap-x-3 gap-y-1" data-testid="meter-reactions">
        {reactions.map((r) => (
          <span
            key={r.id}
            style={{ color: meter.reactions[r.id] ? 'var(--k-hot-hi)' : 'var(--k-text-3)' }}
          >
            {r.name} ×{meter.reactions[r.id] ?? 0}
          </span>
        ))}
      </div>
      <p className="k-note">
        Each reaction counts the pairs of stacks it used up. Melt, Shatter, Soulfire, Combust and
        Crystallize multiply the hit that set them off, so their damage stays in that hit&apos;s
        row; Sunder&apos;s bonus shows in later hits&apos; rows. Time is the fight&apos;s own, so
        slow motion doesn&apos;t change the DPS.
      </p>
      <Button size="sm" onClick={onReset} testId="meter-reset-all">
        Reset the meter
      </Button>
    </div>
  );
}
