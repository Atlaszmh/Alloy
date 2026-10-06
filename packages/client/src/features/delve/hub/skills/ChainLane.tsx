import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  chainCycle,
  socketsOf,
  type AbilityPayment,
  type ChainCycle,
  type ManaSupport,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Glyph, Panel, Price, layerZoom } from '@/features/delve/kit';
import { formatNumber, manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import { SocketRow } from '../../runes/SocketRow';
import { KIND_NAME, SKILL_NAME, chainText } from '../../chains/chain-text';
import { offPair, type ChainEditorModel } from '../../chains/useChainEditor';
import { useTutorialStep } from '../../tutorial/tutorial-view';
import { useChainMessage, type AnvilChains } from './useAnvilChains';

/** Where a card dragged `dx` px (design px) from place `from` lands, `step` px a place apart. */
export function dropIndex(from: number, dx: number, step: number, count: number): number {
  return Math.min(count - 1, Math.max(0, from + Math.round(dx / step)));
}

/** A card the mouse is dragging: its place, where the press began, and a place's width. */
interface Drag {
  i: number;
  x: number;
  step: number;
  dx: number;
}

/**
 * The Skills tab's chain pane: the chosen chain's header (its slots, payment and rule) and its
 * summary line (its moves' names, or what carries it), its move cards in order (each its kind, element tile and form glyph, element or fusion, socket
 * pips and price; a click on a card, or A, opens its move's editor, a pip's at its socket), "+ Move" while a slot is free and "+ Slot"
 * with its price while the chain is under its cap, a refused Apply's or Add slot's reason, and for
 * an ability chain its stats and rhythm. A card drags to a new place with the mouse (decided item 37). Focus chooses a card,
 * and the chosen one leads the pad (`data-pad-first`).
 */
export function ChainLane({
  ed,
  anvil,
  onEdit,
}: {
  ed: ChainEditorModel;
  anvil: AnvilChains;
  /** A click (or A) on card `i`, or on its pip `socket`: its editor (the move pane's). */
  onEdit: (i: number, socket?: number) => void;
}) {
  const registry = getDelveRegistry();
  const { skill, entries, index, names, locked, absent, chain, resolved } = ed;
  const { caps, stats, runes, absentText } = anvil.editor;
  const slots = caps[skill] ?? 0;
  const offer = anvil.slotOffer(skill);
  const id = useId();
  const [drag, setDrag] = useState<Drag | null>(null);
  // A drag that moved swallows the click that ends it.
  const dragged = useRef(false);
  const cycle = resolved ? chainCycle(registry, stats, resolved) : null;
  const message = useChainMessage((s) => s.text);
  // The guided start's lesson: its step names how many moves the Primary should hold, and its
  // last move takes the pair's secondary.
  const lessonMoves = Number(useTutorialStep()?.trigger.filter?.moves);
  const secondary = useDelveStore((s) => s.profile.pair.secondary);
  // The message is this lane's: it goes with it.
  useEffect(() => () => useChainMessage.setState({ text: null }), []);

  const onPointerDown = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || locked || entries.length < 2) return;
    // A place's width: from one card to the next, in design px (decided item 32).
    const [a, b] = [...ed.cardsRef.current!.querySelectorAll('[data-card]')].map(
      (c) => c.parentElement!.getBoundingClientRect().left,
    );
    const step = (b - a) / layerZoom(e.currentTarget) || 1;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragged.current = false;
    setDrag({ i, x: e.clientX, step, dx: 0 });
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / layerZoom(e.currentTarget);
    if (Math.abs(dx) > 4) dragged.current = true;
    setDrag({ ...drag, dx });
  };
  const onPointerUp = () => {
    if (!drag) return;
    setDrag(null);
    if (dragged.current)
      ed.shift(drag.i, dropIndex(drag.i, drag.dx, drag.step, entries.length) - drag.i);
  };

  return (
    <Panel as="section" aria-label={`${SKILL_NAME[skill]} chain`} testId="chain-lane">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
        <h2 className="k-heading m-0">{SKILL_NAME[skill]}</h2>
        {!absent && (
          <span className="text-[16px] text-[var(--k-text-3)]">
            <span data-testid="chain-slots">
              {entries.length} of {slots} slots
            </span>
            {chain
              ? ` · pays ${chain.payment} · each press casts the next move`
              : ' · free · each swing strikes the next blow'}
          </span>
        )}
      </div>
      <p className="k-note m-0" data-testid="abilities-summary">
        {absent ? absentText?.(skill) : chainText(names)}
      </p>
      {locked && !absent && (
        <div
          className="k-well p-3 text-center text-[18px] text-[var(--k-hot)]"
          data-testid="abilities-locked"
        >
          {ed.lockedText}
        </div>
      )}
      <div ref={ed.cardsRef} className="flex items-stretch gap-2.5" data-testid="chain-cards">
        {entries.map((e, i) => {
          const on = i === index;
          const el = 'element' in e ? e.element : e.elements[0];
          const color = manaStyle(registry, el).color;
          const ab = resolved?.moves[i];
          const off = offPair(e, ed.allowed);
          const moving = drag?.i === i;
          return (
            <Fragment key={i}>
              {i > 0 && (
                <span aria-hidden className="self-center text-[22px] text-[var(--k-steel-2)]">
                  ›
                </span>
              )}
              <div
                className="k-well flex min-w-0 flex-1 flex-col gap-3 p-4"
                style={{
                  borderColor: on ? 'var(--k-hot-hi)' : undefined,
                  background: on ? 'var(--k-wood-0)' : undefined,
                  transform: moving ? `translateX(${drag.dx}px)` : undefined,
                  zIndex: moving ? 1 : undefined,
                }}
              >
                <button
                  type="button"
                  data-card={i}
                  className="flex flex-col gap-3 bg-transparent p-0 text-left"
                  aria-pressed={on}
                  aria-label={off ? `${names[i]}, off-pair` : names[i]}
                  onClick={() => {
                    if (!dragged.current) onEdit(i);
                    dragged.current = false;
                  }}
                  onPointerDown={onPointerDown(i)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={() => setDrag(null)}
                  onFocus={() => ed.select(i)}
                  data-pad-first={on ? '' : undefined}
                  data-testid={`move-${i}`}
                  data-tutorial={
                    skill !== 'primary'
                      ? undefined
                      : i === 0
                        ? 'skills.card:first'
                        : i === entries.length - 1
                          ? 'skills.card:last'
                          : undefined
                  }
                  // As a way, a card is done once its move holds what selecting it is for.
                  data-tutorial-done={
                    i === 0
                      ? socketsOf(e).some((r) => r !== null)
                      : 'elements' in e && !!secondary && e.elements.includes(secondary)
                  }
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="k-label whitespace-nowrap">Move {i + 1}</span>
                    <span className="k-disp text-[16px]">{KIND_NAME[e.kind]}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span
                      className="k-socket inline-flex h-[52px] w-[52px] flex-none items-center justify-center"
                      style={{ borderColor: color }}
                    >
                      <Glyph id={'form' in e ? e.form : 'attack'} size={30} color={color} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="k-disp truncate text-[21px]">
                        {'form' in e ? registry.getForm(e.form).name : ed.weapon}
                      </span>
                      <span className="text-[16px]" style={{ color }}>
                        {ab?.fusion?.name ?? manaStyle(registry, el).name}
                      </span>
                    </span>
                  </span>
                  {off && (
                    <span className="text-[16px] text-[var(--k-hot)]" data-testid="card-off-pair">
                      off-pair
                    </span>
                  )}
                </button>
                <span className="flex flex-wrap items-center gap-2">
                  {runes && (
                    // The pips are the mouse's: a click opens the editor at that socket's grid.
                    <span data-testid={`sockets-${i}`} data-pad-skip="">
                      <SocketRow
                        runes={socketsOf(e)}
                        cap={runes.socketCap}
                        nextPrice={null}
                        dormant={ed.dormant(i)}
                        locked={locked}
                        onSocketTap={(s) => onEdit(i, s)}
                      />
                    </span>
                  )}
                  {ab && (
                    <span className="ml-auto whitespace-nowrap text-[16px] text-[var(--k-text-3)]">
                      {ab.payment === 'charge'
                        ? `Charge ${Math.round(ab.chargeNeed)}`
                        : `${Math.round(ab.cost)} mana`}
                    </span>
                  )}
                </span>
              </div>
            </Fragment>
          );
        })}
        {!absent && entries.length < slots && (
          <button
            type="button"
            className="flex flex-[0_0_150px] flex-col items-center justify-center gap-1.5 border-2 border-dashed border-[var(--k-steel-2)] bg-transparent text-[16px] text-[var(--k-text-3)]"
            disabled={locked}
            aria-label="Add a move"
            onClick={ed.add}
            data-testid="move-add"
          >
            <span className="k-disp text-[18px] text-[var(--k-text-2)]">+ Move</span>
            free slot
          </button>
        )}
        {!absent && offer.price && (
          <button
            type="button"
            className="flex flex-[0_0_150px] flex-col items-center justify-center gap-1.5 border-2 border-dashed border-[var(--k-steel-2)] bg-transparent text-[16px] text-[var(--k-text-3)]"
            disabled={locked || !!offer.why}
            aria-describedby={offer.why && !locked ? `${id}-slot` : undefined}
            onClick={() => anvil.buySlot(skill)}
            data-testid="add-slot"
            data-tutorial={skill === 'primary' ? 'skills.addSlot' : undefined}
            data-tutorial-done={entries.length >= lessonMoves}
          >
            <span className="k-disp text-[18px] text-[var(--k-text-2)]">+ Slot</span>
            <Price links={offer.price.links} scrap={offer.price.scrap} />
          </button>
        )}
      </div>
      {offer.why && !locked && (
        <span
          id={`${id}-slot`}
          className="text-[18px] text-[var(--k-hot)]"
          data-testid="add-slot-why"
        >
          {offer.why}
        </span>
      )}
      {message && (
        <span
          role="status"
          className="text-[18px] text-[var(--k-bad-text)]"
          data-testid="chain-message"
        >
          {message}
        </span>
      )}
      {cycle && chain && (
        <>
          <ChainStats cycle={cycle} support={ed.support} payment={chain.payment} />
          <RhythmStrip cycle={cycle} />
        </>
      )}
    </Panel>
  );
}

/** One stat tile: a label, a big number and a caption. */
function Tile({
  label,
  value,
  caption,
  testId,
  hot = false,
}: {
  label: string;
  value: string;
  caption: ReactNode;
  testId: string;
  hot?: boolean;
}) {
  return (
    <div
      className="k-well flex flex-col gap-1 px-4 py-3.5"
      style={hot ? { borderColor: 'var(--k-hot)' } : undefined}
      data-testid={testId}
    >
      <span className="k-label" style={hot ? { color: 'var(--k-hot-hi)' } : undefined}>
        {label}
      </span>
      <span className="k-disp text-[26px]" style={hot ? { color: 'var(--k-hot-hi)' } : undefined}>
        {value}
      </span>
      <span className="text-[16px]" style={{ color: hot ? 'var(--k-hot-hi)' : 'var(--k-text-3)' }}>
        {caption}
      </span>
    </div>
  );
}

/**
 * An ability chain's four tiles (`chainCycle` and `manaSupport`): its damage over a full cycle,
 * the cycle's seconds, the mana a cycle spends, and the spend against the build's refill, hot
 * when it spends more.
 */
export function ChainStats({
  cycle,
  support,
  payment,
}: {
  cycle: ChainCycle;
  support: ManaSupport | null;
  payment: AbilityPayment;
}) {
  const spends = Math.round(support?.spend ?? 0);
  const refills = Math.round(support?.refill ?? 0);
  const short = !!support && spends > refills;
  return (
    <div className="grid grid-cols-4 gap-3.5" data-testid="chain-stats">
      <Tile
        label="Chain damage"
        value={formatNumber(cycle.damage)}
        caption="per full cycle"
        testId="stat-damage"
      />
      <Tile
        label="Cycle"
        value={`${cycle.seconds.toFixed(1)} s`}
        caption="casts plus beats"
        testId="stat-cycle"
      />
      <Tile
        label="Mana per cycle"
        value={String(Math.round(cycle.mana))}
        caption={payment === 'charge' ? 'paid with charge' : 'spent each cycle'}
        testId="stat-mana"
      />
      <Tile
        label="Mana support"
        value={support ? `${spends} / ${refills}` : '—'}
        caption={
          support ? (
            <span data-testid="mana-support" data-short={short || undefined}>
              Spends {spends}/s · your build refills {refills}/s
            </span>
          ) : (
            'charge fills from damage'
          )
        }
        testId="stat-support"
        hot={short}
      />
    </div>
  );
}

/**
 * The chain's rhythm, from `chainCycle`: a block per move as wide as its wind-up (a hold's
 * hatched, an echoed one trailed by a ghost a quarter its width) in its first element's colour,
 * a line per beat, and the pause that starts the chain over.
 */
export function RhythmStrip({ cycle }: { cycle: ChainCycle }) {
  const registry = getDelveRegistry();
  const total =
    cycle.steps.reduce((t, s) => t + s.cast * (s.echo ? 1.25 : 1) + s.beat, 0) + cycle.restart;
  const width = (seconds: number) => `${(seconds / total) * 100}%`;
  return (
    <div className="k-well flex flex-col gap-2.5 p-[18px]" data-testid="rhythm-strip">
      <span className="k-label">Rhythm</span>
      <div className="flex h-11 items-center">
        {cycle.steps.map((s, i) => {
          const color = manaStyle(registry, s.elements[0]).color;
          return (
            <Fragment key={i}>
              <span
                className="h-[30px] min-w-1"
                style={{
                  width: width(s.cast),
                  background: s.hold
                    ? `repeating-linear-gradient(45deg, ${color} 0 4px, transparent 4px 8px)`
                    : color,
                }}
                data-testid={`rhythm-step-${i}`}
                data-hold={s.hold || undefined}
              />
              {s.echo && (
                <span
                  className="h-[30px] opacity-40"
                  style={{ width: width(s.cast / 4), background: color }}
                  data-testid={`rhythm-echo-${i}`}
                />
              )}
              <span
                className="h-1.5"
                style={{ width: width(s.beat), background: 'var(--k-steel-1)' }}
                data-testid={`rhythm-beat-${i}`}
              />
            </Fragment>
          );
        })}
        <span
          className="border-t-[3px] border-dashed border-[var(--k-steel-2)]"
          style={{ width: width(cycle.restart) }}
        />
        <span className="ml-2.5 whitespace-nowrap text-[16px] text-[var(--k-text-3)]">
          pause {cycle.restart.toFixed(1)} s restarts
        </span>
      </div>
      <span className="text-[16px] text-[var(--k-text-3)]">
        Each block is a cast, each line a beat.
      </span>
    </div>
  );
}
