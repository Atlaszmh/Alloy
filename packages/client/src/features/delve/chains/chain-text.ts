import {
  resolveAbility,
  runeFits,
  socketsOf,
  type AbilitySlot,
  type Chain,
  type ChainSkill,
  type DataRegistry,
  type HeroStats,
  type ManaType,
  type MoveKind,
  type RunePouch,
  type RuneRef,
  type RuneTarget,
  type RuneTier,
} from '@alloy/engine';
import { manaStyle } from '../format';

/** A skill's name in the builder and the notices. */
export const SKILL_NAME: Record<ChainSkill, string> = {
  basic: 'Basic',
  primary: 'Primary',
  defensive: 'Defensive',
  ultimate: 'Ultimate',
};

/** How a move's kind reads in a name: "light Fire Bolt", "held Frost Lance". */
export const KIND_LABEL: Record<MoveKind, string> = {
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
  hold: 'held',
};

/** A move's kind at a glance (the builder's cards, the HUD's buttons). */
export const KIND_ICON: Record<MoveKind, string> = {
  light: '▪',
  medium: '▪▪',
  heavy: '▪▪▪',
  hold: '◉',
};

/** A resolved move's name with its kind: "light Fire Bolt", "medium Wildfire Burst". */
export function moveText(move: { kind: MoveKind; name: string }): string {
  return `${KIND_LABEL[move.kind]} ${move.name}`;
}

/** A basic blow's name: "heavy Storm blow". */
export function blowText(
  registry: DataRegistry,
  blow: { kind: MoveKind; element: ManaType },
): string {
  return `${KIND_LABEL[blow.kind]} ${manaStyle(registry, blow.element).name} blow`;
}

/** "a", "a and b", "a, b and c". */
export function listed(items: readonly string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items.join('');
}

/** A chain's names in order: "light Fire Bolt · medium Fire Bolt". */
export function chainText(names: readonly string[]): string {
  return names.join(' · ');
}

/**
 * The runes a socket can take: each that fits `on` and isn't in the move's other sockets
 * (`others`), by tier with its count from `pouch`; or, from 'any' (the Training Grounds, which
 * pick the tier in the picker), once each.
 */
export function runeCandidates(
  registry: DataRegistry,
  on: RuneTarget,
  others: readonly (RuneRef | null)[],
  pouch: RunePouch | 'any',
): { rune: RuneRef; count: number | null }[] {
  const taken = new Set(others.map((r) => r?.id));
  return registry
    .getRunes()
    .filter((def) => runeFits(def, on) && !taken.has(def.id))
    .flatMap((def): { rune: RuneRef; count: number | null }[] =>
      pouch === 'any'
        ? [{ rune: { id: def.id, tier: 1 }, count: null }]
        : (pouch[def.id] ?? []).flatMap((n, i) =>
            n > 0 ? [{ rune: { id: def.id, tier: (i + 1) as RuneTier }, count: n }] : [],
          ),
    );
}

/**
 * `candidates` for socket `at.socket` of move `at.index` of an ability's chain, each marked
 * dormant when it would do nothing there: resolving the move with it in the socket leaves it out
 * of `ResolvedAbility.runes` (a Pierce on an Earth Bolt), the rule the builder's dormant marks
 * follow. The picker dims it and shows no price. A blow's (`at` null) stay unmarked: blows are free.
 */
export function markIdle(
  registry: DataRegistry,
  stats: HeroStats,
  at: { slot: AbilitySlot; chain: Chain; index: number; socket: number } | null,
  candidates: readonly { rune: RuneRef; count: number | null }[],
): { rune: RuneRef; count: number | null; dormant: boolean }[] {
  return candidates.map((c) => {
    if (!at) return { ...c, dormant: false };
    const move = at.chain.moves[at.index];
    const runes = socketsOf(move).map((r, k) => (k === at.socket ? c.rune : r));
    const ab = resolveAbility(registry, at.slot, { ...move, runes }, at.chain.payment, stats);
    return { ...c, dormant: !ab.runes.some((r) => r.id === c.rune.id) };
  });
}

/** Runes counted by id and tier, in the order first seen: [{ Quick I, 1 }, { Split III, 2 }]. */
export function countRunes(refs: readonly RuneRef[]): { rune: RuneRef; count: number }[] {
  const out: { rune: RuneRef; count: number }[] = [];
  for (const r of refs) {
    const seen = out.find((o) => o.rune.id === r.id && o.rune.tier === r.tier);
    if (seen) seen.count++;
    else out.push({ rune: r, count: 1 });
  }
  return out;
}
