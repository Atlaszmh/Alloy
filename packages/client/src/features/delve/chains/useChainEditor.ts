import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  MANA_TYPES,
  chainCycle,
  manaPool,
  manaSupport,
  resolveChain,
  runeTargetOf,
  socketsOf,
  type AbilityPayment,
  type AbilitySlot,
  type Blow,
  type Chain,
  type Chains,
  type ChainSkill,
  type HeroStats,
  type ManaSupport,
  type ManaType,
  type Move,
  type ResolvedChain,
  type RunePouch,
  type RuneRef,
} from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';
import { getDelveRegistry } from '../registry';
import type { RunePickerProps } from '../runes/RunePicker';
import { blowText, markIdle, moveText, runeCandidates } from './chain-text';

export interface ChainEditorProps {
  /** Each skill's chain; a skill without one (the weapon doesn't carry it) shows locked. */
  chains: Partial<Chains>;
  /** Most moves each skill's chain may hold (the Delve: the weapon's slots). */
  caps: Partial<Record<ChainSkill, number>>;
  /** The hero the chains resolve against: legendaries, cooldowns, damage, life, attunement, pool. */
  stats: HeroStats;
  /** Read-only (a dive is under way). */
  locked: boolean;
  /** Why it is read-only; the dive's text when absent. */
  lockedText?: string;
  /** Why a skill has no chain (the text its locked tab shows). */
  absentText?: (skill: ChainSkill) => string;
  /** Each chain keeps its moves and payment, only changing them (a stop's one move): no reordering, adding, removing, payment or attunement. */
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

/** A chain's payments: the label and what it means. */
export const PAYMENTS: [AbilityPayment, string, string][] = [
  ['mana', 'Mana', 'Pay mana, then wait the cooldown.'],
  ['charge', 'Charge', 'No mana: fill a meter by dealing damage (and in lulls), then unleash it.'],
  ['cast', 'Cast', 'Half the mana and 20% more power, but you stand still while it winds up.'],
];

/** Move `from` of `list` to `to` (the others keep their order). */
function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Whether a move holds an element outside `allowed` (off-pair, in the Delve). */
export function offPair(m: Move | Blow, allowed: readonly ManaType[]): boolean {
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

/** A selector for move card `n` (its `data-card`). */
export const cardAt = (n: number) => `[data-card="${n}"]`;

/** The chain builder's state and edits, which its views (the one-column editor, the Anvil's panes) draw. */
export interface ChainEditorModel {
  /** The props, with their defaults. */
  locked: boolean;
  lockedText: string;
  fixedShape: boolean;
  /** The chosen skill, and choosing one (its first move picked). */
  skill: ChainSkill;
  pick: (skill: ChainSkill) => void;
  /** The chosen move, and choosing one (only the view changes). */
  index: number;
  select: (i: number) => void;
  slot: AbilitySlot | null;
  chain: Chain | null;
  /** The weapon doesn't carry the chosen skill: no moves. */
  absent: boolean;
  /** The chosen skill's moves (its blows for the basic chain). */
  entries: (Move | Blow)[];
  resolved: ResolvedChain | null;
  /** Each move's name: "light Fire Bolt", "heavy Fire blow". */
  names: string[];
  /** The elements the chosen skill's moves can take. */
  allowed: readonly ManaType[];
  /** A mana or cast chain's spend against the build's refill; null for charge and the basic chain. */
  support: ManaSupport | null;
  /** The weapon's name (the basic chain's cards). */
  weapon: string;
  pool: number;
  move: Move | Blow | undefined;
  /** The chosen move's sockets, the next one's price (undefined at the cap, null when free), and why it can't open. */
  sockets: (RuneRef | null)[];
  nextSocket: { links: number; scrap: number } | null | undefined;
  openWhy: string | null;
  /** Socket indexes of move `i` whose rune does nothing there now. */
  dormant: (i: number) => number[];
  /** The chosen move's socket whose rune picker is open. */
  socket: number | null;
  openPicker: (move: number, socket: number) => void;
  /** The open picker's props (none closed). */
  picker: RunePickerProps | null;
  /** The chosen move replaced, the chain's payment, and the cards' edits. */
  edit: (next: Move | Blow) => void;
  setPayment: (payment: AbilityPayment) => void;
  /**
   * Move `i` by `by` places (◂ ▸, a drag, the pad's carry); the selection and the focus follow it.
   * `focus` false: the focus stays where it is (the editor's Position row).
   */
  shift: (i: number, by: number, focus?: boolean) => void;
  remove: (i: number) => void;
  add: () => void;
  openSocket: () => void;
  /** The chosen ability chain's damage a second (`chainCycle`: a full cycle's damage over its seconds); null for the basic chain. */
  dps: number | null;
  /** `dps` with the chosen move replaced by `next` (what an option in the editor's grids would do); null for the basic chain. */
  dpsWith: (next: Move) => number | null;
  /** The cards' container: after an add, a remove or a reorder the focus stays with the move. */
  cardsRef: RefObject<HTMLDivElement | null>;
}

/**
 * The chain builder's state and edits, from today's ChainEditor props: the chosen skill and
 * move, the chain resolved against the hero, its names and mana support, the chosen move's
 * sockets and the rune picker's, and every edit (each reported through `onChange` with the map
 * of where each move came from). See the moves and chains spec, and the runes spec.
 */
export function useChainEditor({
  chains,
  stats,
  locked,
  lockedText = 'A dive is under way: your chains can change once you extract or fall.',
  fixedShape = false,
  onChange,
  elements = MANA_TYPES,
  blowElements = elements,
  runes,
}: ChainEditorProps): ChainEditorModel {
  const registry = getDelveRegistry();
  const [skill, setSkill] = useState<ChainSkill>('primary');
  const [picked, setPicked] = useState(0);
  const cardsRef = useRef<HTMLDivElement>(null);
  // After an add, a remove or a reorder, the focus stays with the move (a controller keeps its
  // place): the first of these selectors that finds an enabled control.
  const [focusOn, setFocusOn] = useState<string[] | null>(null);
  const [socket, setSocket] = useState<number | null>(null);
  const pool = manaPool(stats, registry).max;
  const slot = skill === 'basic' ? null : skill;
  const chain = slot ? (chains[slot] ?? null) : null;
  const absent = !chains[skill];
  const entries: (Move | Blow)[] = chain ? chain.moves : absent ? [] : chains.basic!;
  const index = Math.min(picked, entries.length - 1);
  const resolved = chain && slot ? resolveChain(registry, stats, slot, chain) : null;
  const names = resolved
    ? resolved.moves.map(moveText)
    : entries.map((b) => blowText(registry, b as Blow));
  const allowed = slot ? elements : blowElements;
  // A mana or cast chain's spend a second at its cadence against what the build brings back
  // (the engine's estimate, which Power shares).
  const support =
    resolved && resolved.payment !== 'charge' ? manaSupport(registry, stats, resolved) : null;
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
  const move: Move | Blow | undefined = entries[index];
  const sockets = move ? socketsOf(move) : [];
  const nextSocket =
    runes && sockets.length < runes.socketCap ? runes.socketPrice(sockets.length) : undefined;
  const openWhy =
    runes && nextSocket !== undefined && !locked ? (runes.openWhy?.(skill, index) ?? null) : null;
  const current = socket === null ? null : (sockets[socket] ?? null);
  /** A chain's damage a second, by the engine's cycle. */
  const dpsOf = (c: Chain | null): number | null => {
    if (!c || !slot) return null;
    const cycle = chainCycle(registry, stats, resolveChain(registry, stats, slot, c));
    return cycle.seconds > 0 ? cycle.damage / cycle.seconds : null;
  };
  const setSockets = (next: (RuneRef | null)[]) =>
    commit(entries.map((e, j) => (j === index ? { ...e, runes: next } : e)));

  useEffect(() => {
    const el = focusOn
      ?.map((sel) => cardsRef.current?.querySelector<HTMLButtonElement>(sel))
      .find((e) => e && !e.disabled);
    if (el) {
      el.focus();
      setFocusOn(null);
    }
  }, [focusOn, entries]);

  const picker: RunePickerProps | null =
    runes && move && socket !== null
      ? {
          candidates: markIdle(
            registry,
            stats,
            slot && chain ? { slot, chain, index, socket } : null,
            runeCandidates(
              registry,
              runeTargetOf(runes.weaponBaseId, move),
              sockets.filter((_, k) => k !== socket),
              runes.pouch,
            ),
          ),
          current,
          pullText: current ? runes.pullText(current) : undefined,
          tierChoice: runes.pouch === 'any',
          on: runeTargetOf(runes.weaponBaseId, move),
          dormant: dormant(index).includes(socket),
          payment: chain?.payment,
          ease: resolved?.moves[index]?.ease,
          onPick: (rune) => setSockets(sockets.map((r, k) => (k === socket ? rune : r))),
          onPull: current
            ? () => setSockets(sockets.map((r, k) => (k === socket ? null : r)))
            : undefined,
          onClose: () => setSocket(null),
        }
      : null;

  return {
    locked,
    lockedText,
    fixedShape,
    skill,
    pick: (s) => {
      setSkill(s);
      setPicked(0);
      setSocket(null);
    },
    index,
    select: (i) => {
      if (i !== index) setSocket(null);
      setPicked(i);
    },
    slot,
    chain,
    absent,
    entries,
    resolved,
    names,
    allowed,
    support,
    weapon,
    pool,
    move,
    sockets,
    nextSocket,
    openWhy,
    dormant,
    socket,
    openPicker: (i, s) => {
      setPicked(i);
      setSocket(s);
    },
    picker,
    edit: (next) => commit(entries.map((e, i) => (i === index ? next : e))),
    setPayment: (payment) => chain && commit(chain.moves, payment),
    shift: (i, by, focus = true) => {
      const to = i + by;
      if (locked || by === 0 || to < 0 || to >= entries.length) return;
      commit(moved(entries, i, to), undefined, moved(order, i, to));
      setPicked(to);
      if (focus) setFocusOn([`[data-${by < 0 ? 'earlier' : 'later'}="${to}"]`, cardAt(to)]);
    },
    remove: (i) => {
      if (locked || entries.length <= 1) return;
      const next = Math.max(0, i === index ? i - 1 : index > i ? index - 1 : index);
      commit(
        entries.filter((_, j) => j !== i),
        undefined,
        order.filter((j) => j !== i),
      );
      setPicked(next);
      setSocket(null);
      setFocusOn([cardAt(next)]);
    },
    add: () => {
      if (locked) return;
      commit([...entries, fitted(entries[index], allowed)], undefined, [...order, null]);
      setPicked(entries.length);
      setFocusOn([cardAt(entries.length)]);
    },
    openSocket: () => setSockets([...sockets, null]),
    dps: dpsOf(chain),
    dpsWith: (next) =>
      dpsOf(chain && { ...chain, moves: chain.moves.map((m, j) => (j === index ? next : m)) }),
    cardsRef,
  };
}
