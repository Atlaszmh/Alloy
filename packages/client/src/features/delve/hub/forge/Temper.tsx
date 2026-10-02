import { useRef, useState } from 'react';
import {
  itemStatLines,
  pairElements,
  reattuneCost,
  reforgeCost,
  upgradeCost,
  type GearItem,
  type ManaType,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Chip, Glyph, Price } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemHeader } from '../../items/ItemHeader';
import { ItemStatLines, AffixLine } from '../../items/ItemStatLines';
import { manaStyle } from '../../format';

const BACK = { key: 'Escape', pad: 'b' } as const;

/**
 * The Temper bench: the selected item's Upgrade +1, Reforge (pick a line, in
 * its own pad scope with a Back) and Re-attune to the pair's other element,
 * each priced against the purse.
 */
export function Temper({ item }: { item: GearItem }) {
  const registry = getDelveRegistry();
  const scrap = useDelveStore((s) => s.profile.scrap);
  const dust = useDelveStore((s) => s.profile.manaDust);
  const pair = useDelveStore((s) => s.profile.pair);
  const store = useDelveStore.getState;
  const [picking, setPicking] = useState(false);
  const [line, setLine] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  const upCost = upgradeCost(registry, item);
  const rfCost = reforgeCost(registry, item);
  const raCost = reattuneCost(registry, item);
  const affixes = itemStatLines(item, registry).filter((l) => l.source === 'affix');
  const reattuneTo = pairElements(pair).filter((m) => m !== item.mana);
  const max = registry.getDelveBalance().forge.maxUpgrade;

  const say = (text: string, good: boolean) => {
    setMessage({ text, good });
    window.setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 1800);
  };
  const flash = () =>
    statsRef.current?.animate?.(
      [
        { filter: 'brightness(2.2)', transform: 'scale(1.02)' },
        { filter: 'brightness(1)', transform: 'scale(1)' },
      ],
      { duration: 450, easing: 'ease-out' },
    );
  const done = (ok: boolean, good: string, reason: string | undefined, fallback: string) => {
    if (ok) {
      vibrate('medium');
      flash();
      say(good, true);
    } else {
      playSound('combineFail');
      say(reason ?? fallback, false);
    }
  };

  const onUpgrade = () => {
    const res = store().upgrade(item.uid);
    if (res.ok) playSound('upgradeTier');
    done(res.ok, `Upgraded to +${res.item?.upgrade}`, res.reason, 'Cannot upgrade');
  };
  const onReforge = () => {
    if (line === null) return;
    const res = store().reforge(item.uid, line);
    if (res.ok) playSound('combineMerge');
    done(res.ok, 'Reforged!', res.reason, 'Cannot reforge');
  };
  const onReattune = (to: ManaType) => {
    const res = store().reattune(item.uid, to);
    if (res.ok) playSound('combineMerge');
    done(res.ok, `Attuned to ${manaStyle(registry, to).name}`, res.reason, 'Cannot re-attune');
  };

  return (
    <div className="flex flex-col gap-4" data-testid="temper">
      <ItemHeader item={item} size="lg" />
      <div className="k-caption flex items-center gap-2" data-testid="forge-purse">
        In hand: <Price scrap={scrap} dust={dust} />
      </div>
      {message && (
        <p
          role="status"
          className="text-[16px]"
          style={{ color: message.good ? 'var(--k-ok)' : 'var(--k-bad-text)' }}
        >
          {message.text}
        </p>
      )}
      {picking ? (
        <div
          ref={statsRef}
          className="flex flex-col gap-3"
          data-pad-scope
          data-testid="reforge-pick"
        >
          <div className="flex items-center justify-between">
            <span className="k-label">Pick a line to reforge</span>
            <Button
              variant="quiet"
              size="sm"
              binding={BACK}
              data-pad-back
              onClick={() => {
                setPicking(false);
                setLine(null);
              }}
              testId="reforge-back"
            >
              Back
            </Button>
          </div>
          {affixes.map((l, i) => (
            <button
              key={`${i}-${l.stat}`}
              type="button"
              className="k-well p-2 text-left"
              style={{ borderColor: line === i ? 'var(--k-hot)' : undefined }}
              aria-pressed={line === i}
              data-pad-first={i === 0 ? '' : undefined}
              onClick={() => setLine(i)}
              data-testid={`reforge-line-${i}`}
            >
              <AffixLine line={l} />
            </button>
          ))}
          <Button
            variant="primary"
            disabled={line === null || rfCost > scrap}
            onClick={onReforge}
            testId="reforge-button"
          >
            {line === null ? (
              'Pick a line'
            ) : (
              <>
                Reforge · <Price scrap={rfCost} />
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div ref={statsRef}>
            <ItemStatLines item={item} />
          </div>
          <p className="k-caption">Each forge level adds +10% to every stat on the item.</p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="primary"
              disabled={upCost === null || upCost > scrap}
              onClick={onUpgrade}
              testId="upgrade-button"
            >
              {upCost === null ? (
                `Max +${max}`
              ) : (
                <>
                  Upgrade +1 · <Price scrap={upCost} />
                </>
              )}
            </Button>
            {affixes.length > 0 && (
              <Button onClick={() => setPicking(true)} testId="reforge-open">
                Reforge…
              </Button>
            )}
          </div>
          {reattuneTo.length > 0 && (
            <div className="flex flex-col gap-2" data-testid="reattune">
              <p className="k-caption">
                Re-attune to your other element: its {manaStyle(registry, item.mana).name} lines
                follow.
              </p>
              <div className="flex flex-wrap gap-2">
                {reattuneTo.map((m) => {
                  const st = manaStyle(registry, m);
                  return (
                    <Chip
                      key={m}
                      disabled={raCost > dust}
                      onClick={() => onReattune(m)}
                      testId={`reattune-${m}`}
                    >
                      <Glyph id={m} size={16} color={st.color} /> {st.name} ·{' '}
                      <Price dust={raCost} />
                    </Chip>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
