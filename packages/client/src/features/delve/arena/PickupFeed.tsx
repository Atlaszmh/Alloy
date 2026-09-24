import { useLayoutEffect, useMemo, useRef } from 'react';
import { compareItem, findItem, referenceDepth, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
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
 * arena. Tap one to inspect it mid-fight; ▲ marks an upgrade, and one tap
 * equips every upgrade without leaving the floor.
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
    const out: { item: GearItem; equipped: boolean; delta: number | null }[] = [];
    for (const uid of diveDrops) {
      const found = findItem(profile, uid);
      if (!found) continue;
      const equipped = found.where === 'equipped';
      out.push({
        item: found.item,
        equipped,
        delta: equipped
          ? null
          : compareItem(profile.equipped, found.item, registry, depth).powerPct,
      });
    }
    return out;
  }, [diveDrops, profile, registry, depth]);

  const upgrades = rows.filter((r) => r.delta !== null && r.delta > UPGRADE_EPSILON).length;
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

  const onEquipUpgrades = () => {
    const equipped = useDelveStore.getState().equipBest();
    if (equipped.length > 0) {
      playSound('orbConfirm');
      vibrate('success');
      showToast(`Equipped ${equipped.length} upgrade${equipped.length > 1 ? 's' : ''}`);
    }
  };

  return (
    <div
      className="pointer-events-none absolute right-2 z-20 flex flex-col items-end gap-1.5"
      style={{ top }}
      data-testid="pickup-feed"
    >
      {upgrades > 0 && (
        <button
          className="delve-btn delve-btn-green pointer-events-auto px-2 py-1 text-[11px]"
          onClick={onEquipUpgrades}
          data-testid="equip-upgrades"
        >
          ▲ Equip {upgrades}
        </button>
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
