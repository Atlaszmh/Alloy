import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import {
  CraftingBalanceSchema,
  CraftingDataSchema,
  DropsBalanceSchema,
} from '../src/data/schemas.js';
import balanceData from '../src/data/balance.json';
import craftingData from '../src/data/crafting.json';
import delveData from '../src/data/delve.json';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { beginFloor, chooseDoor, completeFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { profileStats } from '../src/delve/pair.js';
import { GearItemSchema } from '../src/delve/profile-schema.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { materialName, scrapLevelFactor } from '../src/loot/item-generator.js';
import { metalAt, shardTiersOf } from '../src/loot/materials.js';
import { METAL_IDS } from '../src/types/crafting.js';
import { HERO_STAT_KEYS } from '../src/types/gear.js';
import { RARITY_ORDER } from '../src/types/gear.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import { arena } from './fixtures/arena.js';
import * as engine from '../src/index.js';

// See the crafting spec: "Tuning: every number in data".

const registry = createDefaultRegistry();
const data = registry.getCraftingData();

describe('crafting.json', () => {
  it('loads the seven metals, lowest first, their bands partitioning the item levels', () => {
    expect(data.metals.map((m) => m.id)).toEqual([...METAL_IDS]);
    expect(data.metals.map((m) => m.band)).toEqual([
      [1, 4],
      [5, 9],
      [10, 15],
      [16, 23],
      [24, 33],
      [34, 47],
      [48, null],
    ]);
    expect(data.flux.map((f) => f.grade)).toEqual(['uncommon', 'magic', 'rare', 'epic']);
    expect('materials' in delveData).toBe(false);
  });

  it('names an item after the metal whose band holds its level', () => {
    expect([0, 1, 4, 5, 15, 16, 47, 48, 200].map((ilvl) => metalAt(registry, ilvl).id)).toEqual([
      'rusty',
      'rusty',
      'rusty',
      'iron',
      'steel',
      'mithril',
      'starforged',
      'voidforged',
      'voidforged',
    ]);
    expect(materialName(registry, 12)).toBe('Steel');
    expect(materialName(registry, 48)).toBe('Voidforged');
  });

  it('gives every affix a family and five shard tiers, the Attune shards two', () => {
    expect(Object.keys(data.families).sort()).toEqual([...HERO_STAT_KEYS].sort());
    for (const a of registry.getDelveData().affixes) expect(data.families[a.stat]).toBeDefined();
    expect(shardTiersOf(registry, 'damage').map((t) => t.tier)).toEqual([1, 2, 3, 4, 5]);
    expect(shardTiersOf(registry, 'fireAttune')).toEqual([
      { tier: 1, min: 0, max: 0.5 },
      { tier: 2, min: 0.5, max: 1 },
    ]);
  });

  it("knows the starter kit: the sword's, the cuirass's and the dagger's patterns, 5 Rusty bars, 5 uncommon flux and 50 scrap", () => {
    expect(data.startingPatterns).toEqual(['sword', 'cuirass', 'dagger']);
    for (const id of data.startingPatterns) expect(registry.getGearBase(id).id).toBe(id);
    expect(data.startingMaterials).toEqual({
      metals: { rusty: 5 },
      flux: { uncommon: 5 },
      scrap: 50,
    });
  });
});

describe('CraftingDataSchema', () => {
  const ok = (over: object) => CraftingDataSchema.safeParse({ ...craftingData, ...over }).success;
  const metals = (bands: [number, number | null][]) =>
    craftingData.metals.map((m, i) => ({ ...m, band: bands[i] }));

  it('accepts the data', () => {
    expect(ok({})).toBe(true);
  });

  it('refuses metal bands that leave a gap, overlap, start above 1 or close the last', () => {
    const good: [number, number | null][] = [
      [1, 4],
      [5, 9],
      [10, 15],
      [16, 23],
      [24, 33],
      [34, 47],
      [48, null],
    ];
    expect(ok({ metals: metals(good) })).toBe(true);
    const at = (i: number, band: [number, number | null]) =>
      metals(good.map((b, j) => (j === i ? band : b)));
    expect(ok({ metals: at(1, [6, 9]) })).toBe(false); // a gap at 5
    expect(ok({ metals: at(1, [4, 9]) })).toBe(false); // 4 twice
    expect(ok({ metals: at(0, [2, 4]) })).toBe(false); // nothing at 1
    expect(ok({ metals: at(6, [48, 60]) })).toBe(false); // the last closed
    expect(ok({ metals: at(3, [16, 15]) })).toBe(false); // runs backwards
    expect(ok({ metals: [...craftingData.metals].reverse() })).toBe(false);
  });

  it('refuses a missing family, tiers out of order and a band that runs backwards', () => {
    const { damage: _d, ...families } = craftingData.families;
    expect(ok({ families })).toBe(false);
    const [one, two, ...rest] = craftingData.shardTiers;
    expect(ok({ shardTiers: [two, one, ...rest] })).toBe(false);
    expect(ok({ shardTiers: [{ tier: 1, min: 0.5, max: 0.2 }] })).toBe(false);
  });
});

describe('balance: delve.crafting and delve.drops', () => {
  const bal = registry.getDelveBalance();

  it("loads both blocks; a forged weapon's extras start at the low end of a drop's", () => {
    expect(bal.crafting.deathLoss).toBe(0.4);
    expect(bal.crafting.shardBench).toEqual({ scrap: 30, dust: 5 });
    for (const r of RARITY_ORDER)
      expect(bal.crafting.weaponExtras[r]).toEqual({
        slots: bal.movesets.extraSlots[r][0],
        sockets: bal.runes.socketDrops[r][0],
      });
    expect(bal.drops.scrapByKind).toEqual({ normal: 9, elite: 27, boss: 90 });
    expect([bal.drops.magnetSpeed, bal.drops.vacuumSpeed, bal.drops.pickupDelay]).toEqual([
      10, 18, 0.35,
    ]);
    for (const biome of registry.getDelveData().biomes)
      expect(bal.drops.biomeShardWeights[biome.id], biome.id).toBeDefined();
    for (const door of Object.keys(bal.drops.doors)) expect(registry.getDoor(door).id).toBe(door);
  });

  it('drops the old gear counts and pity from the data', () => {
    const loot = balanceData.delve.loot;
    for (const gone of [
      'pityPerDrop',
      'normalDropChance',
      'extraDropChance',
      'eliteDrops',
      'bossDrops',
    ])
      expect(gone in loot, gone).toBe(false);
  });

  it('refuses a count that runs backwards, thresholds that fall, a loss past 1 and tiers not from depth 1', () => {
    const crafting = balanceData.delve.crafting;
    const drops = balanceData.delve.drops;
    expect(CraftingBalanceSchema.safeParse(crafting).success).toBe(true);
    expect(DropsBalanceSchema.safeParse(drops).success).toBe(true);
    const craft = (over: object) =>
      CraftingBalanceSchema.safeParse({ ...crafting, ...over }).success;
    expect(craft({ deathLoss: 1.2 })).toBe(false);
    expect(craft({ salvageShardTier: [0.3, 0.2, 0.75, 0.9] })).toBe(false);
    const drop = (over: object) => DropsBalanceSchema.safeParse({ ...drops, ...over }).success;
    expect(drop({ normal: { ...drops.normal, bars: { chance: 0.5, count: [2, 1] } } })).toBe(false);
    expect(drop({ shardTierDepths: [2, 6, 12, 20, 30] })).toBe(false);
    expect(drop({ fluxGradeDepths: [1, 5, 11] })).toBe(false);
  });

  it("pays a kill's scrap by its kind from the data", () => {
    const w = arena([
      { x: 13, y: 20 },
      { x: 15, y: 20, kind: 'elite' },
    ]);
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    for (const m of w.monsters) killMonster(ctx, m);
    const each = bal.loot.scrapPerKill * scrapLevelFactor(registry, w.depth);
    const scrap = (kind: 'normal' | 'elite') =>
      Math.round(each * bal.drops.scrapByKind[kind] * (1 + w.hero.stats.scrapFind / 100));
    expect(events.flatMap((e) => (e.kind === 'death' ? [e.scrap] : []))).toEqual([
      scrap('normal'),
      scrap('elite'),
    ]);
  });
});

describe('Alloy Fusion is gone (refining flux replaces it)', () => {
  it('has no fuse op, check or price, and no `forge.fuseCost`', () => {
    for (const name of ['fuseGear', 'fuseItems', 'checkFusion', 'fuseCost'])
      expect(name in engine, name).toBe(false);
    expect('fuseCost' in balanceData.delve.forge).toBe(false);
  });
});

describe('doors: the drop multipliers and Find', () => {
  const mods = (id: string) => registry.getDoor(id).mods;

  it('trade magic find and the one drop multiplier for Find and one multiplier a drop', () => {
    for (const door of registry.getDelveData().doors) {
      expect('magicFind' in door.mods, door.id).toBe(false);
      expect('dropMult' in door.mods, door.id).toBe(false);
    }
    expect(mods('gilded')).toMatchObject({ find: 75, flux: 1.5, essence: 1.5 });
    // The Quiet Shrine: half the loot.
    expect(mods('shrine')).toMatchObject({ materials: 0.5, runes: 0.5 });
    expect(mods('swarm')).toMatchObject({ packs: 1.5, materials: 1.3 });
    expect(mods('cursed').shardTier).toBeGreaterThan(0);
  });

  it('call magic find "Find", and Lucky Charm doubles the essence odds', () => {
    expect(registry.getGearAffix('magicFind')!.label).toBe('Find');
    expect(registry.getLegendary('lucky_charm').text).toBe('+{v}% Find. Essence odds doubled.');
  });

  it("adds the door's Find to the hero's, and keeps the door the dive stored", () => {
    let p = startDive(registry, createDelveProfile(registry, 5, { primary: 'fire' }), 1);
    const world = beginFloor(registry, p);
    for (const m of world.monsters) killMonster(makeCtx(registry, world, []), m);
    p = completeFloor(registry, p, world).profile;
    p = { ...p, dive: { ...p.dive!, doorChoices: ['gilded'] } };
    p = chooseDoor(registry, p, 'gilded');
    const find = profileStats(registry, p).magicFind;
    expect(beginFloor(registry, p).loot.find).toBe(find + 75);
    const json = JSON.parse(JSON.stringify(p));
    expect(parseDelveProfile(registry, json)!.profile.dive!.door).toEqual(
      registry.getDoor('gilded'),
    );
  });
});

describe('items: hones and roll bands', () => {
  const item = generateItem(
    registry,
    { uid: 'r', ilvl: 6, rarity: 'rare', slot: 'ring' },
    new SeededRNG(3),
  );

  it('rolls with no hones and no bands (the rarity default)', () => {
    expect(item.hones).toBe(0);
    expect(item.affixes.every((a) => a.band === undefined)).toBe(true);
  });

  it("saves a line's band and the hones; an item saved before hones reads as none", () => {
    const banded = { ...item, hones: 2, affixes: [{ ...item.affixes[0], band: [0.4, 0.7] }] };
    expect(GearItemSchema.parse(banded)).toEqual(banded);
    const { hones: _h, ...old } = item;
    expect(GearItemSchema.parse(old).hones).toBe(0);
    const bad = { ...item, affixes: [{ ...item.affixes[0], band: [0.4, 1.2] }] };
    expect(GearItemSchema.safeParse(bad).success).toBe(false);
  });
});
