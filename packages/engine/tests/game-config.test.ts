import { describe, it, expect } from 'vitest';
import { defaultConfig, mergeConfig, GameConfigSchema } from '../src/data/game-config.js';
import { loadAndValidateData } from '../src/data/loader.js';

describe('GameConfig', () => {
  it('defaultConfig passes Zod validation', () => {
    const config = defaultConfig();
    const result = GameConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('defaultConfig produces identical data to loadAndValidateData', () => {
    const config = defaultConfig();
    const loaded = loadAndValidateData();
    expect(config.affixes).toEqual(loaded.affixes);
    expect(config.combinations).toEqual(loaded.combinations);
    expect(config.synergies).toEqual(loaded.synergies);
    expect(config.baseItems).toEqual(loaded.baseItems);
    expect(config.balance).toEqual(loaded.balance);
  });

  it('mergeConfig replaces top-level fields and shallow-merges balance', () => {
    const base = defaultConfig();
    const merged = mergeConfig(base, {
      name: 'tweaked',
      balance: { baseHP: 999 },
    });
    // Top-level field replaced
    expect(merged.name).toBe('tweaked');
    // Balance field merged (baseHP overridden, others preserved)
    expect(merged.balance.baseHP).toBe(999);
    expect(merged.balance.fluxPerRound).toEqual(base.balance.fluxPerRound);
    expect(merged.balance.statCaps).toEqual(base.balance.statCaps);
    // Other top-level fields untouched
    expect(merged.affixes).toBe(base.affixes);
    expect(merged.version).toBe(base.version);
  });
});
