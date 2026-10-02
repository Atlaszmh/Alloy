import type { ReactElement } from 'react';
import { itemStatLines, type DataRegistry, type GearItem, type HeroStatKey } from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { formatStatValue } from '../format';

/** Gain and loss text. */
const GAIN = 'var(--k-ok)';
const LOSS = 'var(--k-bad-text)';

/** An item's stat lines summed by stat, in the order they first appear. */
function statTotals(registry: DataRegistry, item: GearItem): Map<HeroStatKey, number> {
  const totals = new Map<HeroStatKey, number>();
  for (const l of itemStatLines(item, registry))
    totals.set(l.stat, (totals.get(l.stat) ?? 0) + l.value);
  return totals;
}

/**
 * Every stat either item gives, side by side: what's worn, then this item,
 * green where this gives more and red where less. The item's stats come first,
 * then those only the worn one has.
 */
export function CompareTable({
  item,
  worn,
}: {
  item: GearItem;
  worn: GearItem | null;
}): ReactElement {
  const registry = getDelveRegistry();
  const mine = statTotals(registry, item);
  const theirs = worn ? statTotals(registry, worn) : new Map<HeroStatKey, number>();
  const stats = [...new Set([...mine.keys(), ...theirs.keys()])];
  const label = (stat: HeroStatKey) => registry.getGearAffix(stat)?.label ?? stat;
  const value = (stat: HeroStatKey, v: number | undefined) =>
    v === undefined ? '—' : formatStatValue(registry, stat, v);
  return (
    <table className="w-full text-[16px]" data-testid="compare-table">
      <thead>
        <tr className="k-label">
          <th className="pb-1.5 text-left font-normal">Stat</th>
          <th className="w-[90px] text-right font-normal">Worn</th>
          <th className="w-[90px] text-right font-normal">This</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((stat) => {
          const was = theirs.get(stat);
          const now = mine.get(stat);
          const d = (now ?? 0) - (was ?? 0);
          return (
            <tr
              key={stat}
              className="border-t-2 border-[var(--k-steel-1)]"
              data-testid={`compare-row-${stat}`}
            >
              <td className="py-[7px] text-[var(--k-text-2)]">{label(stat)}</td>
              <td className="text-right text-[var(--k-text-3)]">{value(stat, was)}</td>
              <td
                className="text-right font-semibold"
                style={{ color: d > 0 ? GAIN : d < 0 ? LOSS : 'var(--k-text-2)' }}
              >
                {value(stat, now)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
