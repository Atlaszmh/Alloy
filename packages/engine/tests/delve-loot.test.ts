import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import {
  generateItem,
  rollRarity,
  rarityWeights,
  materialName,
  baseDisplayName,
} from '../src/loot/item-generator.js';
import { rollEncounterDrops } from '../src/loot/drops.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import { GEAR_SLOTS } from '../src/types/gear.js';
import type { Rarity } from '../src/types/gear.js';
import { MANA_TYPES } from '../src/types/mana.js';

const registry = createDefaultRegistry();

describe('Delve data', () => {
  it('loads delve data and balance', () => {
    expect(registry.hasDelve()).toBe(true);
    expect(registry.getDelveData().legendaries).toHaveLength(12);
    for (const slot of GEAR_SLOTS) {
      expect(registry.getGearBasesForSlot(slot).length).toBeGreaterThan(0);
      expect(registry.getDelveData().affixes.some((a) => a.slots.includes(slot))).toBe(true);
    }
  });

  it('every legendary slot has at least one legendary', () => {
    for (const slot of GEAR_SLOTS) {
      expect(registry.getDelveData().legendaries.some((l) => l.slots.includes(slot))).toBe(true);
    }
  });

  it('cycles biomes every 5 depths', () => {
    expect(registry.getBiomeForDepth(1).id).toBe('cinder_mines');
    expect(registry.getBiomeForDepth(5).id).toBe('cinder_mines');
    expect(registry.getBiomeForDepth(6).id).toBe('frostvault');
    const count = registry.getDelveData().biomes.length;
    expect(registry.getBiomeForDepth(1 + 5 * count).id).toBe('cinder_mines');
  });
});

describe('generateItem', () => {
  it('is deterministic for the same seed', () => {
    const a = generateItem(registry, { uid: 'x', ilvl: 7, rarity: 'rare' }, new SeededRNG(42));
    const b = generateItem(registry, { uid: 'x', ilvl: 7, rarity: 'rare' }, new SeededRNG(42));
    expect(a).toEqual(b);
  });

  it('rolls the affix count for its rarity with no duplicate stats, all legal for the slot', () => {
    const counts = registry.getDelveBalance().loot.affixCount;
    for (const rarity of RARITY_ORDER) {
      for (let i = 0; i < 40; i++) {
        const item = generateItem(
          registry,
          { uid: `u${i}`, ilvl: 10, rarity },
          new SeededRNG(i * 31 + 7),
        );
        expect(item.affixes).toHaveLength(counts[rarity]);
        const stats = item.affixes.map((a) => a.stat);
        expect(new Set(stats).size).toBe(stats.length);
        for (const affix of item.affixes) {
          expect(registry.getGearAffix(affix.stat)!.slots).toContain(item.slot);
          expect(affix.roll).toBeGreaterThanOrEqual(0);
          expect(affix.roll).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('respects the rarity minimum roll', () => {
    const minRoll = registry.getDelveBalance().loot.minRoll.epic;
    for (let i = 0; i < 30; i++) {
      const item = generateItem(registry, { uid: 'e', ilvl: 5, rarity: 'epic' }, new SeededRNG(i));
      for (const a of item.affixes) expect(a.roll).toBeGreaterThanOrEqual(minRoll);
    }
  });

  it('gives legendaries a slot-eligible power and names them after it', () => {
    for (let i = 0; i < 40; i++) {
      const item = generateItem(
        registry,
        { uid: 'l', ilvl: 5, rarity: 'legendary' },
        new SeededRNG(i),
      );
      expect(item.legendary).toBeDefined();
      const def = registry.getLegendary(item.legendary!.id);
      expect(def.slots).toContain(item.slot);
      expect(item.name).toBe(def.name);
      expect(item.legendary!.value).toBeGreaterThanOrEqual(def.min);
      expect(item.legendary!.value).toBeLessThanOrEqual(def.max);
    }
  });

  it('non-legendaries have no power', () => {
    const item = generateItem(registry, { uid: 'r', ilvl: 5, rarity: 'epic' }, new SeededRNG(3));
    expect(item.legendary).toBeUndefined();
  });

  it('honours a forced slot, base and legendary id', () => {
    const item = generateItem(
      registry,
      {
        uid: 'f',
        ilvl: 3,
        rarity: 'legendary',
        slot: 'weapon',
        baseId: 'maul',
        legendaryId: 'twin_fang',
      },
      new SeededRNG(9),
    );
    expect(item.slot).toBe('weapon');
    expect(item.baseId).toBe('maul');
    expect(item.legendary!.id).toBe('twin_fang');
  });

  it('scales flat implicits with item level', () => {
    const low = generateItem(
      registry,
      { uid: 'a', ilvl: 1, rarity: 'common', slot: 'weapon', baseId: 'sword' },
      new SeededRNG(5),
    );
    const high = generateItem(
      registry,
      { uid: 'b', ilvl: 20, rarity: 'common', slot: 'weapon', baseId: 'sword' },
      new SeededRNG(5),
    );
    const dmg = (i: typeof low) => i.implicits.find((s) => s.stat === 'damage')!.value;
    expect(dmg(high)).toBeGreaterThan(dmg(low) * 5);
  });

  it('names commons after material and base, and materials progress with ilvl', () => {
    const item = generateItem(
      registry,
      { uid: 'c', ilvl: 1, rarity: 'common', slot: 'helm' },
      new SeededRNG(1),
    );
    expect(item.name).toBe('Rusty Helm');
    expect(materialName(registry, 12)).toBe('Steel');
    expect(baseDisplayName(registry, { ...item, ilvl: 20 })).toBe('Mithril Helm');
  });

  it('gives rares a generated two-word name', () => {
    const item = generateItem(
      registry,
      { uid: 'r', ilvl: 4, rarity: 'rare', slot: 'ring' },
      new SeededRNG(11),
    );
    expect(item.name.split(' ')).toHaveLength(2);
    expect(item.name).not.toContain('Ring');
  });
});

describe('mana affinity', () => {
  it('every item carries a mana type, and forced mana is honoured', () => {
    for (let i = 0; i < 30; i++) {
      const item = generateItem(registry, { uid: 'm', ilvl: 3, rarity: 'magic' }, new SeededRNG(i));
      expect(MANA_TYPES).toContain(item.mana);
    }
    expect(
      generateItem(
        registry,
        { uid: 'm', ilvl: 3, rarity: 'rare', mana: 'shadow' },
        new SeededRNG(1),
      ).mana,
    ).toBe('shadow');
  });

  it('drops lean toward the biome element', () => {
    let frost = 0;
    for (let i = 0; i < 400; i++) {
      if (
        generateItem(
          registry,
          { uid: 'b', ilvl: 3, rarity: 'common', biomeMana: 'frost' },
          new SeededRNG(i),
        ).mana === 'frost'
      )
        frost++;
    }
    const bias = registry.getDelveBalance().loot.biomeManaBias;
    expect(frost / 400).toBeGreaterThan(bias + (1 - bias) / MANA_TYPES.length - 0.08);
  });

  it('attunement affixes exist for every mana type', () => {
    for (const m of MANA_TYPES) {
      expect(registry.getGearAffix(`${m}Attune` as never)).toBeDefined();
    }
  });
});

describe('rollRarity', () => {
  function distribution(luck: number, pity = 0, seed = 1, n = 20000): Record<Rarity, number> {
    const rng = new SeededRNG(seed);
    const out = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>;
    for (let i = 0; i < n; i++) out[rollRarity(registry, { luck, pity }, rng)]++;
    return out;
  }

  it('mostly drops commons with no luck', () => {
    const d = distribution(0);
    expect(d.common).toBeGreaterThan(d.uncommon);
    expect(d.uncommon).toBeGreaterThan(d.rare);
    expect(d.rare).toBeGreaterThan(d.legendary);
  });

  it('luck shifts drops toward higher rarities', () => {
    const base = distribution(0);
    const lucky = distribution(2);
    expect(lucky.legendary + lucky.epic).toBeGreaterThan((base.legendary + base.epic) * 2);
    expect(lucky.common).toBeLessThan(base.common);
  });

  it('pity raises legendary weight', () => {
    const w0 = rarityWeights(registry, { luck: 0, pity: 0 });
    const w1 = rarityWeights(registry, { luck: 0, pity: 200 });
    expect(w1.legendary).toBeGreaterThan(w0.legendary * 2);
    expect(w1.common).toBe(w0.common);
  });

  it('never rolls below minRarity', () => {
    const rng = new SeededRNG(3);
    for (let i = 0; i < 500; i++) {
      const r = rollRarity(registry, { luck: 0, pity: 0, minRarity: 'rare' }, rng);
      expect(RARITY_ORDER.indexOf(r)).toBeGreaterThanOrEqual(RARITY_ORDER.indexOf('rare'));
    }
  });
});

describe('rollEncounterDrops', () => {
  const base = {
    depth: 5,
    magicFind: 0,
    pity: 0,
    dropMult: 1,
    legendaryBoost: 1,
    forceLegendary: false,
    nextUid: 1,
  };

  it('bosses drop several items, the first at least rare, one item level higher', () => {
    for (let s = 0; s < 20; s++) {
      const res = rollEncounterDrops(registry, { ...base, kind: 'boss' }, new SeededRNG(s));
      const [min, max] = registry.getDelveBalance().loot.bossDrops;
      expect(res.items.length).toBeGreaterThanOrEqual(min);
      expect(res.items.length).toBeLessThanOrEqual(max);
      expect(RARITY_ORDER.indexOf(res.items[0].rarity)).toBeGreaterThanOrEqual(
        RARITY_ORDER.indexOf('rare'),
      );
      expect(res.items[0].ilvl).toBe(6);
    }
  });

  it('forceLegendary makes the first drop legendary and resets pity', () => {
    const res = rollEncounterDrops(
      registry,
      { ...base, kind: 'boss', forceLegendary: true, pity: 50 },
      new SeededRNG(1),
    );
    expect(res.items[0].rarity).toBe('legendary');
    expect(res.pity).toBeLessThan(50);
  });

  it('assigns sequential unique uids', () => {
    const res = rollEncounterDrops(
      registry,
      { ...base, kind: 'elite', nextUid: 10 },
      new SeededRNG(2),
    );
    const uids = res.items.map((i) => i.uid);
    expect(new Set(uids).size).toBe(uids.length);
    expect(res.nextUid).toBe(10 + uids.length);
  });

  it('normal monsters drop 0-2 items', () => {
    let total = 0;
    for (let s = 0; s < 200; s++) {
      const res = rollEncounterDrops(registry, { ...base, kind: 'normal' }, new SeededRNG(s));
      expect(res.items.length).toBeLessThanOrEqual(2);
      total += res.items.length;
    }
    const avg = total / 200;
    const loot = registry.getDelveBalance().loot;
    expect(avg).toBeGreaterThan((loot.normalDropChance + loot.extraDropChance) * 0.6);
    expect(avg).toBeLessThan((loot.normalDropChance + loot.extraDropChance) * 1.4);
  });
});
