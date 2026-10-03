import type { DataRegistry, QuestState, Reward, RewardView, RuneTier } from '@alloy/engine';
import { RARITY_COLOR } from '../format';
import { materialLabel } from '../hub/forge/materials-text';
import {
  AFFIX_FAMILY_COLOR,
  PATTERN_COLOR,
  SCRAP_COLOR,
  materialColor,
} from '../materials/material-style';
import { TIER_NUMERAL } from '../runes/rune-style';
import type { QuestReward, QuestView } from './types';

/** A rule's swatch where its kind has no colour of its own. */
const RULE_COLOR = '#c0cbdc';
/** A rule's note: the engine settles it when the quest is claimed. */
const CHOSEN = 'Chosen when you claim it';

/**
 * An engine quest (`questStates`) as the journal and the HUD tracker draw it: Hesta gives every
 * quest, her line is its story, each reward is named (a rule by what it will be), and its status
 * and NEW ride along.
 */
export function questView(registry: DataRegistry, quest: QuestState): QuestView {
  return {
    id: quest.id,
    kind: quest.kind,
    name: quest.name,
    sub: quest.chapter ?? quest.objectives[0]?.text ?? '',
    chapter: quest.chapter,
    story: quest.line,
    giver: registry.getQuestsData().giver.sprite,
    objectives: quest.objectives.map((o) => ({
      id: o.id,
      text: o.text,
      done: o.done,
      progress: { value: o.value, max: o.count },
    })),
    rewards: quest.rewards.map((r, i) => rewardView(registry, r, String(i))),
    tracked: quest.tracked,
    status: quest.status,
    isNew: quest.isNew,
  };
}

/**
 * A reward as the journal names it: "3 × Iron bar", "40 scrap", "Sword pattern", or a rule by
 * what it will be ("A tier III offense shard", chosen when it is claimed). A claim's grants too.
 */
export function rewardView(registry: DataRegistry, reward: RewardView, id: string): QuestReward {
  if ('rule' in reward) return ruleView(reward.rule, id);
  const { ref, count } = reward;
  switch (ref.kind) {
    case 'scrap':
      return { id, name: `${count} scrap`, color: SCRAP_COLOR };
    case 'pattern':
      return {
        id,
        name: `${registry.getGearBase(ref.pattern).name} pattern`,
        color: PATTERN_COLOR,
      };
    default:
      return {
        id,
        name: `${count} × ${materialLabel(registry, ref)}`,
        color: materialColor(registry, ref),
      };
  }
}

/**
 * The quests spec's rule rewards, which `resolveReward` settles at the claim: the best depth's
 * metal, a shard of a family and tier, an essence that fits a known pattern, an unknown pattern.
 */
function ruleView(r: Reward, id: string): QuestReward {
  const rule = (one: string, many: string, color: string): QuestReward => ({
    id,
    name: r.count === 1 ? one : `${r.count} ${many}`,
    sub: CHOSEN,
    color,
  });
  if (r.kind === 'metal' && r.id === 'depth')
    return rule('A bar of your deepest metal', 'bars of your deepest metal', RULE_COLOR);
  if (r.kind === 'shard' && r.family && r.tier) {
    const what = `tier ${TIER_NUMERAL[r.tier as RuneTier]} ${r.family}`;
    return rule(`A ${what} shard`, `${what} shards`, AFFIX_FAMILY_COLOR[r.family]);
  }
  if (r.kind === 'essence' && r.id === 'fit')
    return rule(
      'An essence for a pattern you know',
      'essences for patterns you know',
      RARITY_COLOR.legendary,
    );
  if (r.kind === 'pattern' && r.id === 'unknown')
    return rule("A pattern you don't know yet", "patterns you don't know yet", PATTERN_COLOR);
  return { id, name: CHOSEN, color: RULE_COLOR };
}
