import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import {
  computeHeroStats,
  manaPool,
  estimateCombat,
  compareItem,
  itemStatLines,
} from '../src/delve/hero-stats.js';
import {
  salvageValue,
  upgradeCost,
  applyUpgrade,
  reforgeCost,
  reforgeAffix,
  fuseCost,
  checkFusion,
  fuseItems,
} from '../src/loot/smithing.js';
import type { GearItem, StatRoll } from '../src/types/gear.js';

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();

function makeItem(partial: Partial<GearItem> & Pick<GearItem, 'slot' | 'baseId'>): GearItem {
  return {
    uid: 'test',
    rarity: 'common',
    mana: 'fire',
    ilvl: 1,
    name: 'Test',
    implicits: [],
    affixes: [],
    upgrade: 0,
    reforges: 0,
    locked: false,
    ...partial,
  };
}

const stat = (s: StatRoll['stat'], value: number): StatRoll => ({ stat: s, value, roll: 0.5 });

describe('computeHeroStats', () => {
  it('has base life and unarmed damage when naked', () => {
    const s = computeHeroStats({}, registry);
    expect(s.maxHp).toBe(bal.hero.baseHp);
    expect(s.weaponDamage).toBe(bal.hero.unarmedDamage);
    expect(s.attackInterval).toBe(bal.hero.unarmedInterval);
    expect(s.critChance).toBeCloseTo(bal.hero.baseCritChance / 100);
    expect(s.critMultiplier).toBeCloseTo(bal.hero.baseCritMultiplier / 100);
  });

  it('derives the basic attack from the weapon base and its mana', () => {
    const staff = makeItem({
      slot: 'weapon',
      baseId: 'staff',
      mana: 'frost',
      implicits: [stat('damage', 9)],
    });
    const s = computeHeroStats({ weapon: staff }, registry);
    expect(s.weapon.kind).toBe('bolt');
    expect(s.weapon.element).toBe('frost');
    expect(computeHeroStats({}, registry).weapon.element).toBeNull();
  });

  it('uses the weapon base interval and sums flat damage from every slot', () => {
    const weapon = makeItem({ slot: 'weapon', baseId: 'maul', implicits: [stat('damage', 20)] });
    const ring = makeItem({ slot: 'ring', baseId: 'ring', affixes: [stat('damage', 5)] });
    const s = computeHeroStats({ weapon, ring }, registry);
    expect(s.weaponDamage).toBe(25);
    expect(s.attackInterval).toBeCloseTo(registry.getGearBase('maul').attackInterval!);
  });

  it('attack speed shortens the interval but never below the floor', () => {
    const weapon = makeItem({
      slot: 'weapon',
      baseId: 'sword',
      implicits: [stat('damage', 7)],
      affixes: [stat('attackSpeedPct', 25)],
    });
    expect(computeHeroStats({ weapon }, registry).attackInterval).toBeCloseTo(
      registry.getGearBase('sword').attackInterval! / 1.25,
    );
    const silly = makeItem({
      slot: 'weapon',
      baseId: 'dagger',
      implicits: [stat('damage', 7)],
      affixes: [stat('attackSpeedPct', 900)],
    });
    expect(computeHeroStats({ weapon: silly }, registry).attackInterval).toBe(
      bal.hero.minAttackInterval,
    );
  });

  it('applies %life on top of flat life', () => {
    const chest = makeItem({
      slot: 'chest',
      baseId: 'cuirass',
      implicits: [stat('maxHp', 100)],
      affixes: [stat('hpPct', 10)],
    });
    expect(computeHeroStats({ chest }, registry).maxHp).toBeCloseTo((bal.hero.baseHp + 100) * 1.1);
  });

  it('caps crit and dodge', () => {
    const ring = makeItem({ slot: 'ring', baseId: 'ring', affixes: [stat('critChance', 500)] });
    const boots = makeItem({ slot: 'boots', baseId: 'greaves', affixes: [stat('dodge', 500)] });
    const s = computeHeroStats({ ring, boots }, registry);
    expect(s.critChance).toBeCloseTo(bal.hero.critCap / 100);
    expect(s.dodge).toBeCloseTo(bal.hero.dodgeCap / 100);
  });

  it('upgrade levels scale every stat on the item', () => {
    const helm = makeItem({
      slot: 'helm',
      baseId: 'helm',
      implicits: [stat('armor', 10)],
      upgrade: 5,
    });
    expect(computeHeroStats({ helm }, registry).armor).toBeCloseTo(
      10 * (1 + bal.forge.upgradeStep * 5),
    );
  });

  it('applies Glass Cannon and Bedrock and records legendary powers', () => {
    const amulet = makeItem({
      slot: 'amulet',
      baseId: 'amulet',
      rarity: 'legendary',
      legendary: { id: 'glass_cannon', value: 50, roll: 0.5 },
    });
    const chest = makeItem({
      slot: 'chest',
      baseId: 'cuirass',
      rarity: 'legendary',
      implicits: [stat('armor', 100)],
      legendary: { id: 'bedrock', value: 30, roll: 0.5 },
    });
    const s = computeHeroStats({ amulet, chest }, registry);
    expect(s.damageMult).toBeCloseTo(1.5);
    expect(s.maxHp).toBeCloseTo(bal.hero.baseHp * 0.8);
    expect(s.armor).toBeCloseTo(130);
    expect(s.legendaries).toEqual({ glass_cannon: 50, bedrock: 30 });
  });

  it('Lucky Charm adds magic find', () => {
    const ring = makeItem({
      slot: 'ring',
      baseId: 'ring',
      rarity: 'legendary',
      legendary: { id: 'lucky_charm', value: 60, roll: 0.5 },
    });
    expect(computeHeroStats({ ring }, registry).magicFind).toBe(60);
  });
});

describe('attunement & mana', () => {
  it('each item attunes its own mana by rarity, plus attunement affixes (never scaled by upgrades)', () => {
    const byRarity = bal.mana.attuneByRarity;
    const ring = makeItem({
      slot: 'ring',
      baseId: 'ring',
      mana: 'storm',
      rarity: 'rare',
      affixes: [stat('fireAttune', 2)],
      upgrade: 5,
    });
    const helm = makeItem({ slot: 'helm', baseId: 'helm', mana: 'storm' });
    const s = computeHeroStats({ ring, helm }, registry);
    expect(s.attunement.storm).toBe(byRarity.rare + byRarity.common);
    expect(s.attunement.fire).toBe(2);
    expect(s.attunement.frost).toBe(0);
  });

  it('Prism of Alloy adds to every attunement', () => {
    const amulet = makeItem({
      slot: 'amulet',
      baseId: 'amulet',
      mana: 'fire',
      rarity: 'legendary',
      legendary: { id: 'prism', value: 2, roll: 1 },
    });
    const s = computeHeroStats({ amulet }, registry);
    expect(s.attunement.frost).toBe(2);
    expect(s.attunement.fire).toBe(bal.mana.attuneByRarity.legendary + 2);
  });

  it('one mana pool grows with total attunement', () => {
    const one = computeHeroStats(
      { weapon: makeItem({ slot: 'weapon', baseId: 'sword', mana: 'fire' }) },
      registry,
    );
    const pool = manaPool(one, registry);
    expect(pool.max).toBeGreaterThan(0);
    const more = computeHeroStats(
      {
        weapon: makeItem({
          slot: 'weapon',
          baseId: 'sword',
          mana: 'fire',
          affixes: [stat('frostAttune', 2)],
        }),
      },
      registry,
    );
    expect(manaPool(more, registry).max).toBeGreaterThan(pool.max);
    expect(manaPool(more, registry).regen).toBeGreaterThan(pool.regen);
  });
});

describe('estimateCombat & compareItem', () => {
  it('reports the attunement an item would add', () => {
    const weapon = makeItem({ uid: 'w', slot: 'weapon', baseId: 'sword', mana: 'fire' });
    const frostRing = makeItem({ uid: 'r', slot: 'ring', baseId: 'ring', mana: 'frost' });
    expect(compareItem({ weapon }, frostRing, registry, 1).attunementDelta).toEqual({ frost: 1 });
  });

  it('attunement in an ability element raises Power', () => {
    const weapon = makeItem({
      uid: 'w',
      slot: 'weapon',
      baseId: 'sword',
      mana: 'fire',
      implicits: [stat('damage', 10)],
    });
    const fireRing = makeItem({
      uid: 'r',
      slot: 'ring',
      baseId: 'ring',
      mana: 'fire',
      affixes: [stat('fireAttune', 2)],
    });
    expect(compareItem({ weapon }, fireRing, registry, 1).dpsPct).toBeGreaterThan(0);
  });

  it('a stronger weapon raises DPS and power', () => {
    const weak = makeItem({
      uid: 'w1',
      slot: 'weapon',
      baseId: 'sword',
      implicits: [stat('damage', 7)],
    });
    const strong = makeItem({
      uid: 'w2',
      slot: 'weapon',
      baseId: 'sword',
      implicits: [stat('damage', 14)],
    });
    const cmp = compareItem({ weapon: weak }, strong, registry, 3);
    expect(cmp.replaced?.uid).toBe('w1');
    expect(cmp.dpsPct).toBeGreaterThan(0.5);
    expect(cmp.powerPct).toBeGreaterThan(0);
    expect(cmp.newPower).toBeGreaterThan(cmp.power);
  });

  it('armor raises toughness but not DPS', () => {
    const light = makeItem({
      uid: 'h1',
      slot: 'helm',
      baseId: 'helm',
      implicits: [stat('armor', 5)],
    });
    const heavy = makeItem({
      uid: 'h2',
      slot: 'helm',
      baseId: 'helm',
      implicits: [stat('armor', 30)],
    });
    const cmp = compareItem({ helm: light }, heavy, registry, 3);
    expect(cmp.ehpPct).toBeGreaterThan(0);
    expect(cmp.dpsPct).toBe(0);
  });

  it('power is positive and grows with gear', () => {
    const naked = estimateCombat(computeHeroStats({}, registry), registry, 1);
    const weapon = makeItem({ slot: 'weapon', baseId: 'sword', implicits: [stat('damage', 30)] });
    const armed = estimateCombat(computeHeroStats({ weapon }, registry), registry, 1);
    expect(naked.power).toBeGreaterThan(0);
    expect(armed.power).toBeGreaterThan(naked.power);
  });

  it('itemStatLines reports implicits then affixes with upgrade applied', () => {
    const item = makeItem({
      slot: 'helm',
      baseId: 'helm',
      implicits: [stat('armor', 10)],
      affixes: [stat('maxHp', 20)],
      upgrade: 2,
    });
    const lines = itemStatLines(item, registry);
    expect(lines.map((l) => l.source)).toEqual(['implicit', 'affix']);
    expect(lines[0].value).toBeCloseTo(10 * (1 + 2 * bal.forge.upgradeStep));
  });
});

describe('smithing', () => {
  const rare = generateItem(
    registry,
    { uid: 'r1', ilvl: 10, rarity: 'rare', slot: 'gloves' },
    new SeededRNG(1),
  );

  it('salvage value grows with rarity and item level', () => {
    const common = { ...rare, rarity: 'common' as const };
    expect(salvageValue(registry, rare)).toBeGreaterThan(salvageValue(registry, common));
    expect(salvageValue(registry, { ...rare, ilvl: 30 })).toBeGreaterThan(
      salvageValue(registry, rare),
    );
  });

  it('upgrade cost escalates and stops at the max level', () => {
    const c0 = upgradeCost(registry, rare)!;
    const c1 = upgradeCost(registry, applyUpgrade(registry, rare))!;
    expect(c1).toBeGreaterThan(c0);
    expect(upgradeCost(registry, { ...rare, upgrade: bal.forge.maxUpgrade })).toBeNull();
    expect(() => applyUpgrade(registry, { ...rare, upgrade: bal.forge.maxUpgrade })).toThrow();
  });

  it('reforge swaps exactly one affix for a different stat', () => {
    const out = reforgeAffix(registry, rare, 1, new SeededRNG(77));
    expect(out.affixes).toHaveLength(rare.affixes.length);
    expect(out.affixes[0]).toEqual(rare.affixes[0]);
    expect(out.affixes[2]).toEqual(rare.affixes[2]);
    const others = rare.affixes.map((a) => a.stat);
    expect(others).not.toContain(out.affixes[1].stat);
    expect(out.reforges).toBe(1);
    expect(reforgeCost(registry, out)).toBeGreaterThan(reforgeCost(registry, rare));
  });

  it('reforge is deterministic', () => {
    expect(reforgeAffix(registry, rare, 0, new SeededRNG(5))).toEqual(
      reforgeAffix(registry, rare, 0, new SeededRNG(5)),
    );
  });

  it('fusion needs three unlocked items of one non-legendary rarity', () => {
    const a = generateItem(registry, { uid: 'a', ilvl: 5, rarity: 'magic' }, new SeededRNG(1));
    const b = generateItem(registry, { uid: 'b', ilvl: 8, rarity: 'magic' }, new SeededRNG(2));
    const c = generateItem(registry, { uid: 'c', ilvl: 6, rarity: 'magic' }, new SeededRNG(3));
    expect(checkFusion([a, b]).ok).toBe(false);
    expect(checkFusion([a, b, { ...c, rarity: 'rare' }]).ok).toBe(false);
    expect(checkFusion([a, b, { ...c, locked: true }]).ok).toBe(false);
    const leg = { ...a, rarity: 'legendary' as const };
    expect(checkFusion([leg, { ...leg, uid: 'x' }, { ...leg, uid: 'y' }]).ok).toBe(false);
    expect(checkFusion([a, b, c]).ok).toBe(true);
  });

  it('fusion produces the next rarity at the highest item level, keeping the best upgrade', () => {
    const a = generateItem(registry, { uid: 'a', ilvl: 5, rarity: 'epic' }, new SeededRNG(1));
    const b = {
      ...generateItem(registry, { uid: 'b', ilvl: 9, rarity: 'epic' }, new SeededRNG(2)),
      upgrade: 3,
    };
    const c = generateItem(registry, { uid: 'c', ilvl: 7, rarity: 'epic' }, new SeededRNG(3));
    const out = fuseItems(registry, [a, b, c], 'new', new SeededRNG(4));
    expect(out.rarity).toBe('legendary');
    expect(out.ilvl).toBe(9);
    expect(out.upgrade).toBe(3);
    expect([a.slot, b.slot, c.slot]).toContain(out.slot);
    expect(out.legendary).toBeDefined();
    expect(fuseCost(registry, [a, b, c])).toBeGreaterThan(0);
  });
});
