import { loadAndValidateData } from './loader.js';
import { questsDataProblems } from './quests-check.js';
import { DataRegistry } from './registry.js';

/** Build a registry with every bundled data file, including Delve data. */
export function createDefaultRegistry(): DataRegistry {
  const registry = new DataRegistry(loadAndValidateData());
  // quests.json's references into the other files (see the quests spec).
  const problems = questsDataProblems(registry);
  if (problems.length > 0) throw new Error(`quests.json: ${problems.join('; ')}`);
  return registry;
}
