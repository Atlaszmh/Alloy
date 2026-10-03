import { describe, it, expect } from 'vitest';
import * as engine from '../src/index.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { closeDive, startDive } from '../src/delve/dive.js';
import { createDelveProfile, salvageItems } from '../src/delve/profile.js';

// The stage 4c contract (see the crafting spec's "Phases and parallel areas"):
// every export the areas fill in exists from the start. No test here calls a stub.

const registry = createDefaultRegistry();

describe('the crafting contract', () => {
  it('exports every new op from the engine', () => {
    for (const name of [
      // loot/materials.ts
      'metalAt',
      'shardTiersOf',
      'emptyMaterials',
      'emptyHaul',
      'addMaterials',
      'addHaul',
      'addMaterial',
      'stockHaul',
      'refineCost',
      // loot/forge.ts
      'previewForge',
      'forgeItem',
      'honeLine',
      'imprintLine',
      'honeCost',
      'imprintCost',
      // loot/salvage-yield.ts
      'salvageYield',
      'applySalvage',
      // delve/crafting.ts
      'forge',
      'hone',
      'imprint',
      'refine',
      'buyShard',
      // delve/dive.ts, delve/economy.ts, arpg/material-drops.ts
      'settleDive',
      'economySim',
      'dropMaterials',
    ])
      expect(typeof (engine as Record<string, unknown>)[name], name).toBe('function');
    expect(engine.METAL_IDS).toHaveLength(7);
    expect(engine.FLUX_GRADES).toEqual(['uncommon', 'magic', 'rare', 'epic']);
  });

  it('closes a dive with the registry: an ended one only clears the record', () => {
    const p = startDive(registry, createDelveProfile(registry, 4, { primary: 'fire' }), 1);
    const ended = { ...p, dive: { ...p.dive!, phase: 'dead' as const } };
    expect(closeDive(registry, ended)).toEqual({ ...ended, dive: null });
  });

  it('names what a salvage gave besides scrap, Dust and Links', () => {
    const p = createDelveProfile(registry, 4, { primary: 'fire' });
    expect(salvageItems(registry, p, [])).toMatchObject({ shards: [], patterns: [], essences: [] });
  });
});
