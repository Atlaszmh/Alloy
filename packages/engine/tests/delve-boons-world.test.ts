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

describe('exitRevealed (fog.ts)', () => {
  it("Cartographer: a generated floor starts with its exit's room revealed, on the minimap", () => {
    const plain = floor([], { layout: 'generated' });
    const exit = roomAt(plain.map, plain.map.exit.x, plain.map.exit.y)!;
    expect(exit.id).not.toBe(roomAt(plain.map, plain.map.start.x, plain.map.start.y)!.id);
    expect([exit.revealed, hudMapOf(plain).exit]).toEqual([false, null]);

    const w = floor([{ exitRevealed: true }], { layout: 'generated' });
    const room = roomAt(w.map, w.map.exit.x, w.map.exit.y)!;
    expect(room.revealed).toBe(true);
    expect(hudMapOf(w).exit).toEqual(w.map.exit);
    expect(w.fog[(room.rect.y + 1) * w.map.width + room.rect.x + 1]).toBe(1);
    expect(w.fogVersion).toBe(1);
  });

  it('a no-op on the open room', () => {
    expect(floor([{ exitRevealed: true }]).fogVersion).toBe(0);
  });
});

describe('magnet (step.ts)', () => {
  const scrapAt = (w: ArpgWorld, y: number): Drop => {
    const d: Drop = { id: w.nextId++, kind: 'scrap', x: 13, y, amount: 1, born: 0, vacuum: false, dead: false };
    w.drops.push(d);
    return d;
  };

  it("Wide Net: the magnet's reach × (1 + Σ magnet)", () => {
    const gap = bal.hero.magnetRadius * 1.25; // in reach at +40%, out of it without
    // A foe far up the room keeps it uncleared, so no vacuum pulls the drop.
    const plain = arena([dummy(13, 2)], { noBasic: true });
    const far = scrapAt(plain, plain.hero.y - gap);
    run(plain, 1);
    expect([far.dead, far.y]).toEqual([false, plain.hero.y - gap]);

    const w = wear(wear(arena([dummy(13, 2)], { noBasic: true }), { magnet: 0.2 }), { magnet: 0.2 });
    const near = scrapAt(w, w.hero.y - gap);
    run(w, 1);
    expect(near.dead).toBe(true);
  });
});

describe('interact.ts', () => {
  it("Deep Breath: a room's clear gives back Σ healOnClear × max life", () => {
    const clear = (w: ArpgWorld) => {
      w.hero.hp = w.hero.stats.maxHp / 2;
      killMonster(makeCtx(registry, w, []), w.monsters[0]);
      expect(w.map.rooms[1].cleared).toBe(true);
      return w.hero.hp;
    };
    const plain = clear(floorWorld(twoRooms('combat'), [dummy(16, 3, { roomId: 1 })]));
    const w = wear(floorWorld(twoRooms('combat'), [dummy(16, 3, { roomId: 1 })]), { healOnClear: 0.06 });
    expect(clear(w) - plain).toBeCloseTo(w.hero.stats.maxHp * 0.06, 6);
  });

  it("Sanctuary: a floor shrine's blessing goes on the dive's and the bank's; a refill stays a refill", () => {
    const w = wear(arena([]), { shrinesLastDive: true });
    applyShrine(registry, w, registry.getBoon('clarity')!);
    expect(w.hero.floorBuffs).toEqual([]);
    expect(w.hero.diveBuffs.map((b) => b.boon)).toEqual(['test', 'clarity']);
    expect(w.pending.diveBuffs.map((b) => b.boon)).toEqual(['clarity']);
    w.hero.potions = 0;
    applyShrine(registry, w, registry.getBoon('mercy')!);
    expect([w.hero.potions, w.hero.diveBuffs.length]).toEqual([bal.dive.maxPotions, 2]);

    const plain = arena([]);
    applyShrine(registry, plain, registry.getBoon('clarity')!);
    expect([plain.hero.floorBuffs.length, plain.hero.diveBuffs.length]).toEqual([1, 0]);
  });
});
