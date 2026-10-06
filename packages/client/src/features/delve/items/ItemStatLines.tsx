import type { ReactElement } from 'react';
import {
  attuneElement,
  inPair,
  itemStatLines,
  type GearItem,
  type HeroStatKey,
  type ItemStatLine,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { formatStat } from '../format';

/** Whether a stat line attunes an element outside the pair: it grants nothing. */
function useOffPair(stat: HeroStatKey): boolean {
  const pair = useDelveStore((s) => s.profile.pair);
  const el = attuneElement(stat);
  return !!el && !inPair({ pair }, el);
}

function qualityColor(roll: number): string {
  if (roll >= 0.9) return '#fbbf24';
  if (roll >= 0.6) return '#4ade80';
  if (roll >= 0.3) return '#60a5fa';
  return '#78716c';
}

/** Marks an attunement line of an element outside the pair: it grants nothing. */
function NotMine() {
  return (
    <span className="ml-1.5 text-[16px] text-[var(--k-text-3)]" data-testid="not-your-element">
      not your element
    </span>
  );
}

/** An implicit line, greyed when it attunes outside the pair. */
export function ImplicitLine({ line }: { line: ItemStatLine }) {
  const off = useOffPair(line.stat);
  return (
    <div className="text-[18px]" style={{ color: off ? '#57534e' : '#d6d3d1' }}>
      {formatStat(getDelveRegistry(), line.stat, line.value)}
      {off && <NotMine />}
    </div>
  );
}

/** An affix line's text, its PERFECT mark and its quality bar, inside the row that holds it. */
export function AffixLine({ line }: { line: ItemStatLine }) {
  const off = useOffPair(line.stat);
  return (
    <>
      <div className="flex items-center justify-between text-[18px]">
        <span style={{ color: off ? '#57534e' : '#93c5fd' }}>
          {formatStat(getDelveRegistry(), line.stat, line.value)}
          {off && <NotMine />}
        </span>
        {line.roll >= 0.9 && <span className="k-label text-amber-300">PERFECT</span>}
      </div>
      <div className="delve-quality mt-1">
        <span
          style={{
            width: `${Math.round(line.roll * 100)}%`,
            background: qualityColor(line.roll),
          }}
        />
      </div>
    </>
  );
}

/** An item's stat lines, read-only: its implicits, a rule, then its affixes with their quality. */
export function ItemStatLines({ item }: { item: GearItem }): ReactElement {
  const lines = itemStatLines(item, getDelveRegistry());
  const implicits = lines.filter((l) => l.source === 'implicit');
  const affixes = lines.filter((l) => l.source === 'affix');
  return (
    <div className="space-y-1.5" data-testid="item-stat-lines">
      {implicits.map((l, i) => (
        <ImplicitLine key={`i${i}`} line={l} />
      ))}
      {implicits.length > 0 && affixes.length > 0 && <div className="my-1 h-px bg-white/10" />}
      {affixes.map((l, i) => (
        <div key={`a${i}-${l.stat}`} className="rounded-md px-1.5 py-1" data-testid="item-affix">
          <AffixLine line={l} />
        </div>
      ))}
    </div>
  );
}
