import type { ChainSkill, DataRegistry, ManaType, MoveKind } from '@alloy/engine';
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
