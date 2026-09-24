import { useMemo, useRef, useState } from 'react';
import {
  checkFusion,
  fuseCost,
  nextRarity,
  upgradeCost,
  GEAR_SLOTS,
  type GearItem,
  type Rarity,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from './registry';
import { ItemTile } from './ItemTile';
import { RARITY_COLOR, RARITY_LABEL, formatNumber } from './format';

const FUSABLE: Rarity[] = ['common', 'uncommon', 'magic', 'rare', 'epic'];

export function ForgePanel({ onSelect }: { onSelect: (uid: string) => void }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const [rarity, setRarity] = useState<Rarity>('common');
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<GearItem | null>(null);
  const [busy, setBusy] = useState(false);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const resultRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const c = Object.fromEntries(FUSABLE.map((r) => [r, 0])) as Record<Rarity, number>;
    for (const i of profile.bag) if (!i.locked && i.rarity !== 'legendary') c[i.rarity]++;
    return c;
  }, [profile.bag]);

  const pool = profile.bag.filter((i) => i.rarity === rarity && !i.locked);
  const pickedItems = picked
    .map((uid) => profile.bag.find((i) => i.uid === uid))
    .filter(Boolean) as GearItem[];
  const check = checkFusion(pickedItems);
  const cost = pickedItems.length === 3 ? fuseCost(registry, pickedItems) : null;
  const target = nextRarity(rarity);

  const toggle = (uid: string) => {
    setResult(null);
    setPicked((p) =>
      p.includes(uid) ? p.filter((u) => u !== uid) : p.length < 3 ? [...p, uid] : p,
    );
    playSound('orbSelect');
  };

  const chooseRarity = (r: Rarity) => {
    setRarity(r);
    setPicked([]);
    setResult(null);
  };

  const autoPick = () => {
    setResult(null);
    setPicked(pool.slice(0, 3).map((i) => i.uid));
  };

  const onFuse = async () => {
    if (!check.ok || busy) return;
    setBusy(true);
    playSound('forgeCreak');
    // Converge the three input tiles on the centre before the result appears.
    const centre = resultRef.current?.getBoundingClientRect();
    const anims = slotRefs.current.map((el) => {
      if (!el || !centre) return null;
      const r = el.getBoundingClientRect();
      const dx = centre.left + centre.width / 2 - (r.left + r.width / 2);
      const dy = centre.top + centre.height / 2 - (r.top + r.height / 2);
      return el.animate(
        [
          { transform: 'translate(0,0) scale(1)', filter: 'brightness(1)' },
          {
            transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 18}px) scale(1.1)`,
            filter: 'brightness(1.6)',
            offset: 0.5,
          },
          {
            transform: `translate(${dx}px, ${dy}px) scale(0.2)`,
            filter: 'brightness(3)',
            opacity: 0,
          },
        ],
        { duration: 650, easing: 'cubic-bezier(0.5, 0, 0.8, 0.6)' },
      );
    });
    await Promise.all(anims.map((a) => a?.finished.catch(() => undefined)));

    const res = useDelveStore.getState().fuse(picked);
    setBusy(false);
    setPicked([]);
    if (!res.ok || !res.item) {
      playSound('combineFail');
      return;
    }
    setResult(res.item);
    playSound(res.item.rarity === 'legendary' ? 'lootLegendary' : 'combineMerge');
    vibrate(res.item.rarity === 'legendary' ? 'heavy' : 'success');
    requestAnimationFrame(() => {
      resultRef.current?.animate(
        [
          { transform: 'scale(0.2) rotate(-20deg)', filter: 'brightness(3)' },
          { transform: 'scale(1.25) rotate(4deg)', filter: 'brightness(1.8)', offset: 0.6 },
          { transform: 'scale(1) rotate(0)', filter: 'brightness(1)' },
        ],
        { duration: 600, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)' },
      );
    });
  };

  const upgradeRows = GEAR_SLOTS.map((slot) => profile.equipped[slot]).filter(
    Boolean,
  ) as GearItem[];

  const onQuickUpgrade = (uid: string, el: HTMLElement | null) => {
    const res = useDelveStore.getState().upgrade(uid);
    if (res.ok) {
      playSound('upgradeTier');
      vibrate('light');
      el?.animate(
        [
          { filter: 'brightness(2)', transform: 'scale(1.06)' },
          { filter: 'brightness(1)', transform: 'scale(1)' },
        ],
        {
          duration: 350,
        },
      );
    } else {
      playSound('combineFail');
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="forge-panel">
      {/* Alloy Fusion */}
      <section className="delve-panel p-3">
        <div className="delve-display text-sm font-bold uppercase tracking-widest text-amber-300">
          Alloy Fusion
        </div>
        <p className="mt-0.5 text-xs text-stone-400">
          Melt three items of one rarity into one item of the next. Keeps the highest item level and
          forge level.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {FUSABLE.map((r) => (
            <button
              key={r}
              type="button"
              className="delve-chip"
              aria-pressed={rarity === r}
              onClick={() => chooseRarity(r)}
              style={{ color: RARITY_COLOR[r] }}
            >
              {RARITY_LABEL[r]} · {counts[r]}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} ref={(el) => void (slotRefs.current[i] = el)}>
              <ItemTile
                item={pickedItems[i] ?? null}
                size={54}
                onClick={pickedItems[i] ? () => toggle(pickedItems[i].uid) : undefined}
                label={pickedItems[i] ? `Remove ${pickedItems[i].name}` : 'Empty fusion slot'}
              />
            </div>
          ))}
          <span className="px-1 text-xl text-stone-500">→</span>
          <div ref={resultRef} data-testid="fusion-result">
            {result ? (
              <ItemTile item={result} size={62} onClick={() => onSelect(result.uid)} />
            ) : (
              <div
                className="delve-display flex h-[62px] w-[62px] items-center justify-center rounded-[14%] border border-dashed text-center text-[10px] leading-tight"
                style={{
                  borderColor: target ? RARITY_COLOR[target] : '#555',
                  color: target ? RARITY_COLOR[target] : '#777',
                }}
              >
                {target ? RARITY_LABEL[target] : '—'}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            className="delve-btn flex-1 text-sm"
            onClick={autoPick}
            disabled={pool.length < 3 || busy}
          >
            Auto-pick
          </button>
          <button
            className="delve-btn delve-btn-gold flex-[2] text-sm"
            disabled={!check.ok || busy || (cost !== null && cost > profile.scrap)}
            onClick={onFuse}
            data-testid="fuse-button"
          >
            {cost === null ? 'Pick 3 items' : `Fuse · ⚙ ${formatNumber(cost)}`}
          </button>
        </div>

        {pool.length > 0 && (
          <div
            className="mt-3 grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(50px, 1fr))' }}
          >
            {pool.map((item) => (
              <div key={item.uid} className="flex justify-center">
                <ItemTile
                  item={item}
                  size={50}
                  selected={picked.includes(item.uid)}
                  onClick={() => toggle(item.uid)}
                  testId="fuse-candidate"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quick upgrades */}
      <section className="delve-panel p-3">
        <div className="delve-display text-sm font-bold uppercase tracking-widest text-amber-300">
          Temper Gear
        </div>
        <p className="mt-0.5 text-xs text-stone-400">
          Each forge level adds +10% to every stat on the item.
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {upgradeRows.map((item) => {
            const cost = upgradeCost(registry, item);
            return (
              <div key={item.uid} className="flex items-center gap-2" data-testid="temper-row">
                <ItemTile item={item} size={40} onClick={() => onSelect(item.uid)} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm" style={{ color: RARITY_COLOR[item.rarity] }}>
                    {item.name}
                  </div>
                  <div className="text-[11px] text-stone-500">Forge level +{item.upgrade}</div>
                </div>
                <button
                  className="delve-btn delve-btn-gold px-3 py-1.5 text-xs"
                  disabled={cost === null || cost > profile.scrap}
                  onClick={(e) => onQuickUpgrade(item.uid, e.currentTarget.parentElement)}
                >
                  {cost === null ? 'MAX' : `+1 · ⚙ ${formatNumber(cost)}`}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
