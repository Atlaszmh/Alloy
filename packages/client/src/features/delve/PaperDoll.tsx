import { useMemo } from 'react';
import { computeHeroStats, estimateCombat, referenceDepth, type GearSlot } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from './registry';
import { ItemTile } from './ItemTile';
import { formatNumber, SLOT_LABEL } from './format';

const LAYOUT: (GearSlot | 'dps' | 'ehp')[] = [
  'weapon',
  'helm',
  'amulet',
  'dps',
  'chest',
  'ehp',
  'gloves',
  'boots',
  'ring',
];

function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <span className="text-[10px] uppercase tracking-widest text-stone-500">{label}</span>
      <span className="delve-display text-lg font-bold text-stone-100">{value}</span>
      {sub && <span className="text-[10px] text-stone-500">{sub}</span>}
    </div>
  );
}

export function PaperDoll({
  onSelect,
  tileSize = 64,
}: {
  onSelect: (uid: string) => void;
  tileSize?: number;
}) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const newUids = useDelveStore((s) => s.newUids);
  const stats = useMemo(
    () => computeHeroStats(profile.equipped, registry),
    [profile.equipped, registry],
  );
  const est = useMemo(
    () => estimateCombat(stats, registry, referenceDepth(profile)),
    [stats, registry, profile],
  );

  return (
    <div
      className="grid place-items-center gap-2"
      style={{ gridTemplateColumns: `repeat(3, ${tileSize + 12}px)`, justifyContent: 'center' }}
      data-testid="paper-doll"
    >
      {LAYOUT.map((cell) => {
        if (cell === 'dps') {
          return (
            <StatBlock
              key={cell}
              label="Damage"
              value={formatNumber(est.dps)}
              sub={`${(
                stats.weapon.combo.length /
                (stats.attackInterval * stats.weapon.combo.reduce((a, s) => a + s.time, 0))
              ).toFixed(2)} atk/s`}
            />
          );
        }
        if (cell === 'ehp') {
          return (
            <StatBlock
              key={cell}
              label="Life"
              value={formatNumber(stats.maxHp)}
              sub={`${formatNumber(stats.armor)} armor`}
            />
          );
        }
        const item = profile.equipped[cell] ?? null;
        return (
          <div key={cell} className="flex flex-col items-center gap-0.5">
            <ItemTile
              item={item}
              slot={cell}
              size={tileSize}
              isNew={item ? newUids[item.uid] : false}
              onClick={item ? () => onSelect(item.uid) : undefined}
              testId={`slot-${cell}`}
            />
            <span className="text-[9px] uppercase tracking-widest text-stone-500">
              {SLOT_LABEL[cell]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
