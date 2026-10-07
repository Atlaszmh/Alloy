import { describe, it, expect } from 'vitest';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { hudMapOf, roomAt } from '../src/arpg/fog.js';
import { bindTerrain } from '../src/arpg/grid.js';
import { applyShrine, rollVault } from '../src/arpg/interact.js';
import {
  dropMaterials,
  rollMaterialDrops,
  type MaterialDropContext,
} from '../src/arpg/material-drops.js';
import { hitObject } from '../src/arpg/objects.js';
import { dropRune } from '../src/arpg/rune-drops.js';
import { groundSpeed } from '../src/arpg/terrain.js';
import { createFloorWorld, type FloorOptions } from '../src/arpg/world.js';
import { buffSum } from '../src/delve/boons.js';
import { chooseDoor, settleDive, startDive } from '../src/delve/dive.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { emptyHaul, metalAt } from '../src/loot/materials.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgWorld, Drop, HazardEntity } from '../src/types/arpg.js';
import type { BoonEffect, Buff } from '../src/types/boon.js';
import type { DelveProfile } from '../src/types/delve.js';
import { CELL } from '../src/types/floor-map.js';
import { arena, bal, chainsWith, dummy, gear, registry, run } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';
import { onMap } from './fixtures/maps.js';

// The boons spec's world, loot, dive and floor fields (§2), each at its one site. With no boon
// worn every site is as before (the fingerprint); these tests wear one.

const buff = (effect: BoonEffect, boon = 'test'): Buff => ({ boon, tier: 1, effect });

/** `w`'s hero wearing one more dive boon of `effect`, its combined view refreshed. */
function wear<W extends ArpgWorld>(w: W, effect: BoonEffect): W {
  w.hero.diveBuffs.push(buff(effect));
  w.hero.boon = buffSum([...w.hero.diveBuffs, ...w.hero.floorBuffs]);
  return w;
}

/** A floor at depth 3, seed 77 (the open room unless `o.layout` says), worn with `effects`. */
function floor(effects: BoonEffect[] = [], o: Partial<FloorOptions> = {}): ArpgWorld {
  return createFloorWorld(registry, {
    depth: 3,
    door: null,
    stats: computeHeroStats({ weapon: gear('fire'), chest: gear('earth', 'chest') }, registry),
    chains: chainsWith(),
    heroHpFrac: 1,
    potions: 3,
    phoenixAvailable: true,
    seed: 77,
    loot: { nextUid: 100, find: 0, legendaryBoost: 1, patterns: [], dropsGiven: [], pair: [] },
    diveBuffs: effects.map((e) => buff(e)),
    ...o,
  });
}

describe('the floor start (world.ts)', () => {
  it('Stone Skin: an Obsidian barrier of Σ barrierOnFloor × max life, lasting the floor', () => {
    const h = floor([{ barrierOnFloor: 0.08 }, { barrierOnFloor: 0.04 }]).hero;
    expect(h.barrier!.hp).toBeCloseTo(h.stats.maxHp * 0.12, 9);
    expect(h.barrier).toMatchObject({ max: h.barrier!.hp, until: Infinity });
    expect(floor().hero.barrier).toBeNull();
  });

  it('Famine: no potions at the floor start', () => {
    expect(floor([{ noPotions: true }]).hero.potions).toBe(0);
    expect(floor().hero.potions).toBe(3);
  });

  it('Hunted: every pack elite-led at eliteChance 1; a neutral entry spawns exactly as none', () => {
    const packs = new Map<number, string[]>();
    for (const m of floor([{ eliteChance: 1 }]).monsters)
      packs.set(m.packId, [...(packs.get(m.packId) ?? []), m.kind]);
    expect(packs.size).toBeGreaterThan(1);
    expect([...packs.values()].every((kinds) => kinds.includes('elite'))).toBe(true);
    expect(floor([{ eliteChance: 0 }]).monsters).toEqual(floor().monsters);
  });

  it("Magpie: the dive boons' Find is on the loot from the start", () => {
    expect(floor([{ find: 25 }, { find: 15 }]).loot.find).toBe(floor().loot.find + 40);
  });
});
