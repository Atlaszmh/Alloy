import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  CHAIN_SKILLS,
  MANA_TYPES,
  manaPool,
  resolveChain,
  runeTargetOf,
  socketsOf,
  type AbilityPayment,
  type Blow,
  type Chain,
  type Chains,
  type ChainSkill,
  type HeroStats,
  type ManaType,
  type Move,
  type RunePouch,
  type RuneRef,
} from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';
import { AttunementBars, Chip } from '../AbilitiesPanel';
import { manaStyle } from '../format';
import { getDelveRegistry } from '../registry';
import { RunePicker } from '../runes/RunePicker';
import { SocketRow } from '../runes/SocketRow';
import { KIND_ICON, SKILL_NAME, blowText, chainText, moveText, runeCandidates } from './chain-text';
import { MoveEditor } from './MoveEditor';

const SKILL_KEY: Record<ChainSkill, string | null> = {
  basic: null,
  primary: 'Q',
  defensive: 'E',
  ultimate: 'R',
};
const PAYMENTS: [AbilityPayment, string, string][] = [
  ['mana', 'Mana', 'Pay mana, then wait the cooldown.'],
  ['charge', 'Charge', 'No mana: fill a meter by dealing damage (and in lulls), then unleash it.'],
  ['cast', 'Cast', 'Half the mana and 20% more power, but you stand still while it winds up.'],
];

export interface ChainEditorProps {
  /** Each skill's chain; a skill without one (the weapon doesn't carry it) shows locked. */
  chains: Partial<Chains>;
  /** Most moves each skill's chain may hold (the Delve: the weapon's slots). */
  caps: Partial<Record<ChainSkill, number>>;
  /** The hero the chains resolve against: legendaries, cooldowns, damage, life, attunement, pool. */
  stats: HeroStats;
  /** Reactions shown by name; the rest show as ???. */
  reactionsSeen: readonly string[];
  /** Read-only (a dive is under way). */
  locked: boolean;
  /** Why it is read-only; the dive's text when absent. */
  lockedText?: string;
  /** Why a skill has no chain (the text its locked tab shows). */
  absentText?: (skill: ChainSkill) => string;
  /** Each chain keeps its moves and payment, only changing them (a stop's one move): no reordering, adding, removing, payment, attunement or reactions. */
  fixedShape?: boolean;
  /** Shown under the chosen skill's cards (the Anvil's Add slot). */
  footer?: (skill: ChainSkill) => ReactNode;
  /**
   * A change to one chain, with `map`: for each of its moves, the index in the chain handed in
   * that it came from (◂ ▸ move it, × drops it, + gives null, an edit keeps it).
   */
  onChange: <S extends ChainSkill>(skill: S, chain: Chains[S], map: (number | null)[]) => void;
  /** The sockets and runes on each move (the Anvil, the Training Grounds); none without it. */
  runes?: ChainRunes;
  /** The elements an ability's move can take (the Delve: your pair); all six when absent. */
  elements?: readonly ManaType[];
  /** The elements a basic blow can take (your pair); `elements` when absent. */
  blowElements?: readonly ManaType[];
  /** Shown in place of the attunement bars (the Anvil's Mana view). */
  mana?: ReactNode;
}

/** The runes a chain builder offers (see the runes spec, "The client"). */
export interface ChainRunes {
  /** Pouch counts, or 'any' (Training Grounds: every rune, every tier). */
  pouch: RunePouch | 'any';
  /** Most sockets a move may open (the weapon's rarity's; 3 in the Training Grounds). */
  socketCap: number;
  /** The next socket's price when a move has `open`; null: free. */
  socketPrice: (open: number) => { links: number; scrap: number } | null;
  /** The weapon whose blows the basic chain's runes must fit. */
  weaponBaseId: string | null;
  pullText: (rune: RuneRef) => string;
  /** Why "+ socket" on move `index` of `skill` is off (the engine's dry run), or null. */
  openWhy?: (skill: ChainSkill, index: number) => string | null;
}

/** Move `from` of `list` to `to` (the others keep their order). */
function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Whether a move holds an element outside `allowed` (off-pair, in the Delve). */
function offPair(m: Move | Blow, allowed: readonly ManaType[]): boolean {
  return ('element' in m ? [m.element] : m.elements).some((e) => !allowed.includes(e));
}

/**
 * A new move like `m`, in `allowed` elements only (its own where allowed, else the first
 * allowed), with no sockets: a new move starts at none.
 */
function fitted(m: Move | Blow, allowed: readonly ManaType[]): Move | Blow {
  if ('element' in m)
    return { kind: m.kind, element: allowed.includes(m.element) ? m.element : allowed[0] };
  const kept = m.elements.filter((e) => allowed.includes(e));
  return { kind: m.kind, form: m.form, elements: kept.length > 0 ? kept : [allowed[0]] };
}

/**
 * The chain builder: each skill (the basic attack, then the Primary, Defensive
 * and Ultimate) is a row of move cards, up to its cap; a skill without a chain
 * shows locked. A card opens its move below: its kind, its form and its
 * elements. ◂ ▸ reorder, × removes (never the last), + adds a copy of the
 * chosen move (in the allowed elements). A move outside them is marked
 * off-pair. With `runes`, each card shows its sockets: a tap opens the rune
 * picker (socket, pull or replace), and "+ socket" opens one on the chosen
 * move. The Anvil binds it to a draft of the weapon's moveset; the Training
 * Grounds to their own loadout. See the moves and chains spec, and the runes spec.
 */
export function ChainEditor({
  chains,
  caps,
  stats,
  reactionsSeen,
  locked,
  lockedText = 'A dive is under way: your chains can change once you extract or fall.',
  absentText,
  fixedShape = false,
  footer,
  onChange,
  elements = MANA_TYPES,
  blowElements = elements,
  mana,
  runes,
}: ChainEditorProps) {
  const registry = getDelveRegistry();
  const data = registry.getArpgData();
  const [skill, setSkill] = useState<ChainSkill>('primary');
  const [picked, setPicked] = useState(0);
  // After an add, a remove or a reorder, the focus stays with the move (a controller keeps its
  // place): the first of these selectors that finds an enabled control.
  const cards = useRef<HTMLDivElement>(null);
  const [focusOn, setFocusOn] = useState<string[] | null>(null);
  // The chosen move's socket whose rune picker is open.
  const [socket, setSocket] = useState<number | null>(null);
  const id = useId();
  const pool = manaPool(stats, registry).max;
  const slot = skill === 'basic' ? null : skill;
  const chain = slot ? (chains[slot] ?? null) : null;
  // A skill the weapon doesn't carry: its locked text, and no cards.
  const absent = !chains[skill];
  const entries: (Move | Blow)[] = chain ? chain.moves : absent ? [] : chains.basic!;
  const index = Math.min(picked, entries.length - 1);
  const resolved = chain && slot ? resolveChain(registry, stats, slot, chain) : null;
  const names = resolved
    ? resolved.moves.map(moveText)
    : entries.map((b) => blowText(registry, b as Blow));
  const allowed = slot ? elements : blowElements;
  const weapon = stats.weapon.baseId ? registry.getGearBase(stats.weapon.baseId).name : 'Fist';

  // Each move's index in the chain handed in: the map a change reports (an edit keeps them all).
  const order: (number | null)[] = entries.map((_, j) => j);
  const commit = (next: (Move | Blow)[], payment = chain?.payment, map = order) => {
    if (locked) return;
    playSound('buttonClick');
    if (skill === 'basic') onChange('basic', next as Blow[], map);
    else onChange(skill, { moves: next as Move[], payment: payment! } as Chain, map);
  };
  // The sockets of move `i` whose rune does nothing there now: socketed, but missing from the
  // runes the engine resolved it with.
  const dormant = (i: number): number[] => {
    const on = (resolved ? resolved.moves[i]?.runes : stats.weapon.blows[i]?.runes) ?? [];
    return socketsOf(entries[i]).flatMap((r, s) =>
      r && !on.some((a) => a.id === r.id) ? [s] : [],
    );
  };
  // The chosen move's sockets: the next one's price (undefined at the cap, null when free), why
  // the engine would refuse it, the socket whose picker is open, and a change to them.
  const move: Move | Blow | undefined = entries[index];
  const sockets = move ? socketsOf(move) : [];
  const nextSocket =
    runes && sockets.length < runes.socketCap ? runes.socketPrice(sockets.length) : undefined;
  const openWhy =
    runes && nextSocket !== undefined && !locked ? (runes.openWhy?.(skill, index) ?? null) : null;
  const current = socket === null ? null : (sockets[socket] ?? null);
  const setSockets = (next: (RuneRef | null)[]) =>
    commit(entries.map((e, j) => (j === index ? { ...e, runes: next } : e)));
  const pick = (s: ChainSkill) => {
    setSkill(s);
    setPicked(0);
  };
  useEffect(() => {
    const el = focusOn
      ?.map((sel) => cards.current?.querySelector<HTMLButtonElement>(sel))
      .find((e) => e && !e.disabled);
    if (el) {
      el.focus();
      setFocusOn(null);
    }
  }, [focusOn, entries]);
  const card = (n: number) => `[data-card="${n}"]`;

  return (
    <div className="flex flex-col gap-3" data-testid="abilities-panel">
      <div className="flex gap-1.5" role="tablist">
        {CHAIN_SKILLS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={skill === s}
            className="delve-panel flex flex-1 flex-col items-center gap-0.5 p-2"
            style={{ borderColor: skill === s ? '#fcd34d' : undefined }}
            onClick={() => pick(s)}
            data-testid={`chain-skill-${s}`}
          >
            <span className="whitespace-nowrap text-[10px] uppercase tracking-wider text-stone-400">
              {SKILL_NAME[s]}
              {SKILL_KEY[s] && <span className="hidden sm:inline"> · {SKILL_KEY[s]}</span>}
            </span>
            <span className="text-lg leading-none">
              {s === 'basic'
                ? '⚔️'
                : chains[s]
                  ? registry.getForm(chains[s].moves[0].form).icon
                  : '🔒'}
            </span>
            <span className="text-[11px] font-semibold text-stone-200">
              {chains[s]
                ? `${(s === 'basic' ? chains.basic! : chains[s].moves).length} of ${caps[s]}`
                : 'Locked'}
            </span>
          </button>
        ))}
      </div>

      <div className="text-xs text-stone-400" data-testid="abilities-summary">
        {absent ? `🔒 ${absentText?.(skill) ?? ''}` : chainText(names)}
      </div>

      {locked && !absent && (
        <div
          className="delve-panel p-2 text-center text-xs text-amber-200"
          data-testid="abilities-locked"
        >
          {lockedText}
        </div>
      )}
      {/* Picking a card only changes the view: the cards stay open while the chain is locked. */}
      <div ref={cards} className="flex flex-wrap items-stretch gap-1.5" data-testid="chain-cards">
        {entries.map((e, i) => {
          const els = 'element' in e ? [e.element] : e.elements;
          const off = offPair(e, allowed);
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <button
                type="button"
                data-card={i}
                className="delve-panel flex w-20 flex-col items-center gap-0.5 p-1.5"
                style={{ borderColor: i === index ? '#fcd34d' : undefined }}
                aria-pressed={i === index}
                aria-label={off ? `${names[i]}, off-pair` : names[i]}
                onClick={() => setPicked(i)}
                data-testid={`move-${i}`}
              >
                <span className="text-sm font-bold leading-none text-amber-200/90">
                  {KIND_ICON[e.kind]}
                </span>
                <span className="text-lg leading-none">
                  {'form' in e ? registry.getForm(e.form).icon : '⚔️'}
                </span>
                <span className="text-center text-[10px] font-semibold leading-tight text-stone-200">
                  {'form' in e ? registry.getForm(e.form).name : weapon}
                </span>
                <span className="text-xs leading-none">
                  {els.map((m) => manaStyle(registry, m).icon).join('')}
                </span>
                {off && (
                  <span
                    className="text-[9px] leading-none text-amber-300/80"
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
                  onClick={() => {
                    commit(moved(entries, i, i - 1), undefined, moved(order, i, i - 1));
                    setPicked(i - 1);
                    setFocusOn([`[data-earlier="${i - 1}"]`, card(i - 1)]);
                  }}
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
                  onClick={() => {
                    commit(moved(entries, i, i + 1), undefined, moved(order, i, i + 1));
                    setPicked(i + 1);
                    setFocusOn([`[data-later="${i + 1}"]`, card(i + 1)]);
                  }}
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
                  onClick={() => {
                    const next = Math.max(0, i === index ? i - 1 : index > i ? index - 1 : index);
                    commit(
                      entries.filter((_, j) => j !== i),
                      undefined,
                      order.filter((j) => j !== i),
                    );
                    setPicked(next);
                    setFocusOn([card(next)]);
                  }}
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
                    dormant={dormant(i)}
                    locked={locked}
                    onSocketTap={(s) => {
                      setPicked(i);
                      setSocket(s);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
        {!fixedShape && !absent && entries.length < (caps[skill] ?? 0) && (
          <button
            type="button"
            className="delve-panel flex w-20 items-center justify-center p-1.5 text-2xl text-stone-400"
            style={{ opacity: locked ? 0.55 : 1 }}
            disabled={locked}
            aria-label="Add a move"
            onClick={() => {
              commit([...entries, fitted(entries[index], allowed)], undefined, [...order, null]);
              setPicked(entries.length);
              setFocusOn([card(entries.length)]);
            }}
            data-testid="move-add"
          >
            +
          </button>
        )}
        {runes && runes.socketCap > 0 && move && (
          <div
            className="flex w-full flex-wrap items-center gap-2 text-xs text-stone-400"
            data-testid="socket-bar"
          >
            <span data-testid="socket-count">
              Sockets {sockets.length}/{runes.socketCap}
            </span>
            {nextSocket !== undefined && (
              <button
                type="button"
                className="delve-chip"
                disabled={locked || !!openWhy}
                onClick={() => setSockets([...sockets, null])}
                aria-describedby={openWhy ? `${id}-socket` : undefined}
                data-testid="socket-open"
              >
                + socket
                {nextSocket && ` · 🔗 ${nextSocket.links} · ⚙ ${nextSocket.scrap}`}
              </button>
            )}
            {openWhy && (
              <span id={`${id}-socket`} className="text-amber-200/80" data-testid="socket-open-why">
                {openWhy}
              </span>
            )}
          </div>
        )}
      </div>
      {!absent && footer?.(skill)}

      <fieldset
        hidden={absent}
        disabled={locked}
        className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
        style={{ opacity: locked ? 0.55 : 1 }}
      >
        {!absent && (
          <MoveEditor
            slot={slot}
            move={entries[index]}
            resolved={resolved?.moves[index] ?? null}
            full={resolved?.hold[index]?.[2] ?? null}
            blow={slot ? null : stats.weapon.blows[index]}
            stats={stats}
            pool={pool}
            elements={allowed}
            onChange={(next) => commit(entries.map((e, i) => (i === index ? next : e)))}
          />
        )}

        {chain && !fixedShape && (
          <section className="flex flex-col gap-1.5">
            <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
              Pay with
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PAYMENTS.map(([p, label]) => (
                <Chip
                  key={p}
                  pressed={chain.payment === p}
                  onClick={() => commit(chain.moves, p)}
                  testId={`payment-${p}`}
                >
                  {label}
                </Chip>
              ))}
            </div>
            <div className="text-[11px] text-stone-500">
              {PAYMENTS.find(([p]) => p === chain.payment)![2]} One payment for every move.
            </div>
          </section>
        )}
      </fieldset>

      {!fixedShape &&
        (mana ?? (
          <section className="flex flex-col gap-1.5">
            <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
              Attunement
            </div>
            <AttunementBars stats={stats} />
          </section>
        ))}

      <section className="flex flex-col gap-1.5" hidden={fixedShape}>
        <div className="flex items-baseline justify-between">
          <span className="delve-display text-xs font-bold uppercase tracking-widest text-fuchsia-300">
            Reactions
          </span>
          <span className="text-[10px] text-stone-500">
            {reactionsSeen.length}/{data.reactions.length} discovered
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {data.reactions.map((r) => {
            const seen = reactionsSeen.includes(r.id);
            return (
              <div
                key={r.id}
                className="delve-panel flex items-center gap-2.5 p-2"
                data-testid={seen ? `reaction-${r.id}` : 'reaction-unknown'}
                style={seen ? { borderColor: 'rgba(232,121,249,0.4)' } : undefined}
              >
                <span className="w-8 text-center text-2xl">{seen ? r.icon : '❔'}</span>
                <span className="min-w-0">
                  <span
                    className="delve-display block text-sm font-bold"
                    style={{ color: seen ? '#f0abfc' : '#57534e' }}
                  >
                    {seen ? r.name : '???'}
                  </span>
                  <span className="block text-[10.5px] leading-snug text-stone-400">
                    {seen
                      ? r.text
                      : 'Stack one element on a foe, then hit it with another, to discover.'}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>
      {runes && move && socket !== null && (
        <RunePicker
          candidates={runeCandidates(
            registry,
            runeTargetOf(runes.weaponBaseId, move),
            sockets.filter((_, k) => k !== socket),
            runes.pouch,
          )}
          current={current}
          pullText={current ? runes.pullText(current) : undefined}
          tierChoice={runes.pouch === 'any'}
          on={runeTargetOf(runes.weaponBaseId, move)}
          dormant={dormant(index).includes(socket)}
          onPick={(rune) => setSockets(sockets.map((r, k) => (k === socket ? rune : r)))}
          onPull={
            current ? () => setSockets(sockets.map((r, k) => (k === socket ? null : r))) : undefined
          }
          onClose={() => setSocket(null)}
        />
      )}
    </div>
  );
}
