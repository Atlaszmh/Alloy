import type { DataRegistry, ManaType, MoveKind } from '@alloy/engine';
import { manaStyle } from '../format';

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

/** A chain's names in order: "light Fire Bolt · medium Fire Bolt". */
export function chainText(names: readonly string[]): string {
  return names.join(' · ');
}
