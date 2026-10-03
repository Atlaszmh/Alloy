// The quest view the journal and the HUD draw: an engine QuestState through quest-view.ts. Nothing
// here is a rule.
import type { QuestKind, QuestStatus } from '@alloy/engine';

export type { QuestKind, QuestStatus };

export interface QuestObjective {
  id: string;
  text: string;
  hint?: string;
  done: boolean;
  progress?: { value: number; max: number };
}

export interface QuestReward {
  id: string;
  name: string;
  sub?: string;
  color: string;
}

export interface QuestView {
  id: string;
  kind: QuestKind;
  name: string;
  sub: string;
  chapter?: string;
  story?: string;
  /** The giver's sprite id in the arena's atlas. */
  giver?: string;
  objectives: QuestObjective[];
  rewards: QuestReward[];
  tracked: boolean;
  /** Under way, complete (DONE: claim it at the Anvil), or claimed (the journal's Done group). */
  status: QuestStatus;
  /** Unlocked, and not yet opened in the journal. */
  isNew: boolean;
}

/** The HUD tracker shows at most this many. */
export const MAX_TRACKED = 3;

/** Each kind's tag and journal group: its swatch colour and a text colour that passes on steel. */
export const QUEST_KIND: Record<
  QuestKind,
  { tag: string; group: string; swatch: string; text: string }
> = {
  main: { tag: 'Main', group: 'Main', swatch: '#feae34', text: '#feae34' },
  side: { tag: 'Side', group: 'Side', swatch: '#2ce8f5', text: '#2ce8f5' },
  contract: { tag: 'Contract', group: 'Contracts', swatch: '#b55088', text: '#d7a6e8' },
};

/** An objective's count: "6 / 8" while it has progress, else nothing. */
export function objectiveCount(o: QuestObjective): string {
  return o.progress ? `${o.progress.value} / ${o.progress.max}` : '';
}
