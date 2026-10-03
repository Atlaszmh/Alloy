import type { DataRegistry, QuestState, RewardView } from '@alloy/engine';
import { materialLabel } from '../hub/forge/materials-text';
import { PATTERN_COLOR, SCRAP_COLOR, materialColor } from '../materials/material-style';
import type { QuestReward, QuestView } from './types';

/** A rule's swatch until it is claimed. */
const RULE_COLOR = '#c0cbdc';

/**
 * An engine quest (`questStates`) as the journal and the HUD tracker draw it: Hesta gives every
 * quest, her line is its story, and each reward is named. A minimal adapter: status, NEW and a
 * rule's own text come with the Quests tab.
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
  };
}

/** "3 × Iron bar", "40 scrap", "Sword pattern"; a rule reads "Chosen when you claim it". */
function rewardView(registry: DataRegistry, reward: RewardView, id: string): QuestReward {
  if ('rule' in reward) return { id, name: 'Chosen when you claim it', color: RULE_COLOR };
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
