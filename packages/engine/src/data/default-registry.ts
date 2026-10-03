import { loadAndValidateData } from './loader.js';
import { questsDataProblems } from './quests-check.js';
import { DataRegistry } from './registry.js';

/** Build a registry with every bundled data file, including Delve data. */
export function createDefaultRegistry(): DataRegistry {
  const data = loadAndValidateData();
  const registry = new DataRegistry(
    data.affixes,
    data.combinations,
    data.synergies,
    data.baseItems,
    data.balance,
    data.recipes,
    data.delve,
    data.arpg,
    data.crafting,
    data.quests,
  );
  // quests.json's references into the other files (see the quests spec).
  const problems = questsDataProblems(registry);
  if (problems.length > 0) throw new Error(`quests.json: ${problems.join('; ')}`);
  return registry;
}
