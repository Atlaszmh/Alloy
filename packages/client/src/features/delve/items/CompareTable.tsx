import type { ReactElement } from 'react';
import { itemStatLines, type DataRegistry, type GearItem, type HeroStatKey } from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { formatStat } from '../format';

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
  // formatStat's "+12% Crit Chance" without its label.
  const value = (stat: HeroStatKey, v: number | undefined) =>
    v === undefined ? '—' : formatStat(registry, stat, v).slice(0, -label(stat).length - 1);
  return (
    <table className="w-full text-xs" data-testid="compare-table">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-stone-500">
          <th className="text-left font-normal">Stat</th>
          <th className="text-right font-normal">Worn</th>
          <th className="text-right font-normal">This</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((stat) => {
          const was = theirs.get(stat);
          const now = mine.get(stat);
          const d = (now ?? 0) - (was ?? 0);
          return (
            <tr key={stat} data-testid={`compare-row-${stat}`}>
              <td className="text-stone-300">{label(stat)}</td>
              <td className="text-right text-stone-400">{value(stat, was)}</td>
              <td
                className="text-right font-semibold"
                style={{ color: d > 0 ? '#4ade80' : d < 0 ? '#f87171' : '#d6d3d1' }}
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
