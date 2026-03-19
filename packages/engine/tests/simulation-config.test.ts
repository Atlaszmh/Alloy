import { describe, it, expect } from 'vitest';
import { runSimulation } from '../src/balance/simulation-runner.js';
import { defaultConfig } from '../src/data/game-config.js';
import { DataRegistry } from '../src/data/registry.js';

describe('runSimulation with GameConfig', () => {
  it('accepts a GameConfig and produces MatchReport results', () => {
    const config = defaultConfig();
    const registry = new DataRegistry(
      config.affixes, config.combinations, config.synergies,
      config.baseItems, config.balance,
    );
    const result = runSimulation({
      matchCount: 5,
      aiTier1: 3,
      aiTier2: 3,
      seedStart: 100,
      mode: 'quick',
      baseWeaponId: 'sword',
      baseArmorId: 'chainmail',
    }, registry);

    expect(result.matches).toHaveLength(5);
    // Verify MatchReport fields are present
    expect(result.matches[0].players).toBeDefined();
    expect(result.matches[0].roundDetails).toBeDefined();
    expect(result.matches[0].source).toBe('simulation');
  });
});
