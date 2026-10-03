import type { QuestDef, Reward } from '../types/quests.js';
import type { DataRegistry } from './registry.js';

/**
 * `quests.json`'s references into the other data files, which its schema
 * can't see (see the quests spec): objective biomes, pattern and essence
 * rewards, `unlock.after`, and the main quests forming one chain, each
 * unlocking after the one before. One line a problem; `createDefaultRegistry`
 * refuses data with any. (Reactions, rarities, monster kinds, flux grades and
 * families are enums, checked by `QuestsDataSchema`.)
 */
export function questsDataProblems(registry: DataRegistry): string[] {
  const { quests, contractTemplates } = registry.getQuestsData();
  const delve = registry.getDelveData();
  const biomes = new Set(delve.biomes.map((b) => b.id));
  const bases = new Set(delve.bases.map((b) => b.id));
  const legendaries = new Set(delve.legendaries.map((l) => l.id));
  const ids = new Set(quests.map((q) => q.id));
  const problems: string[] = [];
  const reward = (where: string, r: Reward): void => {
    if (r.kind === 'pattern' && r.id !== 'unknown' && !bases.has(r.id!))
      problems.push(`${where}: no pattern ${r.id}`);
    if (r.kind === 'essence' && r.id !== 'fit' && !legendaries.has(r.id!))
      problems.push(`${where}: no legendary ${r.id}`);
    if (r.fallback) reward(where, r.fallback);
  };
  for (const q of quests) {
    for (const o of q.objectives)
      if (o.filter?.biome !== undefined && !biomes.has(o.filter.biome))
        problems.push(`${q.id}: no biome ${o.filter.biome}`);
    for (const r of q.rewards) reward(q.id, r);
    const after = q.unlock?.after;
    if (after !== undefined && !ids.has(after)) problems.push(`${q.id}: no quest ${after}`);
  }
  for (const t of contractTemplates)
    for (const r of Object.values(t.rewards).flat()) reward(t.id, r);

  const mains = quests.filter((q) => q.kind === 'main');
  const firsts = mains.filter((q) => q.unlock?.after === undefined);
  if (mains.length > 0 && firsts.length !== 1)
    problems.push('the main chain has one first quest, with no after');
  else if (mains.length > 0) {
    // Each quest has one `after`, and the first none: the walk can't loop.
    let on = 0;
    let q: QuestDef | undefined = firsts[0];
    while (q) {
      on++;
      const id: string = q.id;
      const next: QuestDef[] = mains.filter((m) => m.unlock?.after === id);
      if (next.length > 1) problems.push(`the main chain forks after ${id}`);
      q = next[0];
    }
    if (on !== mains.length) problems.push('every main quest is on the one chain');
  }
  return problems;
}
