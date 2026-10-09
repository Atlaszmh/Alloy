import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  MANA_TYPES,
  chainCycle,
  constructSkill,
  formAllowed,
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
  type Construct,
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
import { SKILL_NAME, blowText, markIdle, moveText, runeCandidates } from './chain-text';

export interface ChainEditorProps {
  /** Each skill's chain; a skill without one (no slot on the weapon) shows locked. */
  chains: Partial<Chains>;
  /** Each skill's slots (the Delve: the weapon's; absent or 0, the skill has no chain). */
  caps: Partial<Record<ChainSkill, number>>;
  /** Each skill's ceiling, the most slots it can buy (the Anvil); `caps` when absent. */
  ceilings?: Partial<Record<ChainSkill, number>>;
  /**
   * The move bag as the draft sees it (the Anvil): × unsockets a construct into it and A places one
   * from it. Without it × removes a move outright (the Training Grounds, the stop).
   */
  bag?: readonly Construct[];
  /** Why a construct is dormant on this weapon ("A sword can't express Bolt"), or null (the Anvil). */
  dormantText?: (c: Construct) => string | null;
  /**
   * The weapon whose class gates the form picker (the sandbox's `sandboxWeapon`, C2); the hero's
   * `stats.weapon.baseId` when absent. Null: unarmed, no form allowed.
   */
  weaponBaseId?: string | null;
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
  /** A change to one chain, with the bag when the change moved a construct into or out of it. */
  onChange: <S extends ChainSkill>(skill: S, chain: Chains[S], bag?: Construct[]) => void;
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
  /** Most sockets a move may open (`MAX_SOCKETS`, whatever weapon holds it). */
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
 * A new construct like `m`, in `allowed` elements only (its own where allowed, else the first
 * allowed), with no sockets and no uid: a new construct starts at none (Apply mints its uid).
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
  /** The weapon has no slot for the chosen skill: no chain. */
  absent: boolean;
  /** The chosen skill's slots and its ceiling. */
  slots: number;
  ceiling: number;
  /** The chosen skill's moves (its blows for the basic chain); fewer than its slots when some are empty. */
  entries: (Move | Blow)[];
  resolved: ResolvedChain | null;
  /** Each move's name: "light Fire Bolt", "heavy Fire blow". */
  names: string[];
  /** The elements the chosen skill's moves can take. */
  allowed: readonly ManaType[];
  /** A mana or cast chain's spend against the build's refill; null for charge and the basic chain. */
  support: ManaSupport | null;
  /** The weapon's name (the basic chain's cards), and its base (the form picker's class). */
  weapon: string;
  weaponBaseId: string | null;
  pool: number;
  move: Move | Blow | undefined;
  /** The chosen move's sockets, the next one's price (undefined at the cap, null when free), and why it can't open. */
  sockets: (RuneRef | null)[];
  nextSocket: { links: number; scrap: number } | null | undefined;
  openWhy: string | null;
  /** Socket indexes of move `i` whose rune does nothing there now. */
  dormant: (i: number) => number[];
  /** Why move `i` is dormant on this weapon (its class can't express it), or null. */
  dormantWhy: (i: number) => string | null;
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
  /** Drop move `i` outright (never a chain's last): the sandbox's ×. */
  remove: (i: number) => void;
  /**
   * Move `i` to the bag, its chain closing up (the Basic keeps one blow; an ability chain may
   * empty). Without a bag, `remove`.
   */
  unsocket: (i: number) => void;
  /**
   * Place bag construct `uid` into the next empty slot, or, with every slot filled, into the chosen
   * one, whose construct goes to the bag. Null when done; else why not (the wrong skill, a form the
   * weapon can't express, no such construct, locked).
   */
  place: (uid: string) => string | null;
  add: () => void;
  openSocket: () => void;
  /** The whole bag as the draft sees it, and its constructs of the chosen skill. */
  bag: Construct[];
  bagHere: Construct[];
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
 * sockets and the rune picker's, the bag's constructs of the skill, and every edit (each
 * reported through `onChange`, with the bag when it moved a construct). See the moves and chains
 * spec, the runes spec and the constructs spec.
 */
export function useChainEditor({
  chains,
  caps,
  ceilings,
  bag: bagProp,
  dormantText,
  weaponBaseId: baseIdProp,
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
  const index = entries.length > 0 ? Math.min(picked, entries.length - 1) : 0;
  const slots = caps[skill] ?? 0;
  const ceiling = ceilings?.[skill] ?? slots;
  const bag: Construct[] = bagProp ? [...bagProp] : [];
  const bagHere = bag.filter((c) => constructSkill(registry, c) === skill);
  const resolved = chain && slot ? resolveChain(registry, stats, slot, chain) : null;
  const names = resolved
    ? resolved.moves.map(moveText)
    : entries.map((b) => blowText(registry, b as Blow));
  const allowed = slot ? elements : blowElements;
  // A mana or cast chain's spend a second at its cadence against what the build brings back
  // (the engine's estimate, which Power shares).
  const support =
    resolved && resolved.payment !== 'charge' ? manaSupport(registry, stats, resolved) : null;
  const weaponBaseId = baseIdProp === undefined ? stats.weapon.baseId : baseIdProp;
  const weapon = weaponBaseId ? registry.getGearBase(weaponBaseId).name : 'Fist';
  /** A light move of the first form of the slot the weapon can express, or null (the Basic can't be empty). */
  const plain = (): Move | null => {
    if (!slot) return null;
    const form = registry
      .getArpgData()
      .forms.find((f) => f.slot === slot && formAllowed(registry, weaponBaseId, f.id));
    return form ? { kind: 'light', form: form.id, elements: [allowed[0]] } : null;
  };

  const commit = (next: (Move | Blow)[], payment = chain?.payment, nextBag?: Construct[]) => {
    if (locked) return;
    playSound('buttonClick');
    // The bag only when the edit moved a construct: a plain edit reports the chain alone.
    const bagArg: [Construct[]?] = nextBag ? [nextBag] : [];
    if (skill === 'basic') onChange('basic', next as Blow[], ...bagArg);
    else onChange(skill, { moves: next as Move[], payment: payment! } as Chain, ...bagArg);
  };
  // The sockets of move `i` whose rune does nothing there now: socketed, but missing from the
  // runes the engine resolved it with.
  const dormant = (i: number): number[] => {
    const on = (resolved ? resolved.moves[i]?.runes : stats.weapon.blows[i]?.runes) ?? [];
    return socketsOf(entries[i]).flatMap((r, s) =>
      r && !on.some((a) => a.id === r.id) ? [s] : [],
    );
  };
  const dormantWhy = (i: number): string | null =>
    entries[i] ? (dormantText?.(entries[i]) ?? null) : null;
  const move: Move | Blow | undefined = entries[index];
  const sockets = move ? socketsOf(move) : [];
  const nextSocket =
    runes && move && sockets.length < runes.socketCap
      ? runes.socketPrice(sockets.length)
      : undefined;
  const openWhy =
    runes && nextSocket !== undefined && !locked ? (runes.openWhy?.(skill, index) ?? null) : null;
  const current = socket === null ? null : (sockets[socket] ?? null);
  /** A chain's damage a second, by the engine's cycle. */
  const dpsOf = (c: Chain | null): number | null => {
    if (!c || !slot || c.moves.length === 0) return null;
    const cycle = chainCycle(registry, stats, resolveChain(registry, stats, slot, c));
    return cycle.seconds > 0 ? cycle.damage / cycle.seconds : null;
  };
  const setSockets = (next: (RuneRef | null)[]) =>
    commit(entries.map((e, j) => (j === index ? { ...e, runes: next } : e)));
  /** The selection after move `i` goes: the one before it, or the same place. */
  const after = (i: number) => Math.max(0, i === index ? i - 1 : index > i ? index - 1 : index);
  const remove = (i: number) => {
    if (locked || entries.length <= 1) return;
    const next = after(i);
    commit(entries.filter((_, j) => j !== i));
    setPicked(next);
    setSocket(null);
    setFocusOn([cardAt(next)]);
  };

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
    slots,
    ceiling,
    entries,
    resolved,
    names,
    allowed,
    support,
    weapon,
    weaponBaseId,
    pool,
    move,
    sockets,
    nextSocket,
    openWhy,
    dormant,
    dormantWhy,
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
      commit(moved(entries, i, to));
      setPicked(to);
      if (focus) setFocusOn([`[data-${by < 0 ? 'earlier' : 'later'}="${to}"]`, cardAt(to)]);
    },
    remove,
    unsocket: (i) => {
      if (!bagProp) return remove(i);
      if (locked || !entries[i] || (skill === 'basic' && entries.length <= 1)) return;
      const next = after(i);
      commit(
        entries.filter((_, j) => j !== i),
        undefined,
        [...bag, entries[i]],
      );
      setPicked(next);
      setSocket(null);
      setFocusOn([cardAt(next), '[data-testid="move-add"]']);
    },
    place: (uid) => {
      if (locked) return lockedText;
      const c = bag.find((b) => b.uid === uid);
      if (!c) return 'Not in your bag';
      const of = constructSkill(registry, c);
      if (of !== skill)
        return `A ${SKILL_NAME[of]} construct: it goes in the ${SKILL_NAME[of]} chain`;
      const why = dormantText?.(c) ?? null;
      if (why) return why;
      if (slots === 0) return 'No slot for it';
      const rest = bag.filter((b) => b.uid !== uid);
      if (entries.length < slots) {
        commit([...entries, c], undefined, rest);
        setPicked(entries.length);
        setFocusOn([cardAt(entries.length)]);
      } else {
        commit(
          entries.map((e, j) => (j === index ? c : e)),
          undefined,
          [...rest, entries[index]],
        );
        setFocusOn([cardAt(index)]);
      }
      setSocket(null);
      return null;
    },
    add: () => {
      if (locked || entries.length >= slots) return;
      // A copy of the chosen construct (in the allowed elements, no sockets); on an empty chain,
      // of the bag's first of the skill, else a light move of the first form the weapon can express.
      const like = entries[index] ?? bagHere[0] ?? plain();
      if (!like) return;
      commit([...entries, fitted(like, allowed)]);
      setPicked(entries.length);
      setFocusOn([cardAt(entries.length)]);
    },
    openSocket: () => setSockets([...sockets, null]),
    bag,
    bagHere,
    dps: dpsOf(chain),
    dpsWith: (next) =>
      dpsOf(chain && { ...chain, moves: chain.moves.map((m, j) => (j === index ? next : m)) }),
    cardsRef,
  };
}
