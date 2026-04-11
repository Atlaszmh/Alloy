import { describe, it, expect } from 'vitest';
import { runSimulation } from '../src/balance/simulation-runner.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);

describe('simulation with generic combines', () => {
  it('T3vT3 sim completes and reports generic upgrades', () => {
    const result = runSimulation({
      matchCount: 2,
      aiTier1: 3,
      aiTier2: 3,
      seedStart: 1,
      mode: 'ranked',
      baseWeaponId: 'sword',
      baseArmorId: 'chainmail',
    }, registry);

    expect(result.matches).toHaveLength(2);
    for (const match of result.matches) {
      expect(match.winner).not.toBeNull();
    }
    // Generic upgrades metric should be tracked (may be 0 if AI used all orbs on recipes)
    expect(result.aggregateStats.avgGenericUpgradesPerPlayer).toBeGreaterThanOrEqual(0);
  });
});
