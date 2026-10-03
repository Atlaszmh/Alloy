import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import { forgedMoveset } from '../src/loot/forge.js';
import { materialCount, shardTiersOf, withMaterial } from '../src/loot/materials.js';
import { applySalvage, salvageRng, salvageYield } from '../src/loot/salvage-yield.js';
import { salvageValue } from '../src/loot/smithing.js';
import { forge } from '../src/delve/crafting.js';
import { startDive } from '../src/delve/dive.js';
import {
  addLootToBag,
  createDelveProfile,
  salvageItems,
  setAutoSalvage,
} from '../src/delve/profile.js';
import type { ForgeRequest } from '../src/types/crafting.js';
import type { GearItem, HeroStatKey, Rarity, StatRoll } from '../src/types/gear.js';

// See the crafting spec: "Salvage (what gear gives back)".

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();
const C = bal.crafting;

/** A Fire hero: the sword's, the cuirass's and the dagger's patterns. */
const hero = () => createDelveProfile(registry, 3, { primary: 'fire' });
const line = (stat: HeroStatKey, roll: number): StatRoll => ({ stat, value: 1, roll });

/** Rare Fire gauntlets (an unknown pattern) with three lines: rolls 0.1, 0.6 and 0.95. */
const gloves = (over: Partial<GearItem> = {}): GearItem => ({
  ...generateItem(
    registry,
    { uid: 'x', ilvl: 5, rarity: 'rare', slot: 'gloves', baseId: 'gauntlets', mana: 'fire' },
    new SeededRNG(1),
  ),
  affixes: [line('armor', 0.1), line('critChance', 0.6), line('fireAttune', 0.95)],
  ...over,
});

/** Legendary Nightstalker gauntlets. */
const legendary = generateItem(
  registry,
  {
    uid: 'l',
    ilvl: 5,
    rarity: 'legendary',
    slot: 'gloves',
    baseId: 'gauntlets',
    mana: 'fire',
    legendaryId: 'nightstalker',
  },
  new SeededRNG(2),
);

/** An epic Fire sword as forged (two extra slots, one socket), Split I in its socket. */
function sword(): GearItem {
  const w = generateItem(
    registry,
    { uid: 'w', ilvl: 5, rarity: 'epic', slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(3),
  );
  const moveset = forgedMoveset(registry, w);
  moveset.chains.primary!.moves[0].runes = [{ id: 'split', tier: 1 }];
  return { ...w, moveset };
}

describe('salvageYield', () => {
  it('previews scrap, a shard a line at the tier its roll reaches, the pattern and the extra chance', () => {
    const g = gloves();
    expect(salvageYield(registry, hero(), g)).toEqual({
      scrap: salvageValue(registry, g),
      dust: 0,
      links: 0,
      // 0.1 → I, 0.6 → III; 0.95 would be V, but the Attune shards stop at II.
      shards: [
        { stat: 'armor', tier: 1 },
        { stat: 'critChance', tier: 3 },
        { stat: 'fireAttune', tier: 2 },
      ],
      extraShard: C.salvageExtraShard,
      pattern: 'gauntlets',
      essence: null,
      runes: [],
    });
    const tierAt = (roll: number) =>
      salvageYield(registry, hero(), gloves({ affixes: [line('armor', roll)] })).shards[0].tier;
    expect(C.salvageShardTier.map(tierAt)).toEqual([2, 3, 4, 5]);
    const one = salvageYield(registry, hero(), gloves({ affixes: [line('armor', 0.5)] }));
    expect(one.extraShard).toBe(0);
  });

  it("gives at most the tier whose band holds the roll, in the affix's own bands", () => {
    const tierOf = (stat: HeroStatKey, roll: number) =>
      salvageYield(registry, hero(), gloves({ affixes: [line(stat, roll)] })).shards[0].tier;
    // An Attune I shard rolls under 0.5: past the 0.3 threshold it is still I.
    expect([0.3, 0.49, 0.5, 1].map((r) => tierOf('fireAttune', r))).toEqual([1, 1, 2, 2]);
    // So an imprinted line never salvages above its shard's tier.
    for (const a of registry.getDelveData().affixes)
      for (const t of shardTiersOf(registry, a.stat))
        for (const r of [t.min, (t.min + t.max) / 2, t.max - 1e-9])
          expect(tierOf(a.stat, r), `${a.stat} ${t.tier} @${r}`).toBeLessThanOrEqual(t.tier);
  });

  it('gives no shard for a common, no pattern once known, and Mana Dust off the pair', () => {
    const known = { ...hero(), patterns: ['gauntlets'] };
    const common = gloves({ rarity: 'common', affixes: [] });
    expect(salvageYield(registry, known, common)).toMatchObject({
      shards: [],
      extraShard: 0,
      pattern: null,
    });
    expect(salvageYield(registry, hero(), gloves({ mana: 'frost' })).dust).toBe(
      bal.pair.salvageDust.rare,
    );
  });

  it("gives a legendary's essence instead of a shard", () => {
    expect(salvageYield(registry, hero(), legendary)).toMatchObject({
      shards: [],
      extraShard: 0,
      essence: 'nightstalker',
    });
  });

  it("lists a weapon's runes, and a Link for each slot and socket past its rarity's forged extras", () => {
    expect(salvageYield(registry, hero(), sword())).toMatchObject({
      links: 0,
      runes: [{ id: 'split', tier: 1 }],
      pattern: null,
    });
    const w = sword();
    const m = w.moveset!;
    m.slots.primary! += 1;
    m.chains.primary!.moves.push({ ...m.chains.primary!.moves[0], runes: [null, null] });
    expect(salvageYield(registry, hero(), w).links).toBe(3);
  });

  it('never pays back more Links or Mana Dust than forging it off the pair cost, at any rarity', () => {
    const p0 = hero();
    const refs = [
      { kind: 'metal' as const, metal: 'iron' as const },
      { kind: 'essence' as const, essence: 'pyroclasm' },
      ...(['uncommon', 'magic', 'rare', 'epic'] as const).map((grade) => ({
        kind: 'flux' as const,
        grade,
      })),
    ];
    const materials = refs.reduce((m, ref) => withMaterial(m, ref, 1), p0.materials);
    // Pyroclasm fits a sword and a helm.
    const p = { ...p0, materials, patterns: ['sword', 'helm'], scrap: 1e6, manaDust: 100 };
    for (const rarity of Object.keys(C.weaponExtras) as Rarity[])
      for (const baseId of ['sword', 'helm']) {
        const req: ForgeRequest = {
          baseId,
          metal: 'iron',
          element: 'frost',
          shards: [],
          ...(rarity !== 'common' && { flux: rarity === 'legendary' ? 'epic' : rarity }),
          ...(rarity === 'legendary' && { essence: 'pyroclasm' }),
        };
        const made = forge(registry, p, req);
        expect(made.item!.rarity).toBe(rarity);
        const back = applySalvage(registry, made.profile, made.item!, new SeededRNG(1)).profile;
        expect(back.links, `${rarity} ${baseId}`).toBeLessThanOrEqual(p.links);
        expect(back.manaDust, `${rarity} ${baseId}`).toBeLessThanOrEqual(p.manaDust);
      }
  });
});

describe('applySalvage', () => {
  it('at the Anvil: stocks one shard of its lines, sometimes two, and learns the pattern', () => {
    const p = hero();
    const g = gloves();
    const lines = salvageYield(registry, p, g).shards;
    const counts = [0, 0, 0];
    for (let seed = 1; seed <= 200; seed++) {
      const { shards } = applySalvage(registry, p, g, new SeededRNG(seed));
      counts[shards.length]++;
      for (const s of shards) expect(lines).toContainEqual(s);
      if (shards.length === 2) expect(shards[0].stat).not.toBe(shards[1].stat);
    }
    expect(counts[0]).toBe(0);
    expect(counts[2]).toBeGreaterThan(200 * C.salvageExtraShard * 0.5);
    expect(counts[2]).toBeLessThan(200 * C.salvageExtraShard * 1.5);

    const res = applySalvage(registry, p, g, new SeededRNG(1));
    expect(applySalvage(registry, p, g, new SeededRNG(1))).toEqual(res);
    const q = res.profile;
    expect(q.scrap).toBe(p.scrap + res.scrap);
    expect(q.stats.scrapEarned).toBe(p.stats.scrapEarned + res.scrap);
    for (const s of res.shards)
      expect(materialCount(q.materials, { kind: 'shard', ...s })).toBeGreaterThan(0);
    expect(res.pattern).toBe('gauntlets');
    expect(q.patterns).toEqual([...p.patterns, 'gauntlets']);
    expect(q.dive).toBeNull();
  });

  it('a legendary gives its essence', () => {
    const res = applySalvage(registry, hero(), legendary, new SeededRNG(1));
    expect(res).toMatchObject({ essence: 'nightstalker', shards: [] });
    expect(res.profile.materials.essences).toEqual({ nightstalker: 1 });
  });

  it('marks a salvaged essence seen, at the Anvil and mid-dive, once', () => {
    const anvil = applySalvage(registry, hero(), legendary, new SeededRNG(1)).profile;
    expect(anvil.essencesSeen).toEqual(['nightstalker']);
    const again = applySalvage(registry, anvil, legendary, new SeededRNG(1)).profile;
    expect(again.essencesSeen).toEqual(['nightstalker']);
    const mid = applySalvage(registry, startDive(registry, hero(), 1), legendary, new SeededRNG(1));
    expect(mid.profile.essencesSeen).toEqual(['nightstalker']);
  });

  it("mid-dive: the yield goes to the floor's haul; the pattern is learned at once", () => {
    const p = startDive(registry, hero(), 1);
    const res = applySalvage(registry, p, gloves({ mana: 'frost' }), new SeededRNG(1));
    expect(res.profile.scrap).toBe(p.scrap);
    expect(res.profile.manaDust).toBe(p.manaDust);
    expect(res.profile.materials).toEqual(p.materials);
    const haul = res.profile.dive!.haul;
    expect([haul.scrap, haul.dust]).toEqual([res.scrap, bal.pair.salvageDust.rare]);
    for (const s of res.shards)
      expect(materialCount(haul, { kind: 'shard', ...s })).toBeGreaterThan(0);
    expect(res.profile.patterns).toContain('gauntlets');
  });

  it("sends a weapon's runes by the parts rule, in the mode given", () => {
    const gone = applySalvage(registry, hero(), sword(), new SeededRNG(1));
    expect(gone).toMatchObject({ runes: [], destroyed: [{ id: 'split', tier: 1 }] });
    expect(gone.profile.runes).toEqual({});
    const paid = applySalvage(registry, hero(), sword(), new SeededRNG(1), { unsocket: 'pay' });
    expect(paid).toMatchObject({ runes: [{ id: 'split', tier: 1 }], destroyed: [] });
    expect(paid.profile.runes).toEqual({ split: [1, 0, 0, 0, 0] });
    expect(paid.profile.links).toBe(hero().links + paid.links);
  });
});

describe('salvageRng', () => {
  it('keys a salvage on the item: the dive seed mid-dive, the profile seed and forgeCount at the Anvil', () => {
    const p = { ...hero(), forgeCount: 7 };
    expect(salvageRng(p, gloves()).next()).toBe(new SeededRNG(p.seed).fork('salvage:7:x').next());
    const diving = startDive(registry, p, 1);
    expect(salvageRng(diving, gloves()).next()).toBe(
      new SeededRNG(diving.dive!.seed).fork('salvage:x').next(),
    );
  });
});

describe('every salvage goes through applySalvage', () => {
  it('salvageItems: each item on its own stream, then forgeCount moves on once', () => {
    const p = { ...hero(), bag: [gloves(), legendary] };
    const res = salvageItems(registry, p, ['x', 'l']);
    expect(res).toMatchObject({ count: 2, patterns: ['gauntlets'], essences: ['nightstalker'] });
    const one = applySalvage(registry, { ...p, bag: [] }, gloves(), salvageRng(p, gloves()));
    const two = applySalvage(registry, one.profile, legendary, salvageRng(p, legendary));
    expect(res.shards).toEqual(one.shards);
    expect(res.profile).toEqual({ ...two.profile, forgeCount: p.forgeCount + 1 });
  });

  it("addLootToBag: auto-salvage stocks it at the Anvil and fills the floor's haul mid-dive", () => {
    const p = setAutoSalvage(hero(), 'rare', true);
    const anvil = addLootToBag(registry, p, [gloves()]);
    expect(anvil).toMatchObject({ kept: [], patterns: ['gauntlets'] });
    expect(anvil.profile.scrap).toBe(p.scrap + anvil.scrap);
    expect(anvil.profile.forgeCount).toBe(p.forgeCount + 1);

    const diving = startDive(registry, p, 1);
    const mid = addLootToBag(registry, diving, [gloves()]);
    expect(mid.profile.scrap).toBe(diving.scrap);
    expect(mid.profile.dive!.haul.scrap).toBe(mid.scrap);
    expect(mid.profile.forgeCount).toBe(diving.forgeCount);
    expect(mid.shards).toEqual(
      applySalvage(registry, diving, gloves(), salvageRng(diving, gloves())).shards,
    );
  });

  it("a full bag mid-dive melts even a legendary: its essence goes to the floor's haul", () => {
    const diving = startDive(registry, hero(), 1);
    const full = { ...diving, bag: Array(bal.loot.bagSize).fill(gloves()) };
    const res = addLootToBag(registry, full, [legendary]);
    expect(res).toMatchObject({ bagFull: true, essences: ['nightstalker'] });
    expect(res.profile.dive!.haul.essences).toEqual({ nightstalker: 1 });
  });
});
