import { loadAndValidateData } from '../../src/data/loader.js';
import { DataRegistry } from '../../src/data/registry.js';
import type { DelveProfile } from '../../src/types/delve.js';
import type { Objective, QuestDef } from '../../src/types/quests.js';

// Fixture quests for the quests' engine tests: the default data with the
// test's own quests and no contract templates (the content is B2's).

const data = loadAndValidateData();

/** The default data, its quests `quests` and no contract templates. */
export function questRegistry(quests: QuestDef[]): DataRegistry {
  const d = data;
  return new DataRegistry({ ...d, quests: { ...d.quests, quests, contractTemplates: [] } });
}

/** An objective: `count` of `type`, scoped `total` unless `more` says otherwise. */
export function obj(
  type: Objective['type'],
  count: number,
  more: Partial<Objective> = {},
): Objective {
  return { id: type, type, count, scope: 'total', text: `${count} ${type}`, ...more };
}

/** A side quest with `objectives`, no unlock and no rewards, unless `more` says otherwise. */
export function quest(id: string, objectives: Objective[], more: Partial<QuestDef> = {}): QuestDef {
  return { id, kind: 'side', name: id, line: `${id}'s line`, objectives, rewards: [], ...more };
}

/** Objective `i`'s progress value of quest `id`. */
export const value = (p: DelveProfile, id: string, i = 0) => p.quests.progress[id]?.[i]?.value;
