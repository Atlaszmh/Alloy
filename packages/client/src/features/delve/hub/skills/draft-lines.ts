import {
  CHAIN_SKILLS,
  movesOf,
  resolveChain,
  socketsOf,
  type AbilitySlot,
  type Chain,
  type Chains,
  type ChainSkill,
  type Construct,
  type DataRegistry,
  type HeroStats,
  type RuneRef,
} from '@alloy/engine';
import {
  blowText,
  chainText,
  constructText,
  lessRunes,
  listed,
  moveText,
} from '../../chains/chain-text';
import { runeName } from '../../runes/rune-style';

/** One skill the draft changes, as the Apply sheet lists it. */
export interface DraftLine {
  skill: ChainSkill;
  /** The chain as the weapon holds it, and as the draft makes it ("light Fire Bolt · heavy Fire Bolt"). */
  before: string;
  after: string;
  /**
   * The priced edits: "Pays with charge (was mana)", "Socket Quick III", "Pull Split I", "Opens 2
   * sockets", "New: heavy Fire Lance", "Changed: light Fire Bolt → light Fire Lance".
   */
  notes: string[];
  /** The free moves (the constructs spec, 3.3): "To the bag: …", "From the bag: …", "Reordered". */
  free: string[];
}

const less = lessRunes;

/**
 * What the draft changes, a line a skill in the chains' order: each chain's moves before and
 * after, its priced notes (a payment change, the runes it sockets and pulls across the chain, the
 * sockets it opens, a new construct, a kept one changed) and its free moves (a construct to the
 * bag, `bag`, or from it, `savedBag`; a reorder). Words only: the price and what Apply destroys
 * are the engine's.
 */
export function draftLines(
  registry: DataRegistry,
  stats: HeroStats,
  saved: Partial<Chains>,
  changes: Partial<Chains>,
  bag: readonly Construct[] = [],
  savedBag: readonly Construct[] = [],
): DraftLine[] {
  return CHAIN_SKILLS.flatMap((s) => {
    const now = changes[s];
    if (!now) return [];
    const was = saved[s];
    const names = (c: Chains[ChainSkill]) =>
      Array.isArray(c)
        ? chainText(c.map((b) => blowText(registry, b)))
        : chainText(resolveChain(registry, stats, s as AbilitySlot, c).moves.map(moveText));
    const runes = (c: Chains[ChainSkill] | undefined) =>
      movesOf(c).flatMap((m) => socketsOf(m).filter((r): r is RuneRef => r !== null));
    const sockets = (c: Chains[ChainSkill] | undefined) =>
      movesOf(c).reduce((n, m) => n + socketsOf(m).length, 0);
    const notes: string[] = [];
    const payment = (c: Chains[ChainSkill] | undefined) =>
      c && !Array.isArray(c) ? (c as Chain).payment : null;
    if (payment(was) && payment(now) && payment(was) !== payment(now))
      notes.push(`Pays with ${payment(now)} (was ${payment(was)})`);
    const socketed = less(runes(now), runes(was));
    const pulled = less(runes(was), runes(now));
    if (socketed.length) notes.push(`Socket ${listed(socketed.map((r) => runeName(registry, r)))}`);
    if (pulled.length) notes.push(`Pull ${listed(pulled.map((r) => runeName(registry, r)))}`);
    const opened = sockets(now) - sockets(was);
    if (opened > 0) notes.push(`Opens ${opened} socket${opened === 1 ? '' : 's'}`);
    // By uid: what came from the bag or went to it is free, as is a reorder; a construct with no
    // uid, or from nowhere, is new; a kept one whose kind, form or elements changed is changed.
    const wasMoves = movesOf(was);
    const nowMoves = movesOf(now);
    const wasUids = wasMoves.map((m) => m.uid);
    const nowUids = nowMoves.map((m) => m.uid);
    const inBag = (uid?: string) => !!uid && bag.some((c) => c.uid === uid);
    const wasInBag = (uid?: string) => !!uid && savedBag.some((c) => c.uid === uid);
    const text = (m: Construct) => constructText(registry, m);
    const free: string[] = [];
    for (const m of wasMoves)
      if (!nowUids.includes(m.uid) && inBag(m.uid)) free.push(`To the bag: ${text(m)}`);
    for (const m of nowMoves)
      if (!wasUids.includes(m.uid) && wasInBag(m.uid)) free.push(`From the bag: ${text(m)}`);
    const keptWas = wasUids.filter((u) => u && nowUids.includes(u));
    const keptNow = nowUids.filter((u) => u && wasUids.includes(u));
    if (keptWas.some((u, i) => u !== keptNow[i])) free.push('Reordered');
    for (const m of nowMoves)
      if (!m.uid || (!wasUids.includes(m.uid) && !wasInBag(m.uid))) notes.push(`New: ${text(m)}`);
    for (const m of wasMoves) {
      const n = nowMoves.find((x) => x.uid && x.uid === m.uid);
      if (n && text(n) !== text(m)) notes.push(`Changed: ${text(m)} → ${text(n)}`);
    }
    return [{ skill: s, before: was ? names(was) : '', after: names(now), notes, free }];
  });
}
