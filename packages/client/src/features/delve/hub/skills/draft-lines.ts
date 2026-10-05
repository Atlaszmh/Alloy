import {
  CHAIN_SKILLS,
  movesOf,
  resolveChain,
  socketsOf,
  type AbilitySlot,
  type Chain,
  type Chains,
  type ChainSkill,
  type DataRegistry,
  type HeroStats,
  type RuneRef,
} from '@alloy/engine';
import { blowText, chainText, listed, moveText } from '../../chains/chain-text';
import { runeName } from '../../runes/rune-style';

/** One skill the draft changes, as the Apply sheet lists it. */
export interface DraftLine {
  skill: ChainSkill;
  /** The chain as the weapon holds it, and as the draft makes it ("light Fire Bolt · heavy Fire Bolt"). */
  before: string;
  after: string;
  /** "Pays with charge (was mana)", "Socket Quick III", "Pull Split I", "Opens 2 sockets". */
  notes: string[];
}

/** `a` less `b`, rune by rune (id and tier). */
function less(a: RuneRef[], b: RuneRef[]): RuneRef[] {
  const left = [...b];
  return a.filter((r) => {
    const i = left.findIndex((x) => x.id === r.id && x.tier === r.tier);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
}

/**
 * What the draft changes, a line a skill in the chains' order: each chain's moves before and
 * after, and its notes (a payment change, the runes it sockets and pulls across the chain, the
 * sockets it opens). Words only: the price and what Apply destroys are the engine's (`draftPrice`).
 */
export function draftLines(
  registry: DataRegistry,
  stats: HeroStats,
  saved: Partial<Chains>,
  changes: Partial<Chains>,
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
    return [{ skill: s, before: was ? names(was) : '', after: names(now), notes }];
  });
}
