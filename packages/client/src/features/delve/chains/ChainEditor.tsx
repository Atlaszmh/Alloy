import { useId } from 'react';
import { CHAIN_SKILLS, socketsOf, type ChainSkill } from '@alloy/engine';
import { Chip, Glyph, Price } from '@/features/delve/kit';
import { AttunementBars } from '../items/AttunementBars';
import { manaStyle } from '../format';
import { getDelveRegistry } from '../registry';
import { RunePicker } from '../runes/RunePicker';
import { SocketRow } from '../runes/SocketRow';
import { KIND_ICON, SKILL_NAME, chainText } from './chain-text';
import { MoveEditor } from './MoveEditor';
import { PAYMENTS, offPair, useChainEditor, type ChainEditorProps } from './useChainEditor';

export type { ChainEditorProps, ChainRunes } from './useChainEditor';

const SKILL_KEY: Record<ChainSkill, string | null> = {
  basic: null,
  primary: 'Q',
  defensive: 'E',
  ultimate: 'R',
};

/**
 * The chain builder in one column (the Training Grounds' dock and the stop's "Adjust a move";
 * the Anvil draws the same `useChainEditor` as its Skills panes): each skill (the basic attack,
 * then the Primary, Defensive and Ultimate) is a row of move cards, up to its cap; a skill
 * without a chain shows locked. A card opens its move below: its kind, its form and its
 * elements. ◂ ▸ reorder, × removes (never the last), + adds a copy of the chosen move (in the
 * allowed elements). A move outside them is marked off-pair. With `runes`, each card shows its
 * sockets: a tap opens the rune picker (socket, pull or replace), and "+ socket" opens one on
 * the chosen move. See the moves and chains spec, and the runes spec.
 */
export function ChainEditor(props: ChainEditorProps) {
  const { chains, caps, stats, absentText, footer, mana, runes } = props;
  const ed = useChainEditor(props);
  const { skill, index, entries, names, locked, fixedShape, absent, chain, move, support } = ed;
  const registry = getDelveRegistry();
  const id = useId();
  const spends = Math.round(support?.spend ?? 0);
  const refills = Math.round(support?.refill ?? 0);

  return (
    <div className="flex flex-col gap-3" data-testid="abilities-panel">
      <div className="grid grid-cols-2 gap-1.5" role="tablist">
        {CHAIN_SKILLS.map((s) => {
          const lead = s === 'basic' ? chains.basic?.[0] : chains[s]?.moves[0];
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={skill === s}
              className="delve-panel flex items-center gap-2 p-2 pr-3 text-left"
              style={{ borderColor: skill === s ? '#fcd34d' : undefined }}
              onClick={() => ed.pick(s)}
              data-testid={`chain-skill-${s}`}
            >
              {s !== 'basic' && !chains[s] ? (
                <Glyph id="lock" size={20} />
              ) : (
                <Glyph
                  id={s === 'basic' ? 'attack' : chains[s]!.moves[0].form}
                  size={24}
                  color={
                    lead &&
                    manaStyle(registry, 'element' in lead ? lead.element : lead.elements[0]).color
                  }
                />
              )}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="k-label whitespace-nowrap">
                  {SKILL_NAME[s]}
                  {SKILL_KEY[s] && <span className="hidden sm:inline"> · {SKILL_KEY[s]}</span>}
                </span>
                <span className="text-[14px] font-semibold text-stone-200">
                  {chains[s]
                    ? `${(s === 'basic' ? chains.basic! : chains[s].moves).length} of ${caps[s]}`
                    : 'Locked'}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="k-caption flex items-center gap-1.5" data-testid="abilities-summary">
        {absent ? (
          <>
            <Glyph id="lock" size={14} /> {absentText?.(skill) ?? ''}
          </>
        ) : (
          chainText(names)
        )}
      </div>

      {locked && !absent && (
        <div
          className="delve-panel p-2 text-center text-[14px] text-amber-200"
          data-testid="abilities-locked"
        >
          {ed.lockedText}
        </div>
      )}
      {/* Picking a card only changes the view: the cards stay open while the chain is locked. */}
      <div
        ref={ed.cardsRef}
        className="flex flex-wrap items-stretch gap-1.5"
        data-testid="chain-cards"
      >
        {entries.map((e, i) => {
          const els = 'element' in e ? [e.element] : e.elements;
          const off = offPair(e, ed.allowed);
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <button
                type="button"
                data-card={i}
                className="delve-panel flex w-24 flex-col items-center gap-1 p-1.5"
                style={{ borderColor: i === index ? '#fcd34d' : undefined }}
                aria-pressed={i === index}
                aria-label={off ? `${names[i]}, off-pair` : names[i]}
                onClick={() => ed.select(i)}
                data-testid={`move-${i}`}
              >
                <span className="text-[14px] font-bold leading-none text-amber-200/90">
                  {KIND_ICON[e.kind]}
                </span>
                <Glyph
                  id={'form' in e ? e.form : 'attack'}
                  size={24}
                  color={manaStyle(registry, els[0]).color}
                />
                <span className="text-center text-[14px] font-semibold leading-tight text-stone-200">
                  {'form' in e ? registry.getForm(e.form).name : ed.weapon}
                </span>
                <span className="flex gap-0.5">
                  {els.map((m) => (
                    <Glyph key={m} id={m} size={14} color={manaStyle(registry, m).color} />
                  ))}
                </span>
                {off && (
                  <span
                    className="text-[14px] leading-none text-amber-300/80"
                    data-testid="card-off-pair"
                  >
                    off-pair
                  </span>
                )}
              </button>
              <span className="flex gap-0.5" hidden={fixedShape}>
                <button
                  type="button"
                  className="delve-chip px-1.5"
                  disabled={locked || i === 0}
                  aria-label={`Move ${names[i]} earlier`}
                  onClick={() => ed.shift(i, -1)}
                  data-earlier={i}
                  data-testid={`move-left-${i}`}
                >
                  ◂
                </button>
                <button
                  type="button"
                  className="delve-chip px-1.5"
                  disabled={locked || i === entries.length - 1}
                  aria-label={`Move ${names[i]} later`}
                  onClick={() => ed.shift(i, 1)}
                  data-later={i}
                  data-testid={`move-right-${i}`}
                >
                  ▸
                </button>
                <button
                  type="button"
                  className="delve-chip px-1.5"
                  disabled={locked || entries.length === 1}
                  aria-label={`Remove ${names[i]}`}
                  onClick={() => ed.remove(i)}
                  data-testid={`move-remove-${i}`}
                >
                  ×
                </button>
              </span>
              {runes && (
                <div data-testid={`sockets-${i}`}>
                  <SocketRow
                    runes={socketsOf(e)}
                    cap={runes.socketCap}
                    nextPrice={null}
                    dormant={ed.dormant(i)}
                    locked={locked}
                    onSocketTap={(s) => ed.openPicker(i, s)}
                  />
                </div>
              )}
            </div>
          );
        })}
        {!fixedShape && !absent && entries.length < (caps[skill] ?? 0) && (
          <button
            type="button"
            className="delve-panel flex w-24 items-center justify-center p-1.5 text-2xl text-stone-400"
            style={{ opacity: locked ? 0.55 : 1 }}
            disabled={locked}
            aria-label="Add a move"
            onClick={ed.add}
            data-testid="move-add"
          >
            +
          </button>
        )}
        {runes && runes.socketCap > 0 && move && (
          <div
            className="flex w-full flex-wrap items-center gap-2 text-[14px] text-stone-400"
            data-testid="socket-bar"
          >
            <span data-testid="socket-count">
              Sockets {ed.sockets.length}/{runes.socketCap}
            </span>
            {ed.nextSocket !== undefined && (
              <button
                type="button"
                className="delve-chip"
                disabled={locked || !!ed.openWhy}
                onClick={ed.openSocket}
                aria-describedby={ed.openWhy ? `${id}-socket` : undefined}
                data-testid="socket-open"
              >
                + socket
                {ed.nextSocket && (
                  <>
                    {' · '}
                    <Price links={ed.nextSocket.links} scrap={ed.nextSocket.scrap} />
                  </>
                )}
              </button>
            )}
            {ed.openWhy && (
              <span id={`${id}-socket`} className="text-amber-200/80" data-testid="socket-open-why">
                {ed.openWhy}
              </span>
            )}
          </div>
        )}
      </div>
      {support && (
        <div
          className={`text-[14px] ${spends > refills ? 'text-amber-200/90' : 'text-stone-400'}`}
          data-testid="mana-support"
        >
          Spends {spends}/s · your build refills {refills}/s
        </div>
      )}
      {!absent && footer?.(skill)}

      <fieldset
        hidden={absent}
        disabled={locked}
        className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
        style={{ opacity: locked ? 0.55 : 1 }}
      >
        {!absent && (
          <MoveEditor
            slot={ed.slot}
            move={entries[index]}
            resolved={ed.resolved?.moves[index] ?? null}
            full={ed.resolved?.hold[index]?.[2] ?? null}
            blow={ed.slot ? null : stats.weapon.blows[index]}
            stats={stats}
            pool={ed.pool}
            elements={ed.allowed}
            onChange={ed.edit}
          />
        )}

        {chain && !fixedShape && (
          <section className="flex flex-col gap-1.5">
            <h3 className="k-label m-0">Pay with</h3>
            <div className="flex flex-wrap gap-1.5">
              {PAYMENTS.map(([p, label]) => (
                <Chip
                  key={p}
                  pressed={chain.payment === p}
                  onClick={() => ed.setPayment(p)}
                  testId={`payment-${p}`}
                >
                  {label}
                </Chip>
              ))}
            </div>
            <div className="k-caption">
              {PAYMENTS.find(([p]) => p === chain.payment)![2]} One payment for every move.
            </div>
          </section>
        )}
      </fieldset>

      {!fixedShape &&
        (mana ?? (
          <section className="flex flex-col gap-1.5">
            <h3 className="k-label m-0">Attunement</h3>
            <AttunementBars stats={stats} />
          </section>
        ))}

      {ed.picker && <RunePicker {...ed.picker} />}
    </div>
  );
}
