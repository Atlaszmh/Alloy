import { describe, it, expect } from 'vitest';
import { socketedGems } from '../../src/ai/strategies/forge-strategy.js';
import type { Loadout } from '../../src/types/item.js';

describe('socketedGems', () => {
  it('returns all gems socketed across weapon and armor in a flat list', () => {
    const loadout = {
      weapon: { itemId: 'sword', slots: [
        { gem: { uid: 'g1', affixId: 'crit_strike', tier: 1, rarity: 'common', recipeDepth: 0, combinable: true, tags: [] }, locked: false },
        null,
        { gem: { uid: 'g2', affixId: 'flame_aura', tier: 2, rarity: 'common', recipeDepth: 0, combinable: true, tags: [] }, locked: false },
        null, null, null,
      ], baseStats: { stat1: null, stat2: null } },
      armor: { itemId: 'chainmail', slots: [
        { gem: { uid: 'g3', affixId: 'fortify', tier: 1, rarity: 'common', recipeDepth: 0, combinable: true, tags: [] }, locked: false },
        null, null, null, null, null,
      ], baseStats: { stat1: null, stat2: null } },
    } as unknown as Loadout;

    const result = socketedGems(loadout);
    expect(result.map(g => g.uid).sort()).toEqual(['g1', 'g2', 'g3']);
  });
});
