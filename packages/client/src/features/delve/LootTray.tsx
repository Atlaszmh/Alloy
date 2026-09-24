import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { compareItem, findItem, referenceDepth, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { getDelveRegistry } from './registry';
import { ItemTile } from './ItemTile';
import { UPGRADE_EPSILON } from './format';

interface LootTrayProps {
  /** Element new loot flies out of (the monster). */
  originRef: RefObject<HTMLElement | null>;
  onSelect: (uid: string) => void;
}

const TILE = 52;

export function LootTray({ originRef, onSelect }: LootTrayProps) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const diveDrops = useDelveStore((s) => s.diveDrops);
  const newUids = useDelveStore((s) => s.newUids);
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());
  const animated = useRef<Set<string> | null>(null);
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

  // Fly freshly dropped tiles in from the monster (FLIP on the real tiles).
  useLayoutEffect(() => {
    if (!animated.current) {
      animated.current = new Set(diveDrops);
      return;
    }
    const origin = originRef.current?.getBoundingClientRect();
    let order = 0;
    for (const uid of diveDrops) {
      if (animated.current.has(uid)) continue;
      animated.current.add(uid);
      const el = tileRefs.current.get(uid);
      if (!el || !origin) continue;
      const r = el.getBoundingClientRect();
      const dx = origin.left + origin.width / 2 - (r.left + r.width / 2);
      const dy = origin.top + origin.height / 2 - (r.top + r.height / 2);
      const delay = 260 + order * 130;
      order++;
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0 },
          { transform: `translate(${dx}px, ${dy - 50}px) scale(1.5)`, opacity: 1, offset: 0.3 },
          {
            transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 70}px) scale(1.25)`,
            opacity: 1,
            offset: 0.6,
          },
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        ],
        { duration: 820, delay, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)', fill: 'backwards' },
      );
    }
  }, [diveDrops, originRef]);

  const onEquipUpgrades = () => {
    const equipped = useDelveStore.getState().equipBest();
    if (equipped.length > 0) {
      playSound('orbConfirm');
      vibrate('success');
      showToast(`Equipped ${equipped.length} upgrade${equipped.length > 1 ? 's' : ''}`);
    }
  };

  return (
    <div className="delve-column pb-2" data-testid="loot-tray">
      <div className="mb-1 flex items-center justify-between">
        <span className="delve-display text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400">
          Loot {rows.length > 0 && <span className="text-stone-500">· {rows.length}</span>}
        </span>
        {upgrades > 0 && (
          <button
            className="delve-btn delve-btn-green px-2.5 py-1 text-xs"
            onClick={onEquipUpgrades}
            data-testid="equip-upgrades"
          >
            ▲ Equip upgrades ({upgrades})
          </button>
        )}
      </div>
      <div
        className="delve-scroll flex gap-2 overflow-x-auto overflow-y-visible py-1"
        style={{ minHeight: TILE + 8 }}
      >
        {rows.length === 0 && (
          <div className="flex h-[52px] items-center text-xs text-stone-500">
            Loot you find this dive lands here.
          </div>
        )}
        {rows.map(({ item, equipped, delta }) => (
          <ItemTile
            key={item.uid}
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
        ))}
      </div>
    </div>
  );
}
