import {
  runeFits,
  type Blow,
  type ChainSkill,
  type DataRegistry,
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

/** What a move's runes are socketed on: an ability move's form, or a blow of `weaponBaseId`. */
export function runeTarget(m: Move | Blow, weaponBaseId: string | null): RuneTarget {
  return 'form' in m ? { form: m.form } : { weapon: weaponBaseId, kind: m.kind };
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
