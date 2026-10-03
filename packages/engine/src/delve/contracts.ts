import type { DataRegistry } from '../data/registry.js';
import { weightedPick } from '../loot/item-generator.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import { FLUX_GRADES } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { Rarity } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import {
  CONTRACT_TIERS,
  type Contract,
  type ContractTemplate,
  type ObjectiveFilter,
  type Reward,
} from '../types/quests.js';
import type { ReactionId } from '../types/arpg.js';
import { isDiveActive } from './dive.js';
import { profileStats } from './pair.js';
import { DIVE_OPEN } from './quests.js';
import type { ProfileActionResult } from './profile.js';

/**
 * The Contract board (see the quests spec): `profile.quests.board`'s
 * contracts, generated from `quests.json → contractTemplates` on forks of the
 * profile seed (reloading never rerolls), refilled after a dive that cleared a
 * depth, one reroll an Anvil visit. No expiry.
 */

/** What a contract's filter may name for this hero: only what is possible (the spec's Contract board). */
interface Possible {
  /** The biomes of depths 1 to max(1, bestDepth), in order (they cycle). */
  biomes: string[];
  /** Their mana: a foe's element is its biome's. */
  elements: ManaType[];
  /** The pair's reaction, when bound, and every reaction seen. */
  reactions: ReactionId[];
  /** Depth goals: [max(2, bestDepth + lo), bestDepth + hi]. */
  window: [number, number];
  /** The `noPotion` / `noDamage` floors' minDepth. */
  flagDepth: number;
  /** Common up to the best flux grade owned. */
  rarities: Rarity[];
}

function possible(registry: DataRegistry, profile: DelveProfile): Possible {
  const { depthWindow, flagDepthBelow } = registry.getDelveBalance().quests.contracts;
  const best = profile.bestDepth;
  const reached = Array.from({ length: Math.max(1, best) }, (_, i) =>
    registry.getBiomeForDepth(i + 1),
  );
  const { primary, secondary } = profile.pair;
  const reactions = [
    ...(primary && secondary ? [registry.getReactionFor(primary, secondary).id] : []),
    ...(profile.reactionsSeen as ReactionId[]),
  ];
  const owned = FLUX_GRADES.filter((g) => profile.materials.flux[g] > 0);
  const top = owned.length > 0 ? FLUX_GRADES.indexOf(owned[owned.length - 1]) + 1 : 0;
  const lo = Math.max(2, best + depthWindow[0]);
  return {
    biomes: [...new Set(reached.map((b) => b.id))],
    elements: [...new Set(reached.map((b) => b.mana))],
    reactions: [...new Set(reactions)],
    window: [lo, Math.max(lo, best + depthWindow[1])],
    flagDepth: Math.max(1, best - flagDepthBelow),
    rarities: ['common', ...FLUX_GRADES.slice(0, top)],
  };
}

/** A template is offered only when every filter rule it names has a value (a reaction rule needs one known). */
function offered(t: ContractTemplate, can: Possible): boolean {
  return t.filter?.reaction === undefined || can.reactions.length > 0;
}

/**
 * The next contract, `contract:<boardCount>`, from a template and a tier
 * (`contracts.tierWeights`) drawn on `contract:<boardCount>` from the profile
 * seed, its filter filled with only what is possible for the hero, its count
 * from the tier's range and its rewards × (1 + depthScale × bestDepth); a
 * hard one may add an essence (`essence: 'fit'`) at `essenceChance` × Lucky
 * Charm's boost. A template already on the board is passed over while another
 * can be offered. Its text's `{count}`, `{biome}`, `{element}`, `{reaction}`,
 * `{depth}` and `{rarity}` are filled from the data's names, and `{s}` is "s"
 * unless the count is 1. The caller moves `boardCount` on.
 */
export function generateContract(registry: DataRegistry, profile: DelveProfile): Contract {
  const { tierWeights, depthScale, essenceChance } = registry.getDelveBalance().quests.contracts;
  const n = profile.quests.boardCount;
  const rng = new SeededRNG(profile.seed).fork(`contract:${n}`);
  const pick = <T>(xs: readonly T[]): T => xs[rng.nextInt(0, xs.length - 1)];
  const can = possible(registry, profile);
  const all = registry.getQuestsData().contractTemplates.filter((t) => offered(t, can));
  const onBoard = new Set(profile.quests.board.map((c) => c?.template));
  const fresh = all.filter((t) => !onBoard.has(t.id));
  const t = pick(fresh.length > 0 ? fresh : all);
  const tier = weightedPick(CONTRACT_TIERS, (k) => tierWeights[k], rng);

  const rule = t.filter ?? {};
  const filter: ObjectiveFilter = {};
  if (rule.kind) filter.kind = rule.kind;
  if (rule.biome) filter.biome = pick(can.biomes);
  if (rule.element) filter.element = pick(can.elements);
  if (rule.reaction) filter.reaction = pick(can.reactions);
  if (rule.minDepth === 'window') filter.minDepth = rng.nextInt(...can.window);
  if (rule.minDepth === 'flag') filter.minDepth = can.flagDepth;
  if (rule.minRarity) filter.minRarity = pick(can.rarities);
  if (rule.noPotion) filter.noPotion = true;
  if (rule.noDamage) filter.noDamage = true;
  const count = rng.nextInt(...t.count[tier]);

  const scale = 1 + depthScale * profile.bestDepth;
  const scaled = (r: Reward): Reward => ({
    ...r,
    count: Math.max(1, Math.round(r.count * scale)),
    ...(r.fallback && { fallback: scaled(r.fallback) }),
  });
  const rewards = t.rewards[tier].map(scaled);
  if (tier === 'hard') {
    const boost = profileStats(registry, profile).legendaries.lucky_charm ? 2 : 1;
    if (rng.next() < Math.min(1, essenceChance * boost))
      rewards.push({ kind: 'essence', id: 'fit', count: 1 });
  }

  const names: Record<string, string | number> = {
    count,
    s: count === 1 ? '' : 's',
    depth: filter.minDepth ?? '',
    rarity: filter.minRarity ? registry.getQuestsData().rarityNames[filter.minRarity] : '',
    biome: registry.getDelveData().biomes.find((b) => b.id === filter.biome)?.name ?? '',
    element: filter.element ? registry.getArpgData().mana[filter.element].name : '',
    reaction: filter.reaction ? registry.getReaction(filter.reaction).name : '',
  };
  return {
    id: `contract:${n}`,
    template: t.id,
    tier,
    name: t.name,
    line: t.line,
    objectives: [
      {
        id: 'goal',
        type: t.type,
        ...(Object.keys(filter).length > 0 && { filter }),
        count,
        scope: t.scope,
        text: t.text.replace(/\{(\w+)\}/g, (_, k: string) => String(names[k] ?? '')),
      },
    ],
    rewards,
    progress: [{ value: 0, done: false }],
  };
}

/** `profile` with `slot` holding the next contract, `boardCount` moved on. */
function place(registry: DataRegistry, profile: DelveProfile, slot: number): DelveProfile {
  const contract = generateContract(registry, profile);
  const board = profile.quests.board.slice();
  board[slot] = contract;
  return {
    ...profile,
    quests: { ...profile.quests, board, boardCount: profile.quests.boardCount + 1 },
  };
}

/**
 * Every empty slot filled (`generateContract` each, in slot order), and the
 * visit's reroll back (`rerollUsed` false). `createDelveProfile`, and
 * `settleDive` after a dive that cleared a depth, call it while
 * `contractTemplates` holds any.
 */
export function refillBoard(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let next = profile;
  profile.quests.board.forEach((c, slot) => {
    if (!c) next = place(registry, next, slot);
  });
  return { ...next, quests: { ...next.quests, rerollUsed: false } };
}

/**
 * Slot `slot`'s contract replaced (`generateContract`) for `rerollScrap`, once
 * an Anvil visit; refused mid-dive, on an empty slot, on a completed contract
 * (claim it), or once the visit's reroll is spent. The old contract's id leaves `tracked` and `seen`. Pure:
 * the Quests tab calls it as a dry run, and shows its refusals as they read.
 */
export function rerollContract(
  registry: DataRegistry,
  profile: DelveProfile,
  slot: number,
): ProfileActionResult {
  const no = (reason: string): ProfileActionResult => ({ ok: false, profile, reason });
  const old = profile.quests.board[slot];
  const price = registry.getDelveBalance().quests.contracts.rerollScrap;
  if (isDiveActive(profile)) return no(DIVE_OPEN);
  if (!old) return no('No contract to reroll');
  if (old.progress.every((p) => p.done)) return no('Claim it first');
  if (profile.quests.rerollUsed) return no('One reroll a visit: clear a depth to reroll again');
  if (profile.scrap < price) return no('Not enough scrap');
  const placed = place(registry, profile, slot);
  const keep = (ids: string[]) => ids.filter((id) => id !== old.id);
  return {
    ok: true,
    profile: {
      ...placed,
      scrap: placed.scrap - price,
      quests: {
        ...placed.quests,
        rerollUsed: true,
        tracked: keep(placed.quests.tracked),
        seen: keep(placed.quests.seen),
      },
    },
  };
}
