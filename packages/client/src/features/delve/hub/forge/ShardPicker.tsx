import { shardTiersOf, type GearSlot, type HeroStatKey, type ShardRef } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../registry';
import { SLOT_LABEL } from '../../format';
import { pct, shardName } from './materials-text';

/**
 * The shards held that a line of a `slot` item can take: each affix the slot
 * allows, but `exclude`, at every tier held, with its count and roll band. A
 * plain list: the caller holds the pad scope and its Back.
 */
export function ShardPicker({
  slot,
  exclude,
  selected = null,
  onPick,
}: {
  slot: GearSlot;
  exclude: readonly HeroStatKey[];
  selected?: ShardRef | null;
  onPick: (shard: ShardRef) => void;
}) {
  const registry = getDelveRegistry();
  const pouch = useDelveStore((s) => s.profile.materials.shards);
  const held = registry
    .getDelveData()
    .affixes.filter((a) => a.slots.includes(slot) && !exclude.includes(a.stat))
    .flatMap((a) =>
      shardTiersOf(registry, a.stat).flatMap((band) => {
        const n = pouch[a.stat]?.[band.tier - 1] ?? 0;
        return n > 0 ? [{ shard: { stat: a.stat, tier: band.tier }, n, band }] : [];
      }),
    );
  if (held.length === 0)
    return (
      <p className="k-body-2" data-testid="shard-none">
        No shards fit a {SLOT_LABEL[slot]}. Buy tier I at the shard bench, or salvage gear.
      </p>
    );
  return (
    <div className="flex flex-col gap-2" data-testid="shard-picker">
      {held.map(({ shard, n, band }) => {
        const on = selected?.stat === shard.stat && selected.tier === shard.tier;
        return (
          <button
            key={`${shard.stat}-${shard.tier}`}
            type="button"
            className="k-well flex items-center justify-between gap-3 p-2 text-left"
            style={{ borderColor: on ? 'var(--k-hot)' : undefined }}
            aria-pressed={on}
            onClick={() => onPick(shard)}
            data-testid={`shard-pick-${shard.stat}-${shard.tier}`}
          >
            <span className="text-[16px]">
              {shardName(registry, shard)} ×{n}
            </span>
            <span className="k-caption">
              rolls {pct(band.min)}–{pct(band.max)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
