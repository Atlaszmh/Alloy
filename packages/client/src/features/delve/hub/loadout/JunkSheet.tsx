import { useRef, useState, type ReactElement } from 'react';
import { salvageYield } from '@alloy/engine';
import { partsText, useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Dialog, Price, usePrompts } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { RARITY_TEXT, formatNumber } from '../../format';

/** Salvage the rest: Y, or Ctrl+Enter on the keys (the grammar's "commit"). */
const SALVAGE_REST = { key: 'Enter', ctrl: true, pad: 'y' } as const;

/**
 * Salvage junk's review sheet (the pad-first spec, 4): each candidate (`uids`, the engine's
 * `salvageCandidates`) with what it gives (`salvageYield`), A keeping one back, and Y salvaging
 * the rest through the store's `salvage` (so its Undo is offered), with the total. A wrapping list.
 */
export function JunkSheet({
  uids,
  onClose,
}: {
  uids: readonly string[];
  onClose: () => void;
}): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const body = useRef<HTMLDivElement>(null);
  const items = uids.flatMap((uid) => profile.bag.find((i) => i.uid === uid) ?? []);
  const yields = new Map(items.map((i) => [i.uid, salvageYield(registry, profile, i)]));
  const going = items.filter((i) => !kept.has(i.uid));
  const sum = (k: 'scrap' | 'dust' | 'links') =>
    going.reduce((n, i) => n + yields.get(i.uid)![k], 0);
  const shards = going.filter((i) => yields.get(i.uid)!.shards.length > 0).length;

  const salvage = () => {
    if (going.length === 0) return;
    const res = useDelveStore.getState().salvage(going.map((i) => i.uid));
    playSound('gemScatter');
    vibrate('medium');
    const dust = res.dust > 0 ? ` · +${formatNumber(res.dust)} Mana Dust` : '';
    const links = res.links > 0 ? ` · +${res.links} Link${res.links > 1 ? 's' : ''}` : '';
    const parts = partsText(registry, res.runes, res.destroyed);
    const count = `${going.length} item${going.length === 1 ? '' : 's'}`;
    showToast(
      `Salvaged ${count} · +${formatNumber(res.scrap)} scrap${dust}${links}${parts ? ` · ${parts}` : ''}`,
    );
    onClose();
  };
  const toggle = (uid: string) => {
    playSound('buttonClick');
    setKept((k) => {
      const next = new Set(k);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };
  usePrompts(
    [
      {
        id: 'salvage-rest',
        label: `Salvage ${going.length}`,
        binding: SALVAGE_REST,
        onPress: salvage,
        disabled: going.length === 0,
      },
    ],
    body,
  );

  return (
    <Dialog title="Salvage junk" onClose={onClose} width={760} wrap testId="junk-sheet">
      <div ref={body} className="flex flex-col gap-3">
        <p className="k-body-2 m-0">
          Everything here is worse than what you wear. A keeps one back.
        </p>
        <div className="flex flex-col gap-2">
          {items.map((item, i) => {
            const y = yields.get(item.uid)!;
            const keep = kept.has(item.uid);
            return (
              <button
                key={item.uid}
                type="button"
                className="k-well flex items-center justify-between gap-3 p-2 text-left"
                style={{ opacity: keep ? 0.55 : 1 }}
                aria-pressed={keep}
                data-pad-first={i === 0 ? '' : undefined}
                data-uid={item.uid}
                data-testid="junk-row"
                onClick={() => toggle(item.uid)}
              >
                <span className="truncate text-[18px]" style={{ color: RARITY_TEXT[item.rarity] }}>
                  {item.name}
                </span>
                <span className="k-caption flex items-center gap-2">
                  {keep ? (
                    'Kept'
                  ) : (
                    <Price
                      scrap={y.scrap}
                      dust={y.dust || undefined}
                      links={y.links || undefined}
                      signed
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <p className="m-0 flex items-center gap-2 text-[18px]" data-testid="junk-total">
          {going.length === 0 ? (
            'Everything is kept back'
          ) : (
            <>
              Total{' '}
              <Price
                scrap={sum('scrap')}
                dust={sum('dust') || undefined}
                links={sum('links') || undefined}
                signed
              />
              {shards > 0 && ` · ${shards} shard${shards === 1 ? '' : 's'}`}
            </>
          )}
        </p>
        <Button
          variant="danger"
          binding={SALVAGE_REST}
          disabled={going.length === 0}
          onClick={salvage}
          testId="junk-salvage"
        >
          Salvage {going.length}
        </Button>
      </div>
    </Dialog>
  );
}
