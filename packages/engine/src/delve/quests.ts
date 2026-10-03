import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type { MetalId } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import { rarityIndex } from '../types/gem.js';
import {
  OBJECTIVE_RULES,
  type Objective,
  type ObjectiveProgress,
  type ObjectiveType,
  type ProfileQuests,
  type QuestDef,
  type QuestEvent,
  type QuestId,
  type QuestKind,
  type QuestState,
  type Reward,
  type RewardGrant,
  type RewardRef,
  type RewardView,
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

function questDef(registry: DataRegistry, id: QuestId): QuestDef | undefined {
  return registry.getQuestsData().quests.find((q) => q.id === id);
}

function withQuests(profile: DelveProfile, quests: Partial<ProfileQuests>): DelveProfile {
  return { ...profile, quests: { ...profile.quests, ...quests } };
}

const without = (ids: readonly QuestId[], id: QuestId) => ids.filter((x) => x !== id);

/** Whether `e` counts for `o`: its type, and every filter `o` gives (`pair`: the pair's reaction). */
function matches(
  registry: DataRegistry,
  profile: DelveProfile,
  o: Objective,
  e: QuestEvent,
): boolean {
  if (e.type !== o.type) return false;
  const f = o.filter ?? {};
  const v = e as Partial<{
    kind: string;
    biome: string;
    element: string;
    depth: number;
    noPotion: boolean;
    noDamage: boolean;
    reaction: string;
    rarity: Parameters<typeof rarityIndex>[0];
    legendary: boolean;
  }>;
  const { primary, secondary } = profile.pair;
  return (
    (!f.kind || v.kind === f.kind) &&
    (!f.biome || v.biome === f.biome) &&
    (!f.element || v.element === f.element) &&
    (!f.noPotion || !!v.noPotion) &&
    (!f.noDamage || !!v.noDamage) &&
    (f.minDepth === undefined || (v.depth ?? 0) >= f.minDepth) &&
    (!f.reaction || v.reaction === f.reaction) &&
    (!f.pair ||
      (!!primary &&
        !!secondary &&
        v.reaction === registry.getReactionFor(primary, secondary).id)) &&
    (!f.minRarity || (!!v.rarity && rarityIndex(v.rarity) >= rarityIndex(f.minRarity))) &&
    (!f.legendary || !!v.legendary)
  );
}

/** A state type's value, read from the profile. */
function stateValue(profile: DelveProfile, type: ObjectiveType): number {
  if (type === 'bind') return profile.pair.secondary ? 1 : 0;
  if (type === 'knowPatterns') return profile.patterns.length;
  if (type === 'discoverReaction') return profile.reactionsSeen.length;
  return 0;
}

/**
 * `objectives`' progress with `events` applied: a sum adds each matching
 * event, `reachDepth` (max) takes the deepest depth entered (a `total` one
 * also `bestDepth`), a state type reads the profile; capped at the count. A
 * done objective stays as it is.
 */
function advance(
  registry: DataRegistry,
  profile: DelveProfile,
  objectives: readonly Objective[],
  progress: readonly ObjectiveProgress[] | undefined,
  events: readonly QuestEvent[],
): ObjectiveProgress[] {
  return objectives.map((o, i) => {
    const was = progress?.[i] ?? { value: 0, done: false };
    if (was.done) return was;
    const rule = OBJECTIVE_RULES[o.type].progress;
    const hits = events.filter((e) => matches(registry, profile, o, e));
    const grown =
      rule === 'state'
        ? stateValue(profile, o.type)
        : rule === 'max'
          ? Math.max(
              was.value,
              o.scope === 'total' ? profile.bestDepth : 0,
              ...hits.map((e) => (e.type === 'reachDepth' ? e.depth : 0)),
            )
          : was.value + hits.length;
    const value = Math.min(o.count, grown);
    return { value, done: value >= o.count };
  });
}

function unlockMet(def: QuestDef, profile: DelveProfile): boolean {
  const u = def.unlock ?? {};
  return (
    (!u.after || profile.quests.claimed.includes(u.after)) &&
    profile.bestDepth >= (u.bestDepth ?? 0) &&
    profile.reactionsSeen.length >= (u.reactionsSeen ?? 0) &&
    profile.patterns.length >= (u.patterns ?? 0) &&
    (!u.pair || profile.pair.secondary !== null)
  );
}

/**
 * The profile with `events` applied: every unlocked, unclaimed quest's
 * matching objectives (the board's contracts' too) advance, the state types
 * are read again from the profile, then the unlocks run: a newly unlocked
 * quest starts with its state types read (an early bind counts at once), and
 * a newly unlocked main quest takes the tracked slot of the quest it comes
 * after, or the first free one. Pure and deterministic: every op that emits
 * calls it and returns its result, and an op that only changes a state calls
 * it with no events.
 */
export function applyQuestEvents(
  registry: DataRegistry,
  profile: DelveProfile,
  events: readonly QuestEvent[],
): DelveProfile {
  const q = profile.quests;
  const progress = { ...q.progress };
  for (const id of q.unlocked) {
    const def = questDef(registry, id);
    if (def && !q.claimed.includes(id))
      progress[id] = advance(registry, profile, def.objectives, progress[id], events);
  }
  const board = q.board.map(
    (c) => c && { ...c, progress: advance(registry, profile, c.objectives, c.progress, events) },
  );
  const unlocked = [...q.unlocked];
  const tracked = [...q.tracked];
  const { maxTracked } = registry.getDelveBalance().quests;
  for (const def of registry.getQuestsData().quests) {
    if (unlocked.includes(def.id) || !unlockMet(def, profile)) continue;
    unlocked.push(def.id);
    progress[def.id] = advance(registry, profile, def.objectives, undefined, []);
    if (def.kind !== 'main') continue;
    const slot = def.unlock?.after ? tracked.indexOf(def.unlock.after) : -1;
    if (slot >= 0) tracked[slot] = def.id;
    else if (tracked.length < maxTracked) tracked.push(def.id);
  }
  return withQuests(profile, { progress, board, unlocked, tracked });
}

/**
 * Every unfinished `dive`-scoped objective back to 0 (a done one stays done):
 * a dive's start and its settle call it.
 */
export function resetDiveQuests(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const q = profile.quests;
  const reset = (objectives: readonly Objective[], progress: readonly ObjectiveProgress[]) =>
    progress.map((p, i) =>
      objectives[i]?.scope === 'dive' && !p.done ? { value: 0, done: false } : p,
    );
  const progress = Object.fromEntries(
    Object.entries(q.progress).map(([id, p]) => {
      const def = questDef(registry, id);
      return [id, def ? reset(def.objectives, p) : p];
    }),
  );
  const board = q.board.map((c) => c && { ...c, progress: reset(c.objectives, c.progress) });
  return withQuests(profile, { progress, board });
}

/** A reward as the quest view shows it: concrete, or a rule until it is claimed. */
function rewardView(r: Reward): RewardView {
  const ref: RewardRef | null =
    r.kind === 'scrap' || r.kind === 'dust' || r.kind === 'links'
      ? { kind: r.kind }
      : r.kind === 'metal' && r.id && r.id !== 'depth'
        ? { kind: 'metal', metal: r.id as MetalId }
        : r.kind === 'flux' && r.grade
          ? { kind: 'flux', grade: r.grade }
          : r.kind === 'essence' && r.id && r.id !== 'fit'
            ? { kind: 'essence', essence: r.id }
            : r.kind === 'pattern' && r.id && r.id !== 'unknown'
              ? { kind: 'pattern', pattern: r.id }
              : null;
  return ref ? { ref, count: r.count } : { rule: r };
}

function stateOf(
  q: ProfileQuests,
  kind: QuestKind,
  quest: Pick<QuestDef, 'id' | 'name' | 'line' | 'chapter' | 'objectives' | 'rewards'>,
  progress: readonly ObjectiveProgress[] | undefined,
): QuestState {
  const objectives = quest.objectives.map((o, i) => ({
    id: o.id,
    text: o.text,
    value: progress?.[i]?.value ?? 0,
    count: o.count,
    done: progress?.[i]?.done ?? false,
  }));
  const claimed = q.claimed.includes(quest.id);
  return {
    id: quest.id,
    kind,
    status: claimed ? 'claimed' : objectives.every((o) => o.done) ? 'complete' : 'active',
    isNew: !claimed && !q.seen.includes(quest.id),
    tracked: q.tracked.includes(quest.id),
    name: quest.name,
    line: quest.line,
    ...(quest.chapter ? { chapter: quest.chapter } : {}),
    objectives,
    rewards: quest.rewards.map(rewardView),
  };
}

/** How far down the main chain `def` is: 0 for the first main quest. */
function chainRank(registry: DataRegistry, def: QuestDef): number {
  const after = def.unlock?.after && questDef(registry, def.unlock.after);
  return after ? 1 + chainRank(registry, after) : 0;
}

/**
 * Every unlocked quest, claimed ones included: the main quests in chain
 * order, the side quests in `quests.json`'s, then the board's contracts by
 * slot, as the journal and the HUD draw them: data, never text the engine
 * made.
 */
export function questStates(registry: DataRegistry, profile: DelveProfile): QuestState[] {
  const q = profile.quests;
  const open = registry.getQuestsData().quests.filter((d) => q.unlocked.includes(d.id));
  const main = open
    .filter((d) => d.kind === 'main')
    .sort((a, b) => chainRank(registry, a) - chainRank(registry, b));
  const quests = [...main, ...open.filter((d) => d.kind !== 'main')].map((d) =>
    stateOf(q, d.kind, d, q.progress[d.id]),
  );
  const contracts = q.board.flatMap((c) => (c ? [stateOf(q, 'contract', c, c.progress)] : []));
  return [...quests, ...contracts];
}

/** Why a claim or a reroll is refused while a dive is open (the Anvil mid-dive included). */
export const DIVE_OPEN = 'Finish or leave the dive first';
const NOT_DONE = 'Finish its objectives first';

/**
 * Claim a completed, unclaimed quest or contract: its rewards into the
 * stockpile (`grantRewards`, `ProfileActionResult.rewards`); it leaves
 * `tracked`; a main quest's claim unlocks the next, which takes its tracked
 * slot; a contract leaves the board (`contractsClaimed` + 1, its id out of
 * `seen`). Then the state types are read again (a pattern reward). Refused
 * mid-dive.
 */
export function claimQuest(
  registry: DataRegistry,
  profile: DelveProfile,
  questId: QuestId,
): ProfileActionResult {
  if (isDiveActive(profile)) return { ok: false, profile, reason: DIVE_OPEN };
  const q = profile.quests;
  const slot = q.board.findIndex((c) => c?.id === questId);
  if (slot >= 0) {
    const contract = q.board[slot]!;
    if (!contract.progress.every((p) => p.done)) return { ok: false, profile, reason: NOT_DONE };
    const r = grantRewards(registry, profile, questId, contract.rewards);
    const left = withQuests(r.profile, {
      board: r.profile.quests.board.map((c, i) => (i === slot ? null : c)),
      contractsClaimed: r.profile.quests.contractsClaimed + 1,
      tracked: without(r.profile.quests.tracked, questId),
      seen: without(r.profile.quests.seen, questId),
    });
    return { ok: true, rewards: r.granted, profile: applyQuestEvents(registry, left, []) };
  }
  const def = questDef(registry, questId);
  if (!def || !q.unlocked.includes(questId)) return { ok: false, profile, reason: 'No such quest' };
  if (q.claimed.includes(questId)) return { ok: false, profile, reason: 'Already claimed' };
  if (!def.objectives.every((_, i) => q.progress[questId]?.[i]?.done))
    return { ok: false, profile, reason: NOT_DONE };
  const r = grantRewards(registry, profile, questId, def.rewards);
  const claimed = withQuests(r.profile, { claimed: [...r.profile.quests.claimed, questId] });
  // The next main quest unlocks into this one's tracked slot; then this one leaves `tracked`.
  const next = applyQuestEvents(registry, claimed, []);
  return {
    ok: true,
    rewards: r.granted,
    profile: withQuests(next, { tracked: without(next.quests.tracked, questId) }),
  };
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

/** Whether `questId` is open in the journal: an unlocked, unclaimed quest or a contract on the board. */
function isOpen(q: ProfileQuests, questId: QuestId): boolean {
  return (
    (q.unlocked.includes(questId) && !q.claimed.includes(questId)) ||
    q.board.some((c) => c?.id === questId)
  );
}

/**
 * Track `questId` on the HUD (`on`), up to `delve.quests.maxTracked`, or stop
 * tracking it; allowed mid-dive (the pause). Refuses a quest that isn't open
 * and a tracker that is full.
 */
export function trackQuest(
  registry: DataRegistry,
  profile: DelveProfile,
  questId: QuestId,
  on: boolean,
): ProfileActionResult {
  const q = profile.quests;
  if (!on)
    return { ok: true, profile: withQuests(profile, { tracked: without(q.tracked, questId) }) };
  if (!isOpen(q, questId)) return { ok: false, profile, reason: 'No such quest' };
  if (q.tracked.includes(questId)) return { ok: true, profile };
  const { maxTracked } = registry.getDelveBalance().quests;
  if (q.tracked.length >= maxTracked)
    return { ok: false, profile, reason: `Track at most ${maxTracked} quests` };
  return { ok: true, profile: withQuests(profile, { tracked: [...q.tracked, questId] }) };
}

/** The journal opened `questId`: it is NEW no more. Allowed mid-dive. */
export function markQuestSeen(
  _registry: DataRegistry,
  profile: DelveProfile,
  questId: QuestId,
): DelveProfile {
  const q = profile.quests;
  if (q.seen.includes(questId) || !(q.unlocked.includes(questId) || isOpen(q, questId)))
    return profile;
  return withQuests(profile, { seen: [...q.seen, questId] });
}
