import { describe, it, expect } from 'vitest';
import { defaultConfig, GameConfigSchema } from '../src/data/game-config.js';
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
});
