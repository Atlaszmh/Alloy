import {
  resolveAbility,
  runeFits,
  socketsOf,
  type AbilitySlot,
  type Blow,
  type Chain,
  type ChainSkill,
  type DataRegistry,
  type HeroStats,
  type ManaType,
  type Move,
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

/** A move's kind as its choice says it: "Light", "Hold". */
export const KIND_NAME: Record<MoveKind, string> = {
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
  hold: 'Hold',
};

/** A move's kind at a glance (the one-column builder): plain geometric shapes, never emoji (▪ is one). */
export const KIND_ICON: Record<MoveKind, string> = {
  light: '■',
  medium: '■■',
  heavy: '■■■',
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

/**
 * A construct's name as the bag and the Apply sheet say it, unresolved: "light Fire Bolt",
 * "medium Fire+Nature Burst", "heavy Storm blow".
 */
export function constructText(registry: DataRegistry, c: Move | Blow): string {
  if ('element' in c) return blowText(registry, c);
  const els = c.elements.map((m) => manaStyle(registry, m).name).join('+');
  return `${KIND_LABEL[c.kind]} ${els} ${registry.getForm(c.form).name}`;
}

/** `a` less `b`, rune by rune (id and tier): what left, or what came. */
export function lessRunes(a: readonly RuneRef[], b: readonly RuneRef[]): RuneRef[] {
  const left = [...b];
  return a.filter((r) => {
    const i = left.findIndex((x) => x.id === r.id && x.tier === r.tier);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
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
    // Dormancy doesn't depend on tier, so the Training Grounds' tier-I candidates mark every tier.
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

/**
 * What an option does to the chain's damage a second (the move editor's grids): "+8% chain
 * damage a second", "−3% …", or "… unchanged"; null when either side is unknown or the chain
 * deals none.
 */
export function damageShift(now: number | null, then: number | null): string | null {
  if (now === null || then === null || now <= 0) return null;
  const pct = Math.round((then / now - 1) * 100);
  if (pct === 0) return 'Chain damage a second unchanged';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}% chain damage a second`;
}
