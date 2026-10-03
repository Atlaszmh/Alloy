import type { DataRegistry } from '../data/registry.js';
import type { ProfileQuests } from '../types/quests.js';

/**
 * Quests on the profile (see the quests spec): progress from quest events,
 * unlocks, claims, tracking and the journal's view.
 */

/**
 * A new save's quests: nothing unlocked, claimed, tracked or seen, and the
 * Contract board's `contracts.slots` slots empty.
 */
export function emptyQuests(registry: DataRegistry): ProfileQuests {
  return {
    progress: {},
    unlocked: [],
    claimed: [],
    tracked: [],
    seen: [],
    board: Array.from({ length: registry.getDelveBalance().quests.contracts.slots }, () => null),
    boardCount: 0,
    contractsClaimed: 0,
    rerollUsed: false,
    claimCount: 0,
  };
}
