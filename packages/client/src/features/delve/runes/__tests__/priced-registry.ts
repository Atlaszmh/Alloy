import type { DataRegistry } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';

/** The rows of the rune costs spec's load table these tests read, tiers I to V. */
const LOADS: Record<string, number[]> = {
  split: [0.27, 0.36, 0.45, 0.54, 0.63],
  pierce: [0.57, 0.76, 0.95, 1.14, 1.33],
  quick: [0.15, 0.2, 0.25, 0.3, 0.35],
  echo: [0.27, 0.36, 0.45, 0.54, 0.63],
  heavy: [0.33, 0.44, 0.55, 0.66, 0.77],
  linger: [0.57, 0.76, 0.95, 1.14, 1.33],
  leech: [0.12, 0.16, 0.2, 0.24, 0.28],
};

/**
 * The Delve registry with runes priced as the rune costs spec ships them (step 1 ships every
 * slot's factor at 0) and the loads above pinned, so tuning the data never moves these tests.
 * It edits the shared registry, which each test file has its own of: call it at the top of
 * the file, or in the one test that needs it.
 */
export function pricedRegistry(): DataRegistry {
  const registry = getDelveRegistry();
  Object.assign(registry.getDelveBalance().runes.load, {
    bySlot: { primary: 1, defensive: 1, ultimate: 1 },
    byForm: {},
    charge: 1,
    cast: 1,
    easePerAttune: 0.03,
    easeCap: 0.6,
  });
  for (const [id, load] of Object.entries(LOADS)) registry.getRune(id).load = load;
  return registry;
}
