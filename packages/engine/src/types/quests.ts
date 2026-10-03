import type { MonsterKind, ReactionId } from './arpg.js';
import type { AffixFamily, FluxGrade, MaterialRef } from './crafting.js';
import type { Rarity } from './gear.js';
import type { ManaType } from './mana.js';

/**
 * Delve quests (see the quests spec): the quests and contract templates of
 * `quests.json`, the events that advance their objectives, the save's
 * `quests`, and the view the client draws. The engine formats nothing.
 */

/** A quest's id: `quests.json`'s, or a contract's `contract:<n>`. */
export type QuestId = string;

/** Main (a chain), side (unlocked by a condition) or a contract (from the board). */
export type QuestKind = 'main' | 'side' | 'contract';

/** `total`: from when the quest unlocks; `dive`: within one dive (reset when a dive starts and when it settles). */
export type ObjectiveScope = 'total' | 'dive';

/** Every objective type: only the ones the content uses (the spec's S6). */
export const OBJECTIVE_TYPES = [
  'kill',
  'reachDepth',
  'clearFloor',
  'extract',
  'boss',
  'reaction',
  'perfectDodge',
  'forge',
  'refine',
  'bind',
  'openSocket',
  'knowPatterns',
  'discoverReaction',
] as const;
export type ObjectiveType = (typeof OBJECTIVE_TYPES)[number];

/** What narrows an objective's events (each type takes only its own: `OBJECTIVE_RULES`). */
export interface ObjectiveFilter {
  /** `kill`: the foe's kind (a boss counts only through `boss`). */
  kind?: Exclude<MonsterKind, 'boss'>;
  /** `kill`, `clearFloor`, `boss`: the biome's id. */
  biome?: string;
  /** `kill`: the foe's element. */
  element?: ManaType;
  /** `clearFloor`: no potion drunk on the floor. */
  noPotion?: boolean;
  /** `clearFloor`: no damage taken on the floor. */
  noDamage?: boolean;
  /** `clearFloor`, `extract`: at this depth or deeper. */
  minDepth?: number;
  /** `reaction`: this reaction. */
  reaction?: ReactionId;
  /** `reaction`: the hero's pair's reaction, resolved against `profile.pair` when the event applies. */
  pair?: true;
  /** `forge`: this rarity or better. */
  minRarity?: Rarity;
  /** `forge`: a legendary. */
  legendary?: boolean;
}

/** How an objective type's progress grows (the spec's objective table). */
export interface ObjectiveRule {
  /**
   * `sum`: each matching event adds one; `max`: the highest an event brings
   * (`reachDepth`: the depth entered; a `total` one also reads `bestDepth`);
   * `state`: read from the profile on every `applyQuestEvents` (`bind`: 1 once
   * `pair.secondary` is set; `knowPatterns`: `patterns.length`;
   * `discoverReaction`: `reactionsSeen.length`).
   */
  progress: 'sum' | 'max' | 'state';
  /** The filter fields it takes. */
  filters: readonly (keyof ObjectiveFilter)[];
  /** Only the Anvil advances it: `scope: 'dive'` is refused. */
  anvilOnly: boolean;
}

export const OBJECTIVE_RULES: Record<ObjectiveType, ObjectiveRule> = {
  kill: { progress: 'sum', filters: ['kind', 'biome', 'element'], anvilOnly: false },
  reachDepth: { progress: 'max', filters: [], anvilOnly: false },
  clearFloor: {
    progress: 'sum',
    filters: ['biome', 'noPotion', 'noDamage', 'minDepth'],
    anvilOnly: false,
  },
  extract: { progress: 'sum', filters: ['minDepth'], anvilOnly: false },
  boss: { progress: 'sum', filters: ['biome'], anvilOnly: false },
  reaction: { progress: 'sum', filters: ['reaction', 'pair'], anvilOnly: false },
  perfectDodge: { progress: 'sum', filters: [], anvilOnly: false },
  forge: { progress: 'sum', filters: ['minRarity', 'legendary'], anvilOnly: true },
  refine: { progress: 'sum', filters: [], anvilOnly: true },
  bind: { progress: 'state', filters: [], anvilOnly: true },
  openSocket: { progress: 'sum', filters: [], anvilOnly: true },
  knowPatterns: { progress: 'state', filters: [], anvilOnly: true },
  discoverReaction: { progress: 'state', filters: [], anvilOnly: false },
};

/** One goal of a quest or a contract. */
export interface Objective {
  /** Unique within its quest. */
  id: string;
  type: ObjectiveType;
  filter?: ObjectiveFilter;
  /** It completes here, and its progress is capped here. */
  count: number;
  scope: ObjectiveScope;
  text: string;
}

/** An objective's progress: `value` up to its count; once `done` it stays done (a `dive` reset never clears it). */
export interface ObjectiveProgress {
  value: number;
  done: boolean;
}

/** What unlocks a quest: every condition given (no `unlock`: unlocked on a new save). */
export interface Unlock {
  /** This quest claimed. */
  after?: QuestId;
  bestDepth?: number;
  /** Reactions discovered, at least. */
  reactionsSeen?: number;
  /** Patterns known, at least. */
  patterns?: number;
  /** A secondary bound. */
  pair?: true;
}

export const REWARD_KINDS = [
  'scrap',
  'dust',
  'links',
  'metal',
  'flux',
  'shard',
  'essence',
  'pattern',
] as const;
export type RewardKind = (typeof REWARD_KINDS)[number];

/**
 * A reward, concrete or a rule `resolveReward` settles when it is claimed:
 * `metal` with `id` a metal or `'depth'` (the metal of the hero's best depth);
 * `flux` with `grade`; `shard` with `family` and `tier` (a random affix of the
 * family at that tier, clamped to the affix's tiers); `essence` with `id` a
 * legendary or `'fit'` (one whose slots fit a learned pattern); `pattern` with
 * `id` a base or `'unknown'` (a random unknown pattern, else `fallback`).
 * Scrap, Mana Dust and Links name only their count.
 */
export interface Reward {
  kind: RewardKind;
  id?: string;
  grade?: FluxGrade;
  family?: AffixFamily;
  tier?: number;
  count: number;
  /** `pattern: 'unknown'`: the reward once every pattern is known. */
  fallback?: Reward;
}

/** A main or side quest (`quests.json → quests`). */
export interface QuestDef {
  id: QuestId;
  kind: Exclude<QuestKind, 'contract'>;
  name: string;
  chapter?: string;
  /** The giver's line. */
  line: string;
  unlock?: Unlock;
  /** One to three. */
  objectives: Objective[];
  rewards: Reward[];
}

export const CONTRACT_TIERS = ['easy', 'normal', 'hard'] as const;
export type ContractTier = (typeof CONTRACT_TIERS)[number];

/**
 * How a contract template's filter is filled when a contract is generated, from
 * only what is possible for the hero (see the spec's Contract board):
 * `'reached'` a biome reached (or its mana), `'known'` the pair's reaction or
 * one in `reactionsSeen`, `'window'` a depth in `depthWindow`, `'flag'` the flag
 * floors' depth, `'owned'` up to the best flux grade owned.
 */
export interface ContractFilterRules {
  kind?: Exclude<MonsterKind, 'boss'>;
  biome?: 'reached';
  element?: 'reached';
  reaction?: 'known';
  minDepth?: 'window' | 'flag';
  minRarity?: 'owned';
  noPotion?: true;
  noDamage?: true;
}

/** A contract template (`quests.json → contractTemplates`): one objective, its count and rewards by tier. */
export interface ContractTemplate {
  id: string;
  name: string;
  line: string;
  type: ObjectiveType;
  filter?: ContractFilterRules;
  /** The count's range by tier, low to high. */
  count: Record<ContractTier, [number, number]>;
  scope: ObjectiveScope;
  /** The objective's text (how a filled filter shows in it is the generator's). */
  text: string;
  /** Rewards by tier, before `contracts.depthScale`. */
  rewards: Record<ContractTier, Reward[]>;
}

/** `quests.json`. */
export interface QuestsData {
  /** Hesta, the Anvil-keeper: her name and her sprite's id in the arena's atlas. */
  giver: { name: string; sprite: string };
  /** Each rarity's name, as a contract's text shows it (`{rarity}`). */
  rarityNames: Record<Rarity, string>;
  quests: QuestDef[];
  contractTemplates: ContractTemplate[];
}

/** A generated contract on the board: concrete, and the one home of its progress. */
export interface Contract {
  /** `contract:<n>`, n the board's `boardCount` when it was generated. */
  id: QuestId;
  template: string;
  tier: ContractTier;
  name: string;
  line: string;
  objectives: Objective[];
  rewards: Reward[];
  progress: ObjectiveProgress[];
}

/** The save's quests (`DelveProfile.quests`). */
export interface ProfileQuests {
  /** Each unlocked main and side quest's objectives' progress, in order. */
  progress: Record<QuestId, ObjectiveProgress[]>;
  unlocked: QuestId[];
  claimed: QuestId[];
  /** On the HUD: at most `delve.quests.maxTracked`. */
  tracked: QuestId[];
  /** Opened in the journal (no longer NEW). */
  seen: QuestId[];
  /** The Contract board: `contracts.slots` entries, each a contract or empty. */
  board: (Contract | null)[];
  /** Contracts generated so far: the next one's id and stream. */
  boardCount: number;
  contractsClaimed: number;
  /** This Anvil visit's reroll is spent. */
  rerollUsed: boolean;
  /** Claims so far: a claim's rewards draw on `quest:<id>:<claimCount>`. */
  claimCount: number;
}

/**
 * What happened, for the objectives: mid-dive in `WorldPending.questEvents`
 * (applied when the world banks); the Anvil's ops apply theirs at once.
 * `knowPatterns` and `discoverReaction` are read from the profile, never emitted.
 */
export type QuestEvent =
  | { type: 'kill'; kind: Exclude<MonsterKind, 'boss'>; biome: string; element: ManaType }
  | { type: 'reachDepth'; depth: number }
  | { type: 'clearFloor'; biome: string; depth: number; noPotion: boolean; noDamage: boolean }
  | { type: 'extract'; depth: number }
  | { type: 'boss'; biome: string }
  | { type: 'reaction'; reaction: ReactionId }
  | { type: 'perfectDodge' }
  | { type: 'forge'; rarity: Rarity; legendary: boolean }
  | { type: 'refine' }
  | { type: 'bind' }
  | { type: 'openSocket' };

/** A concrete reward's what: a material (Mana Dust and Links included), scrap, or a pattern. */
export type RewardRef = MaterialRef | { kind: 'scrap' } | { kind: 'pattern'; pattern: string };

/** A concrete reward: what, and how many. */
export interface RewardGrant {
  ref: RewardRef;
  count: number;
}

/** A reward as the quest view shows it: concrete, or a rule (shown as text until it is claimed). */
export type RewardView = RewardGrant | { rule: Reward };

export type QuestStatus = 'active' | 'complete' | 'claimed';

/** One quest, main, side or contract, as the journal and the HUD draw it (`questStates`). */
export interface QuestState {
  id: QuestId;
  kind: QuestKind;
  status: QuestStatus;
  /** Unlocked, and not yet opened in the journal. */
  isNew: boolean;
  tracked: boolean;
  name: string;
  line: string;
  chapter?: string;
  objectives: { id: string; text: string; value: number; count: number; done: boolean }[];
  rewards: RewardView[];
}

/** `balance.json → delve.quests`. */
export interface QuestsBalance {
  /** Quests the HUD tracks, at most. */
  maxTracked: number;
  contracts: {
    /** The board's slots. */
    slots: number;
    /** How often each tier is generated. */
    tierWeights: Record<ContractTier, number>;
    /** A contract's reward counts × (1 + depthScale × bestDepth), rounded. */
    depthScale: number;
    /** Depth goals lie within [max(2, bestDepth + lo), bestDepth + hi]. */
    depthWindow: [number, number];
    /** `noPotion` / `noDamage` floor contracts carry minDepth = max(1, bestDepth − this). */
    flagDepthBelow: number;
    /** Scrap a reroll costs (one a visit). */
    rerollScrap: number;
    /** A hard contract's chance of an extra essence (× Lucky Charm's `legendaryBoost`), rolled at generation. */
    essenceChance: number;
  };
}
