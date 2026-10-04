import { loadAndValidateData } from './loader.js';
import { questsDataProblems } from './quests-check.js';
import { DataRegistry } from './registry.js';
import { tutorialDataProblems } from './tutorial-check.js';
import { tutorialFloorProblems } from './tutorial-floor-schema.js';

/** Build a registry with every bundled data file, including Delve data. */
export function createDefaultRegistry(): DataRegistry {
  const registry = new DataRegistry(loadAndValidateData());
  // quests.json's references into the other files (see the quests spec).
  const problems = questsDataProblems(registry);
  if (problems.length > 0) throw new Error(`quests.json: ${problems.join('; ')}`);
  // tutorial.json's references into its floors and the other files (see the tutorial spec).
  const tutorial = [...tutorialDataProblems(registry), ...tutorialFloorProblems(registry)];
  if (tutorial.length > 0) throw new Error(`tutorial.json: ${tutorial.join('; ')}`);
  return registry;
}
