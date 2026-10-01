import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CHAIN_SKILLS,
  MANA_TYPES,
  manaPool,
  resolveChain,
  type AbilityPayment,
  type Blow,
  type Chain,
  type Chains,
  type ChainSkill,
  type HeroStats,
  type ManaType,
  type Move,
} from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';
import { AttunementBars, Chip } from '../AbilitiesPanel';
import { manaStyle } from '../format';
import { getDelveRegistry } from '../registry';
import { KIND_ICON, SKILL_NAME, blowText, chainText, moveText } from './chain-text';
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
  onChange: <S extends ChainSkill>(skill: S, chain: Chains[S]) => void;
  /** The elements an ability's move can take (the Delve: your pair); all six when absent. */
  elements?: readonly ManaType[];
  /** The elements a basic blow can take (your pair); `elements` when absent. */
  blowElements?: readonly ManaType[];
  /** Shown in place of the attunement bars (the Anvil's Mana view). */
  mana?: ReactNode;
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

/** A copy of `m` in `allowed` elements only: its own where allowed, else the first allowed. */
function fitted(m: Move | Blow, allowed: readonly ManaType[]): Move | Blow {
  if ('element' in m)
    return { ...m, element: allowed.includes(m.element) ? m.element : allowed[0] };
  const kept = m.elements.filter((e) => allowed.includes(e));
  return { ...m, elements: kept.length > 0 ? kept : [allowed[0]] };
}

/**
 * The chain builder: each skill (the basic attack, then the Primary, Defensive
 * and Ultimate) is a row of move cards, up to its cap; a skill without a chain
 * shows locked. A card opens its move below: its kind, its form and its
 * elements. ◂ ▸ reorder, × removes (never the last), + adds a copy of the
 * chosen move (in the allowed elements). A move outside them is marked
 * off-pair. The Anvil binds it to a draft of the weapon's moveset; the
 * Training Grounds to their own loadout. See the moves and chains spec.
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
}: ChainEditorProps) {
  const registry = getDelveRegistry();
  const data = registry.getArpgData();
  const [skill, setSkill] = useState<ChainSkill>('primary');
  const [picked, setPicked] = useState(0);
  // After an add, a remove or a reorder, the focus stays with the move (a controller keeps its
  // place): the first of these selectors that finds an enabled control.
  const cards = useRef<HTMLDivElement>(null);
  const [focusOn, setFocusOn] = useState<string[] | null>(null);
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

  const commit = (next: (Move | Blow)[], payment = chain?.payment) => {
    if (locked) return;
    playSound('buttonClick');
    if (skill === 'basic') onChange('basic', next as Blow[]);
    else onChange(skill, { moves: next as Move[], payment: payment! } as Chain);
  };
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
                    commit(moved(entries, i, i - 1));
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
                    commit(moved(entries, i, i + 1));
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
                    commit(entries.filter((_, j) => j !== i));
                    setPicked(next);
                    setFocusOn([card(next)]);
                  }}
                  data-testid={`move-remove-${i}`}
                >
                  ×
                </button>
              </span>
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
              commit([...entries, fitted(entries[index], allowed)]);
              setPicked(entries.length);
              setFocusOn([card(entries.length)]);
            }}
            data-testid="move-add"
          >
            +
          </button>
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
    </div>
  );
}
