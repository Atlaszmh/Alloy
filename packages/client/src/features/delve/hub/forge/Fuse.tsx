import { useMemo, useRef, useState } from 'react';
import {
  checkFusion,
  fuseCost,
  nextRarity,
  unsocketMode,
  weaponParts,
  type GearItem,
  type Rarity,
} from '@alloy/engine';
import { partsText, pullText, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { Button, Chip, Price, Tile } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemIcon } from '../../ItemIcon';
import { RARITY_COLOR, RARITY_LABEL, RARITY_TEXT } from '../../format';

const FUSABLE: Rarity[] = ['common', 'uncommon', 'magic', 'rare', 'epic'];

const icon = (item: GearItem) => <ItemIcon baseId={item.baseId} rarity={item.rarity} />;

/**
 * Alloy Fusion: three unlocked bag items of one rarity melt into one of the
 * next, for scrap. Inputs holding runes ask first, naming what becomes of them.
 * `onResult` picks the new item (for the Temper bench).
 */
export function Fuse({ onResult }: { onResult: (uid: string) => void }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const unsocket = useDelveStore((s) => s.unsocket);
  const [rarity, setRarity] = useState<Rarity>('common');
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<GearItem | null>(null);
  const [busy, setBusy] = useState(false);
  // The picks a Fuse was pressed for once: inputs holding runes ask first.
  const [armed, setArmed] = useState<string | null>(null);
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
  const melts = pullText(
    registry,
    pickedItems.flatMap((i) => weaponParts(registry, i).runes),
    unsocketMode(registry, unsocket),
  );
  const asking = !!melts && armed === picked.join();

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
    if (melts && !asking) {
      setArmed(picked.join());
      return;
    }
    setBusy(true);
    playSound('forgeCreak');
    // Converge the three input tiles on the centre before the result appears.
    const centre = resultRef.current?.getBoundingClientRect();
    const anims = slotRefs.current.map((el) => {
      if (!el?.animate || !centre) return null;
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
    setArmed(null);
    if (!res.ok || !res.item) {
      playSound('combineFail');
      return;
    }
    setResult(res.item);
    if (res.links)
      showToast(`+${res.links} Link${res.links > 1 ? 's' : ''} from the weapons' extra slots`);
    const parts = partsText(registry, res.runes, res.destroyed);
    if (parts) showToast(parts);
    playSound(res.item.rarity === 'legendary' ? 'lootLegendary' : 'combineMerge');
    vibrate(res.item.rarity === 'legendary' ? 'heavy' : 'success');
    requestAnimationFrame(() => {
      resultRef.current?.animate?.(
        [
          { transform: 'scale(0.2) rotate(-20deg)', filter: 'brightness(3)' },
          { transform: 'scale(1.25) rotate(4deg)', filter: 'brightness(1.8)', offset: 0.6 },
          { transform: 'scale(1) rotate(0)', filter: 'brightness(1)' },
        ],
        { duration: 600, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)' },
      );
    });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="fuse-bench">
      <p className="k-caption">
        Melt three items of one rarity into one item of the next. Keeps the highest item level and
        forge level.
      </p>

      <div className="flex flex-wrap gap-2">
        {FUSABLE.map((r) => (
          <Chip key={r} pressed={rarity === r} onClick={() => chooseRarity(r)}>
            <span aria-hidden className="k-swatch" style={{ background: RARITY_COLOR[r] }} />
            {RARITY_LABEL[r]} · {counts[r]}
          </Chip>
        ))}
      </div>

      <div className="flex items-center justify-center gap-3">
        {[0, 1, 2].map((i) => {
          const item = pickedItems[i];
          return (
            <div key={i} ref={(el) => void (slotRefs.current[i] = el)}>
              <Tile
                rarity={item?.rarity ?? null}
                icon={item && icon(item)}
                disabled={!item}
                onClick={item ? () => toggle(item.uid) : undefined}
                label={item ? `Remove ${item.name}` : 'Empty fusion slot'}
              />
            </div>
          );
        })}
        <span aria-hidden className="k-disp px-1 text-[32px] text-[var(--k-text-3)]">
          →
        </span>
        <div ref={resultRef} data-testid="fusion-result">
          {result ? (
            <Tile
              rarity={result.rarity}
              icon={icon(result)}
              label={`${result.name}: temper it`}
              onClick={() => onResult(result.uid)}
            />
          ) : (
            <div
              className="k-disp flex h-[84px] w-[84px] items-center justify-center border-[3px] border-dashed text-center text-[16px]"
              style={{
                borderColor: target ? RARITY_COLOR[target] : 'var(--k-steel-2)',
                color: target ? RARITY_TEXT[target] : 'var(--k-text-3)',
              }}
            >
              {target ? RARITY_LABEL[target] : '—'}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <Button className="flex-1" onClick={autoPick} disabled={pool.length < 3 || busy}>
          Auto-pick
        </Button>
        <Button
          variant="primary"
          className="flex-[2]"
          disabled={!check.ok || busy || (cost !== null && cost > profile.scrap)}
          onClick={onFuse}
          testId="fuse-button"
        >
          {cost === null ? (
            'Pick 3 items'
          ) : asking ? (
            `Tap again to fuse · ${melts}`
          ) : (
            <>
              Fuse · <Price scrap={cost} />
            </>
          )}
        </Button>
      </div>

      {pool.length > 0 && (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}
        >
          {pool.map((item) => (
            <Tile
              key={item.uid}
              rarity={item.rarity}
              icon={icon(item)}
              size={64}
              selected={picked.includes(item.uid)}
              onClick={() => toggle(item.uid)}
              label={item.name}
              testId="fuse-candidate"
            />
          ))}
        </div>
      )}
    </div>
  );
}
