import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type { DelveProfile } from '../types/delve.js';
import type {
  ProfileQuests,
  QuestEvent,
  QuestId,
  QuestState,
  Reward,
  RewardGrant,
} from '../types/quests.js';
import { isDiveActive } from './dive.js';
import type { ProfileActionResult } from './profile.js';
import { resolveReward } from './rewards.js';

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

/**
 * The profile with `events` applied: every unlocked, unclaimed quest's
 * matching objectives (the board's contracts' too) advance, the state types
 * are read again from the profile, then the unlocks run (a newly unlocked
 * main quest takes the old main's tracked slot, or the first free one). Pure
 * and deterministic: every op that emits calls it and returns its result, and
 * an op that only changes a state calls it with no events. Stub (B1): until
 * then it applies nothing and returns `profile`, so the calls already wired
 * to it (`createDelveProfile`'s first unlocks) change nothing.
 */
export function applyQuestEvents(
  _registry: DataRegistry,
  profile: DelveProfile,
  _events: readonly QuestEvent[],
): DelveProfile {
  return profile;
}

/**
 * Every unlocked quest, main, side and the board's contracts, as the journal
 * and the HUD draw it: data, never text the engine made. Stub (B1): until
 * then it shows none.
 */
export function questStates(_registry: DataRegistry, _profile: DelveProfile): QuestState[] {
  return [];
}

const CLAIM_AT_ANVIL = 'Claim at the Anvil, between dives';

/**
 * Claim a completed, unclaimed quest or contract: its rewards into the
 * stockpile (`grantRewards`, `ProfileActionResult.rewards`); it leaves
 * `tracked`; a main quest's claim unlocks the next; a contract leaves the
 * board (`contractsClaimed` + 1, its id out of `seen`). Refused mid-dive. Stub
 * (B1) past the dive lock.
 */
export function claimQuest(
  _registry: DataRegistry,
  profile: DelveProfile,
  _questId: QuestId,
): ProfileActionResult {
  if (isDiveActive(profile)) return { ok: false, profile, reason: CLAIM_AT_ANVIL };
  throw new Error('claimQuest: not implemented');
}

/**
 * A claim's rewards into the stockpile, each through `resolveReward` on the
 * claim's stream, `quest:<questId>:<claimCount>` from the profile seed, and
 * `claimCount` moved on. `claimQuest` calls it once it has checked the claim.
 */
export function grantRewards(
  registry: DataRegistry,
  profile: DelveProfile,
  questId: QuestId,
  rewards: readonly Reward[],
): { profile: DelveProfile; granted: RewardGrant[] } {
  const rng = new SeededRNG(profile.seed).fork(`quest:${questId}:${profile.quests.claimCount}`);
  let next = profile;
  const granted: RewardGrant[] = [];
  for (const reward of rewards) {
    const r = resolveReward(registry, next, reward, rng);
    next = r.profile;
    granted.push(r.granted);
  }
  return {
    profile: { ...next, quests: { ...next.quests, claimCount: profile.quests.claimCount + 1 } },
    granted,
  };
}

/**
 * Track `questId` on the HUD (`on`), up to `delve.quests.maxTracked`, or stop
 * tracking it; allowed mid-dive (the pause). Stub (B1).
 */
export function trackQuest(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _questId: QuestId,
  _on: boolean,
): ProfileActionResult {
  throw new Error('trackQuest: not implemented');
}

/** The journal opened `questId`: it is NEW no more. Allowed mid-dive. Stub (B1). */
export function markQuestSeen(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _questId: QuestId,
): DelveProfile {
  throw new Error('markQuestSeen: not implemented');
}
