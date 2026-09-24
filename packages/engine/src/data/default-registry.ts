import { loadAndValidateData } from './loader.js';
import { DataRegistry } from './registry.js';

/** Build a registry with every bundled data file, including Delve data. */
export function createDefaultRegistry(): DataRegistry {
  const data = loadAndValidateData();
  return new DataRegistry(
    data.affixes,
    data.combinations,
    data.synergies,
    data.baseItems,
    data.balance,
    data.recipes,
    data.delve,
  );
}
