import type { ReactionId } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';

/** A reaction's floating label: its name from arpg.json, shouted. */
export function reactionLabel(id: ReactionId): string {
  return `${getDelveRegistry().getReaction(id).name.toUpperCase()}!`;
}
