import { useId, useMemo, useRef, useState } from 'react';
import {
  awaken,
  awakenPrice,
  honeCost,
  imprintCost,
  itemStatLines,
  pairElements,
  reattuneCost,
  reforgeCost,
  upgradeCost,
  type GearItem,
  type ManaType,
  type ShardRef,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Chip, Glyph, Price } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemHeader } from '../../items/ItemHeader';
import { ItemStatLines, AffixLine } from '../../items/ItemStatLines';
import { manaStyle } from '../../format';
import { ShardPicker } from './ShardPicker';
import { materialLabel, shardName } from './materials-text';

const BACK = { key: 'Escape', pad: 'b' } as const;

/** The line ops: each picks a line in its own pad scope with a Back. */
type LineOp = 'reforge' | 'hone' | 'imprint';
const LINE_OP: Record<LineOp, { label: string; pick: string; done: string }> = {
  reforge: { label: 'Reforge', pick: 'Pick a line to reforge', done: 'Reforged!' },
  hone: { label: 'Hone', pick: 'Pick a line to hone', done: 'Honed!' },
  imprint: { label: 'Imprint', pick: 'Pick a line to imprint over', done: 'Imprinted!' },
};

/**
 * The Temper bench: the selected item's Upgrade +1, the line ops (Reforge a
 * line to a random affix, Hone its value within its band, Imprint a shard over
 * it) and Re-attune to the pair's other element, each at the engine's price
 * against the purse: one the purse can't pay is off, and says what it needs.
 * A rare weapon not yet awakened adds Awaken, once (it carries the Ultimate
 * too), enabled by the engine's dry run, which says why not.
 */
export function Temper({ item }: { item: GearItem }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const { scrap, manaDust: dust, pair } = profile;
  const store = useDelveStore.getState;
  const [op, setOp] = useState<LineOp | null>(null);
  const [line, setLine] = useState<number | null>(null);
  const [shard, setShard] = useState<ShardRef | null>(null);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  const upCost = upgradeCost(registry, item);
  const raCost = reattuneCost(registry, item);
  // The open line op's scrap (an Imprint's besides its shard; a Hone's grows with each).
  const opCost =
    op === 'reforge'
      ? reforgeCost(registry, item)
      : op === 'hone'
        ? honeCost(registry, item)
        : op === 'imprint'
          ? imprintCost(registry, item)
          : 0;
  const affixes = itemStatLines(item, registry).filter((l) => l.source === 'affix');
  const reattuneTo = pairElements(pair).filter((m) => m !== item.mana);
  const { maxUpgrade: max, upgradeStep } = registry.getDelveBalance().forge;
  const id = useId();
  const upShort = upCost !== null && upCost > scrap;
  const ready = line !== null && (op !== 'imprint' || shard !== null);
  const opShort = ready && opCost > scrap;
  // Awaken, on a rare weapon not yet awakened: its price, and the engine's dry run.
  const awakenable = item.slot === 'weapon' && item.rarity === 'rare' && !item.awakened;
  const awakenCost = awakenable ? awakenPrice(registry, item) : null;
  const awakenTry = useMemo(
    () => (awakenable ? awaken(registry, profile, item.uid) : null),
    [awakenable, registry, profile, item.uid],
  );

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
  const open = (next: LineOp | null) => {
    setOp(next);
    setLine(null);
    setShard(null);
  };

  const onUpgrade = () => {
    const res = store().upgrade(item.uid);
    if (res.ok) playSound('upgradeTier');
    done(res.ok, `Upgraded to +${res.item?.upgrade}`, res.reason, 'Cannot upgrade');
  };
  const onLineOp = () => {
    if (!op || line === null) return;
    const s = store();
    const res =
      op === 'reforge'
        ? s.reforge(item.uid, line)
        : op === 'hone'
          ? s.hone(item.uid, line)
          : shard && s.imprint(item.uid, line, shard);
    if (!res) return;
    if (res.ok) playSound('combineMerge');
    // An imprint spends its shard: pick again for the next.
    if (res.ok && op === 'imprint') setShard(null);
    done(res.ok, LINE_OP[op].done, res.reason, `Cannot ${op}`);
  };
  const onReattune = (to: ManaType) => {
    const res = store().reattune(item.uid, to);
    if (res.ok) playSound('combineMerge');
    done(res.ok, `Attuned to ${manaStyle(registry, to).name}`, res.reason, 'Cannot re-attune');
  };
  const onAwaken = () => {
    const res = store().awaken(item.uid);
    if (res.ok) playSound('upgradeTier');
    done(res.ok, 'Awakened!', res.reason, 'Cannot awaken');
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
      {op ? (
        <div
          ref={statsRef}
          className="flex flex-col gap-3"
          data-pad-scope
          data-testid={`${op}-pick`}
        >
          <div className="flex items-center justify-between">
            <span className="k-label">{LINE_OP[op].pick}</span>
            <Button
              variant="quiet"
              size="sm"
              binding={BACK}
              data-pad-back
              onClick={() => open(null)}
              testId={`${op}-back`}
            >
              Back
            </Button>
          </div>
          {op === 'hone' && (
            <p className="k-caption" data-testid="hone-count">
              Honed {item.hones} {item.hones === 1 ? 'time' : 'times'}: each hone costs more.
            </p>
          )}
          <div
            className="flex flex-col gap-3"
            data-tutorial={op === 'hone' ? 'temper.line' : undefined}
            data-tutorial-done={line !== null}
          >
            {affixes.map((l, i) => (
              <button
                key={`${i}-${l.stat}`}
                type="button"
                className="k-well p-2 text-left"
                style={{ borderColor: line === i ? 'var(--k-hot)' : undefined }}
                aria-pressed={line === i}
                data-pad-first={i === 0 ? '' : undefined}
                onClick={() => {
                  setLine(i);
                  setShard(null); // a shard for one line may sit on another
                }}
                data-testid={`${op}-line-${i}`}
              >
                <AffixLine line={l} />
              </button>
            ))}
          </div>
          {op === 'imprint' && line !== null && (
            <>
              <span className="k-label">Pick a shard</span>
              <ShardPicker
                slot={item.slot}
                exclude={item.affixes.filter((_, j) => j !== line).map((a) => a.stat)}
                selected={shard}
                onPick={setShard}
              />
            </>
          )}
          <Button
            variant="primary"
            disabled={!ready || opShort}
            onClick={onLineOp}
            aria-describedby={opShort ? `${id}-op` : undefined}
            data-tutorial={op === 'hone' ? 'temper.go' : undefined}
            testId={`${op}-button`}
          >
            {line === null ? (
              'Pick a line'
            ) : !ready ? (
              'Pick a shard'
            ) : (
              <>
                {LINE_OP[op].label}
                {shard && ` ${shardName(registry, shard)}`} · <Price scrap={opCost} />
              </>
            )}
          </Button>
          {opShort && (
            <span id={`${id}-op`} className="k-caption">
              Needs <Price scrap={opCost} />
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div ref={statsRef}>
            <ItemStatLines item={item} />
          </div>
          <p className="k-caption">
            Each forge level adds +{Math.round(upgradeStep * 100)}% to every stat on the item.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              disabled={upCost === null || upShort}
              onClick={onUpgrade}
              aria-describedby={upShort ? `${id}-up` : undefined}
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
            {affixes.length > 0 &&
              (Object.keys(LINE_OP) as LineOp[]).map((o) => (
                <Button
                  key={o}
                  onClick={() => open(o)}
                  testId={`${o}-open`}
                  data-tutorial={o === 'hone' ? 'temper.hone' : undefined}
                >
                  {LINE_OP[o].label}…
                </Button>
              ))}
            {upShort && (
              <span id={`${id}-up`} className="k-caption">
                Needs <Price scrap={upCost} />
              </span>
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
                      aria-describedby={raCost > dust ? `${id}-ra` : undefined}
                      testId={`reattune-${m}`}
                    >
                      <Glyph id={m} size={16} color={st.color} /> {st.name} ·{' '}
                      <Price dust={raCost} />
                    </Chip>
                  );
                })}
                {raCost > dust && (
                  <span id={`${id}-ra`} className="k-caption self-center">
                    Needs <Price dust={raCost} />
                  </span>
                )}
              </div>
            </div>
          )}
          {awakenCost && awakenTry && (
            <div className="flex flex-col gap-2" data-testid="awaken">
              <p className="k-caption">
                Awaken this rare weapon, once: it carries the Ultimate too.
              </p>
              <Button
                variant="primary"
                className="self-start"
                disabled={!awakenTry.ok}
                onClick={onAwaken}
                aria-describedby={awakenTry.ok ? undefined : `${id}-aw`}
                testId="awaken-button"
              >
                Awaken · {awakenCost.epicFlux}{' '}
                {materialLabel(registry, { kind: 'flux', grade: 'epic' })} ·{' '}
                <Price links={awakenCost.links} scrap={awakenCost.scrap} />
              </Button>
              {!awakenTry.ok && (
                <span
                  id={`${id}-aw`}
                  className="k-caption"
                  style={{ color: 'var(--k-bad-text)' }}
                  data-testid="awaken-refused"
                >
                  {awakenTry.reason}
                </span>
              )}
            </div>
          )}
          {item.awakened && (
            <p className="k-caption" data-testid="awakened">
              Awakened: it carries the Ultimate.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
