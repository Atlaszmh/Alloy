import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
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
  type TutorialTarget,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Panel, Price } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemHeader } from '../../items/ItemHeader';
import { ItemStatLines, AffixLine } from '../../items/ItemStatLines';
import { manaStyle, SLOT_LABEL } from '../../format';
import { heldShards, ShardPicker } from './ShardPicker';
import { materialLabel, shardName } from './materials-text';

const BACK = { key: 'Escape', pad: 'b' } as const;

/** The line ops: each picks a line in its own pad scope with a Back. */
type LineOp = 'reforge' | 'hone' | 'imprint';
const LINE_OP: Record<LineOp, { label: string; pick: string; done: string }> = {
  reforge: { label: 'Reforge', pick: 'Pick a line to reforge', done: 'Reforged!' },
  hone: { label: 'Hone', pick: 'Pick a line to hone', done: 'Honed!' },
  imprint: { label: 'Imprint', pick: 'Pick a line to imprint over', done: 'Imprinted!' },
};

/** One of Temper's operations: its label and price, and why it can't be done (null: it can). */
interface Op {
  id: string;
  label: string;
  price: ReactNode;
  why: ReactNode | null;
  run: () => void;
  tutorial?: TutorialTarget;
}

/**
 * The Temper bench on the picked item: one list of its six operations (Upgrade +1, Reforge,
 * Hone and Imprint a line, Re-attune to the pair's other element, Awaken a rare weapon once),
 * each row with the engine's price and, when it can't be done, why on the same row; Reforge,
 * Hone and Imprint open a line pick in its own pad scope. Beside it, the item's detail (no
 * stops). Two panels, for the bench's second and third columns.
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

  const shardFits = heldShards(registry, profile.materials.shards, item.slot, []).length > 0;
  const lineWhy = (cost: number, more: string | null = null): ReactNode | null =>
    affixes.length === 0 ? (
      'No lines to work'
    ) : more !== null ? (
      more
    ) : cost > scrap ? (
      <>
        Needs <Price scrap={cost} />
      </>
    ) : null;
  const ops: Op[] = [
    {
      id: 'upgrade',
      label: 'Upgrade +1',
      price: upCost !== null && <Price scrap={upCost} />,
      why:
        upCost === null ? (
          `At the top forge level, +${max}`
        ) : upShort ? (
          <>
            Needs <Price scrap={upCost} />
          </>
        ) : null,
      run: onUpgrade,
    },
    {
      id: 'reforge',
      label: 'Reforge a line',
      price: <Price scrap={reforgeCost(registry, item)} />,
      why: lineWhy(reforgeCost(registry, item)),
      run: () => open('reforge'),
    },
    {
      id: 'hone',
      label: 'Hone a line',
      price: <Price scrap={honeCost(registry, item)} />,
      why: lineWhy(honeCost(registry, item)),
      run: () => open('hone'),
      tutorial: 'temper.hone',
    },
    {
      id: 'imprint',
      label: 'Imprint a shard',
      price: <Price scrap={imprintCost(registry, item)} />,
      why: lineWhy(
        imprintCost(registry, item),
        shardFits ? null : `No shard you hold fits a ${SLOT_LABEL[item.slot].toLowerCase()}`,
      ),
      run: () => open('imprint'),
    },
    ...(reattuneTo.length > 0
      ? reattuneTo.map(
          (m): Op => ({
            id: reattuneTo.length > 1 ? `reattune-${m}` : 'reattune',
            label: `Re-attune to ${manaStyle(registry, m).name}`,
            price: <Price dust={raCost} />,
            why:
              raCost > dust ? (
                <>
                  Needs <Price dust={raCost} />
                </>
              ) : null,
            run: () => onReattune(m),
          }),
        )
      : [
          {
            id: 'reattune',
            label: 'Re-attune',
            price: null,
            why: 'Bind a second element first',
            run: () => {},
          },
        ]),
    {
      id: 'awaken',
      label: 'Awaken',
      price: awakenCost && (
        <>
          {awakenCost.epicFlux} {materialLabel(registry, { kind: 'flux', grade: 'epic' })} ·{' '}
          <Price links={awakenCost.links} scrap={awakenCost.scrap} />
        </>
      ),
      why: item.awakened
        ? 'Awakened: it carries the Ultimate'
        : !awakenable
          ? 'Only a rare weapon awakens'
          : awakenTry && !awakenTry.ok
            ? (awakenTry.reason ?? 'Cannot awaken')
            : null,
      run: onAwaken,
    },
  ];

  return (
    <>
      <Panel aria-label="Temper" testId="temper-bench">
        <div className="flex flex-col gap-4" data-testid="temper">
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
            <div className="flex flex-col gap-3" data-pad-scope data-testid={`${op}-pick`}>
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
            <div className="flex flex-col gap-2" data-testid="temper-ops">
              {ops.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center gap-3 [@media(max-height:809px)]:flex-col [@media(max-height:809px)]:items-stretch"
                  data-temper-row
                >
                  <Button
                    className="flex-1 justify-between"
                    disabled={o.why !== null}
                    aria-describedby={o.why !== null ? `${id}-${o.id}` : undefined}
                    onClick={o.run}
                    data-tutorial={o.tutorial}
                    testId={`temper-op-${o.id}`}
                  >
                    <span>{o.label}</span>
                    {o.price && <span>{o.price}</span>}
                  </Button>
                  {o.why !== null && (
                    <span
                      id={`${id}-${o.id}`}
                      className="k-caption w-[200px] flex-none [@media(max-height:809px)]:w-auto"
                      style={{ color: 'var(--k-bad-text)' }}
                    >
                      {o.why}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>
      <Panel aria-label="Item" testId="temper-detail" scroll={false}>
        {/* No stops: the header's tile is a picture here; the right stick scrolls it. */}
        <div className="k-scroll flex min-h-0 flex-1 flex-col gap-3" data-pad-scroll data-pad-skip="">
          <ItemHeader item={item} size="lg" />
          <div ref={statsRef}>
            <ItemStatLines item={item} />
          </div>
          <p className="k-caption">
            Each forge level adds +{Math.round(upgradeStep * 100)}% to every stat on the item.
          </p>
          {item.hones > 0 && (
            <p className="k-caption" data-testid="hone-count">
              Honed {item.hones} {item.hones === 1 ? 'time' : 'times'}: each hone costs more.
            </p>
          )}
          {item.awakened && (
            <p className="k-caption" data-testid="awakened">
              Awakened: it carries the Ultimate.
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}
