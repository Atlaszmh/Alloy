import { useLayoutEffect, useMemo, useRef } from 'react';
import { compareItem, findItem, referenceDepth, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { ItemTile } from '../ItemTile';
import { UPGRADE_EPSILON } from '../format';

const TILE = 46;
const SHOWN = 4;

interface PickupFeedProps {
  onSelect: (uid: string) => void;
  /** Distance from the top of the arena, clear of the HUD. */
  top: number;
}

/**
 * The last few items picked up this dive, stacked on the right edge of the
 * arena. Tap one to inspect it mid-fight; ▲ marks an upgrade, to equip at the
 * Anvil (gear is locked while a dive runs), ◇ a weapon better only once your
 * moveset moves onto it (Transfer).
 */
export function PickupFeed({ onSelect, top }: PickupFeedProps) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const diveDrops = useDelveStore((s) => s.diveDrops);
  const newUids = useDelveStore((s) => s.newUids);
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());
  const seen = useRef<Set<string> | null>(null);
  const depth = referenceDepth(profile);

  const rows = useMemo(() => {
    const out: {
      item: GearItem;
      equipped: boolean;
      /** The Power change as a home for your moveset (Transfer); `asIs`, as it comes. */
      delta: number | null;
      asIs: number | null;
    }[] = [];
    for (const uid of diveDrops) {
      const found = findItem(profile, uid);
      if (!found) continue;
      const { item } = found;
      const equipped = found.where === 'equipped';
      const value = (as: 'home' | 'asIs') =>
        compareItem(profile.equipped, item, registry, depth, profile.pair, as).powerPct;
      const delta = equipped ? null : value('home');
      // Only a weapon carries a moveset: anything else is the same either way.
      const asIs = equipped || item.slot !== 'weapon' ? delta : value('asIs');
      out.push({ item, equipped, delta, asIs });
    }
    return out;
  }, [diveDrops, profile, registry, depth]);

  // ▲ what's better as it comes; ◇ a weapon better only with your moveset moved onto it.
  const up = (d: number | null) => d !== null && d > UPGRADE_EPSILON;
  const upgrades = rows.filter((r) => up(r.asIs)).length;
  const potential = rows.filter((r) => up(r.delta) && !up(r.asIs)).length;
  const visible = rows.slice(0, SHOWN);

  // Slide fresh pickups in from the arena edge (on the real tiles).
  useLayoutEffect(() => {
    if (!seen.current) {
      seen.current = new Set(diveDrops);
      return;
    }
    let order = 0;
    for (const uid of diveDrops) {
      if (seen.current.has(uid)) continue;
      seen.current.add(uid);
      const el = tileRefs.current.get(uid);
      if (!el) continue;
      el.animate(
        [
          { transform: 'translateX(-90px) scale(1.6)', opacity: 0 },
          { transform: 'translateX(-20px) scale(1.25)', opacity: 1, offset: 0.45 },
          { transform: 'translateX(0) scale(1)', opacity: 1 },
        ],
        {
          duration: 520,
          delay: order++ * 90,
          easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)',
          fill: 'backwards',
        },
      );
    }
  }, [diveDrops]);

  if (rows.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute right-2 z-20 flex flex-col items-end gap-1.5"
      style={{ top }}
      data-testid="pickup-feed"
    >
      {upgrades > 0 && (
        <span
          className="delve-display text-[10px] uppercase tracking-wider text-green-300"
          data-testid="upgrades-locked"
        >
          ▲ {upgrades} to equip at the Anvil
        </span>
      )}
      {potential > 0 && (
        <span
          className="delve-display text-[10px] uppercase tracking-wider text-sky-300"
          data-testid="upgrades-potential"
        >
          ◇ {potential} potential: Transfer at the Anvil
        </span>
      )}
      {visible.map(({ item, equipped, delta }) => (
        <div key={item.uid} className="pointer-events-auto">
          <ItemTile
            ref={(el) => {
              if (el) tileRefs.current.set(item.uid, el);
              else tileRefs.current.delete(item.uid);
            }}
            item={item}
            size={TILE}
            delta={delta}
            equipped={equipped}
            isNew={newUids[item.uid]}
            onClick={() => onSelect(item.uid)}
            testId="loot-item"
          />
        </div>
      ))}
      {rows.length > SHOWN && (
        <span className="delve-display text-[10px] uppercase tracking-wider text-stone-400">
          +{rows.length - SHOWN} more
        </span>
      )}
    </div>
  );
}
