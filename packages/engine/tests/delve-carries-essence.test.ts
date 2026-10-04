import { describe, it, expect } from 'vitest';
import { rollVault } from '../src/arpg/interact.js';
import { essenceAllowed } from '../src/arpg/material-drops.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { resolveReward } from '../src/delve/rewards.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { Reward } from '../src/types/quests.js';
import { bal, registry } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';

// See the tutorial spec's "Legendaries later": no essence from any source below
// drops.essenceMinDepth (20).

const MIN = bal.drops.essenceMinDepth;

describe('essenceAllowed', () => {
  it('is false below drops.essenceMinDepth (20) and true from it', () => {
    expect(MIN).toBe(20);
    expect([1, MIN - 1, MIN, MIN + 30].map((d) => essenceAllowed(registry, d))).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });
});

describe('the vault', () => {
  it('gives an essence only from drops.essenceMinDepth, whatever its chance', () => {
    const essences = (depth: number) => {
      const w = floorWorld(twoRooms('vault', { kind: 'chest' }, depth));
      w.depth = depth;
      w.loot = { ...w.loot, legendaryBoost: 1e6 };
      return rollVault(registry, w, new SeededRNG(1)).filter((h) => h.material.kind === 'essence');
    };
    expect(essences(MIN - 1)).toEqual([]);
    expect(essences(MIN)).toHaveLength(1);
  });
});

describe('an essence reward', () => {
  const at = (bestDepth: number, reward: Reward) => {
    const p = { ...createDelveProfile(registry, 11, { primary: 'fire' }), bestDepth };
    return resolveReward(registry, p, reward, new SeededRNG(1)).granted;
  };

  it('comes as that many epic flux below drops.essenceMinDepth (the best depth), an essence from it', () => {
    for (const reward of [
      { kind: 'essence', id: 'fit', count: 1 },
      { kind: 'essence', id: 'pyroclasm', count: 2 },
    ] as Reward[]) {
      expect(at(MIN - 1, reward)).toEqual({
        ref: { kind: 'flux', grade: 'epic' },
        count: reward.count,
      });
      expect(at(MIN, reward).ref.kind).toBe('essence');
    }
  });
});
