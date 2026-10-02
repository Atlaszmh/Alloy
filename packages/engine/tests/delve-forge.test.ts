import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem, rollAffix, rollBand, scrapLevelFactor } from '../src/loot/item-generator.js';
import { reforgeAffix } from '../src/loot/smithing.js';
import {
  forgeInputs,
  forgeItem,
  honeCost,
  honeLine,
  imprintCost,
  imprintLine,
  imprintRefusal,
  previewForge,
  rollFloor,
} from '../src/loot/forge.js';
import {
  emptyMaterials,
  materialCount,
  shardTiersOf,
  withMaterial,
} from '../src/loot/materials.js';
import { baseSlots } from '../src/loot/moveset.js';
import { socketsOf } from '../src/loot/runes.js';
import { forge, hone, imprint } from '../src/delve/crafting.js';
import { startDive } from '../src/delve/dive.js';
import { movesOf } from '../src/delve/moveset.js';
import { profileStats } from '../src/delve/pair.js';
import { createDelveProfile, reforgeGear } from '../src/delve/profile.js';
import { CHAIN_SKILLS } from '../src/types/ability.js';
import {
  FLUX_GRADES,
  METAL_IDS,
  type FluxGrade,
  type ForgeRequest,
  type MaterialRef,
  type MetalId,
} from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem } from '../src/types/gear.js';

// See the crafting spec: "The roll formula", "Forging an item", "The 'just right' sinks".

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();
const C = bal.crafting;

/** A Fire hero at the Anvil; `attune` more Fire attunement from a ring. */
function hero(attune = 0): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'fire' });
  if (!attune) return p;
  const ring = generateItem(
    registry,
    { uid: 'ring', ilvl: 1, rarity: 'common', slot: 'ring', mana: 'fire' },
    new SeededRNG(1),
  );
  const line = { stat: 'fireAttune' as const, value: attune, roll: 1 };
  return { ...p, equipped: { ...p.equipped, ring: { ...ring, affixes: [line] } } };
}

/** A rare pair of Fire gloves at item level 10. */
const gloves = (): GearItem =>
  generateItem(
    registry,
    { uid: 'r1', ilvl: 10, rarity: 'rare', slot: 'gloves', mana: 'fire' },
    new SeededRNG(1),
  );

describe('the roll formula', () => {
  it('lifts the whole draw within the band: u = floor + (1 − floor) × r', () => {
    const r = new SeededRNG(3).next();
    expect(rollBand([0.2, 0.5], 0, new SeededRNG(3))).toBeCloseTo(0.2 + 0.3 * r, 12);
    expect(rollBand([0.2, 0.5], 0.5, new SeededRNG(3))).toBeCloseTo(
      0.2 + 0.3 * (0.5 + 0.5 * r),
      12,
    );
    for (let seed = 1; seed <= 200; seed++) {
      const roll = rollBand([0.2, 0.5], 0.4, new SeededRNG(seed));
      expect(roll).toBeGreaterThanOrEqual(0.2 + 0.3 * 0.4);
      expect(roll).toBeLessThan(0.5);
    }
  });

  it("rolls an affix in a shard's band, kept on the line; else the rarity's, as drops always have", () => {
    const def = registry.getGearAffix('critChance')!;
    const shard = rollAffix(registry, def, 10, 'rare', new SeededRNG(4), {
      band: [0.6, 0.85],
      floor: 0.3,
    });
    expect(shard.band).toEqual([0.6, 0.85]);
    expect(shard.roll).toBeGreaterThanOrEqual(0.6 + 0.25 * 0.3);
    const plain = rollAffix(registry, def, 10, 'rare', new SeededRNG(4));
    const min = bal.loot.minRoll.rare;
    expect(plain.band).toBeUndefined();
    expect(plain.roll).toBe(min + (1 - min) * new SeededRNG(4).next());
  });
});

describe('the attunement floor', () => {
  it("is min(cap, perPoint × the hero's attunement) in the pair, 0 outside it", () => {
    const p = hero();
    const fire = profileStats(registry, p).attunement.fire;
    expect(fire).toBeGreaterThan(0);
    expect(rollFloor(registry, p, 'fire')).toBeCloseTo(C.attuneRoll.perPoint * fire, 12);
    expect(rollFloor(registry, p, 'frost')).toBe(0);
    expect(rollFloor(registry, hero(100), 'fire')).toBe(C.attuneRoll.cap);
  });

  it('counts every element before the choice', () => {
    const p = createDelveProfile(registry, 3);
    const earth = profileStats(registry, p).attunement.earth; // the starter chest
    expect(rollFloor(registry, p, 'earth')).toBeCloseTo(C.attuneRoll.perPoint * earth, 12);
  });
});

describe('Reforge', () => {
  it("clears the line's band and takes the floor", () => {
    const item = gloves();
    const banded = {
      ...item,
      affixes: item.affixes.map((a, i) =>
        i === 0 ? { ...a, band: [0.8, 1] as [number, number] } : a,
      ),
    };
    const min = bal.loot.minRoll.rare;
    for (let seed = 1; seed <= 50; seed++) {
      const out = reforgeAffix(registry, banded, 0, new SeededRNG(seed), 0.5);
      expect(out.affixes[0].band).toBeUndefined();
      expect(out.affixes[0].roll).toBeGreaterThanOrEqual(min + (1 - min) * 0.5);
    }
  });

  it("at the Anvil takes the hero's floor for the item's element", () => {
    const min = bal.loot.minRoll.rare;
    let p: DelveProfile = { ...hero(100), bag: [gloves()], scrap: 1e6 };
    for (let i = 0; i < 10; i++) {
      const res = reforgeGear(registry, p, 'r1', 1);
      expect(res.ok).toBe(true);
      expect(res.item!.affixes[1].roll).toBeGreaterThanOrEqual(min + (1 - min) * C.attuneRoll.cap);
      p = res.profile;
    }
  });
});

/** `hero(attune)` knowing every pattern, with five more of everything, at best depth `depth`. */
function smith(attune = 0, depth = 12): DelveProfile {
  const p = hero(attune);
  const data = registry.getDelveData();
  const refs: MaterialRef[] = [
    ...METAL_IDS.map((metal) => ({ kind: 'metal' as const, metal })),
    ...FLUX_GRADES.map((grade) => ({ kind: 'flux' as const, grade })),
    ...data.legendaries.map((l) => ({ kind: 'essence' as const, essence: l.id })),
    ...data.affixes.flatMap((a) =>
      shardTiersOf(registry, a.stat).map((t) => ({
        kind: 'shard' as const,
        stat: a.stat,
        tier: t.tier,
      })),
    ),
  ];
  const materials = refs.reduce((m, ref) => withMaterial(m, ref, 5), p.materials);
  const patterns = data.bases.map((b) => b.id);
  return { ...p, materials, patterns, scrap: 1e6, manaDust: 1e3, bestDepth: depth };
}

const FORGE_LOCKED = 'Forge at the Anvil, between dives';
const forgeStream = (p: DelveProfile) => new SeededRNG(p.seed).fork(`forge:${p.forgeCount}`);
const tier = (n: number): [number, number] => {
  const t = registry.getCraftingData().shardTiers[n - 1];
  return [t.min, t.max];
};

describe('previewForge', () => {
  const req = (over: Partial<ForgeRequest> = {}): ForgeRequest => ({
    baseId: 'helm',
    metal: 'steel',
    element: 'fire',
    shards: [],
    ...over,
  });

  it("sets the item level from the bar: the best depth, clamped to the metal's band", () => {
    const at = (metal: MetalId, depth: number) =>
      previewForge(registry, smith(0, depth), req({ metal })).ilvl;
    expect(at('rusty', 0)).toBe(1);
    expect(at('rusty', 12)).toBe(4);
    expect(at('steel', 3)).toBe(10);
    expect(at('steel', 12)).toBe(12);
    expect(at('voidforged', 12)).toBe(48);
    expect(at('voidforged', 60)).toBe(60);
  });

  it('takes its rarity from the flux; an essence with epic flux makes a legendary', () => {
    const p = smith();
    expect(previewForge(registry, p, req()).rarity).toBe('common');
    for (const flux of FLUX_GRADES)
      expect(previewForge(registry, p, req({ flux })).rarity).toBe(flux);
    const legendary = previewForge(registry, p, req({ flux: 'epic', essence: 'pyroclasm' }));
    expect(legendary.rarity).toBe('legendary');
    expect(legendary.legendary).toMatchObject({
      id: 'pyroclasm',
      band: [bal.loot.minRoll.legendary, 1],
    });
    expect(previewForge(registry, p, req({ flux: 'epic' })).legendary).toBeNull();
  });

  it("puts the shards' lines first, in their tier's band, and fills the rarity's lines at random", () => {
    const p = smith();
    const shards = [
      { stat: 'armor' as const, tier: 3 },
      { stat: 'fireAttune' as const, tier: 2 },
    ];
    const lines = previewForge(registry, p, req({ flux: 'rare', shards })).lines;
    expect(lines).toHaveLength(bal.loot.affixCount.rare);
    expect(lines[0]).toMatchObject({ shard: shards[0], band: tier(3) });
    expect(lines[0].range![0]).toBeLessThan(lines[0].range![1]);
    // The Attune shards have their own two tiers: II is the top half.
    expect(lines[1]).toEqual({ shard: shards[1], band: [0.5, 1], range: [2, 2] });
    expect(lines[2]).toEqual({ shard: null, band: [bal.loot.minRoll.rare, 1], range: null });
    expect(previewForge(registry, p, req()).lines).toEqual([]);
  });

  it('prices it at forgeScrap × the level factor, with Mana Dust outside the pair, and gives the floor', () => {
    const p = smith();
    const magic = previewForge(registry, p, req({ flux: 'magic' }));
    const scrap = Math.round(C.forgeScrap.magic * scrapLevelFactor(registry, 12));
    expect(magic.price).toEqual({ scrap, dust: 0 });
    expect(magic.floor).toBe(rollFloor(registry, p, 'fire'));
    const frost = previewForge(registry, p, req({ element: 'frost' }));
    expect(frost.price.dust).toBe(C.offPairDust);
    expect(frost.floor).toBe(0);
  });

  it("gives the implicits' ranges at the item level and rarity", () => {
    const prev = previewForge(registry, smith(), req({ flux: 'rare' }));
    const base = registry.getGearBase('helm');
    expect(prev.implicits.map((i) => i.stat)).toEqual(base.implicits.map((t) => t.stat));
    for (const i of prev.implicits) expect(i.min).toBeLessThan(i.max);
    expect(prev.weapon).toBeNull();
  });

  it("places a weapon's extras by S7: the Primary's slots first, sockets on its first moves", () => {
    const p = smith();
    const weapon = (flux?: FluxGrade) =>
      previewForge(registry, p, req({ baseId: 'sword', flux })).weapon;
    expect(weapon()).toEqual({
      carries: ['basic', 'primary'],
      slots: { basic: 0, primary: 0 },
      sockets: 0,
    });
    expect(weapon('rare')).toEqual({
      carries: ['basic', 'primary', 'defensive'],
      slots: { basic: 0, primary: C.weaponExtras.rare.slots, defensive: 0 },
      sockets: C.weaponExtras.rare.sockets,
    });
    expect(weapon('epic')).toEqual({
      carries: ['basic', 'primary', 'defensive', 'ultimate'],
      slots: { basic: 0, primary: C.weaponExtras.epic.slots, defensive: 0, ultimate: 0 },
      sockets: C.weaponExtras.epic.sockets,
    });
  });

  it('refuses with a code and a reason, never throwing', () => {
    const p = smith();
    const code = (q: DelveProfile, r: ForgeRequest) =>
      previewForge(registry, q, r).refused?.code ?? null;
    const armor = { stat: 'armor' as const, tier: 1 };
    expect(code(p, req())).toBeNull();
    expect(code(startDive(registry, p, 1), req())).toBe('locked');
    expect(code({ ...p, patterns: ['sword'] }, req())).toBe('pattern');
    expect(code(p, req({ flux: 'rare', essence: 'pyroclasm' }))).toBe('essence');
    expect(code(p, req({ flux: 'epic', essence: 'nope' }))).toBe('essence');
    expect(code(p, req({ flux: 'epic', essence: 'twin_fang' }))).toBe('essenceSlot'); // weapons and gloves
    expect(code(p, req({ flux: 'rare', shards: [{ stat: 'moveSpeed', tier: 1 }] }))).toBe(
      'shardSlot',
    );
    expect(code(p, req({ flux: 'rare', shards: [armor, { ...armor, tier: 2 }] }))).toBe(
      'shardDuplicate',
    );
    expect(code(p, req({ flux: 'uncommon', shards: [armor, { stat: 'maxHp', tier: 1 }] }))).toBe(
      'shardCount',
    );
    expect(code({ ...p, materials: emptyMaterials() }, req())).toBe('materials');
    expect(code(p, req({ flux: 'rare', shards: [{ stat: 'fireAttune', tier: 3 }] }))).toBe(
      'materials',
    );
    expect(code({ ...p, scrap: 0 }, req())).toBe('scrap');
    expect(code({ ...p, manaDust: 0 }, req({ element: 'frost' }))).toBe('dust');
    expect(code({ ...p, bag: Array(bal.loot.bagSize).fill(gloves()) }, req())).toBe('bagFull');
    const reason = (q: DelveProfile, r: ForgeRequest) =>
      previewForge(registry, q, r).refused!.reason;
    expect(reason({ ...p, scrap: 0 }, req())).toBe('Not enough scrap');
    expect(reason(p, req({ flux: 'epic', essence: 'twin_fang' }))).toBe(
      "Twin Fang doesn't fit this pattern",
    );
  });
});

/** A common helm, magic off-pair gauntlets, a rare sword, an epic ring and a legendary sword. */
const reqs: ForgeRequest[] = [
  { baseId: 'helm', metal: 'rusty', element: 'fire', shards: [] },
  {
    baseId: 'gauntlets',
    metal: 'steel',
    flux: 'magic',
    element: 'frost',
    shards: [{ stat: 'critChance', tier: 4 }],
  },
  {
    baseId: 'sword',
    metal: 'iron',
    flux: 'rare',
    element: 'fire',
    shards: [
      { stat: 'damage', tier: 5 },
      { stat: 'fireAttune', tier: 2 },
    ],
  },
  { baseId: 'ring', metal: 'mithril', flux: 'epic', element: 'fire', shards: [] },
  {
    baseId: 'sword',
    metal: 'steel',
    flux: 'epic',
    essence: 'pyroclasm',
    element: 'fire',
    shards: [{ stat: 'damagePct', tier: 1 }],
  },
];

describe('forgeItem', () => {
  it('makes exactly what the preview shows, but the draws', () => {
    const p = smith(20);
    for (const [i, r] of reqs.entries()) {
      const prev = previewForge(registry, p, r);
      expect(prev.refused).toBeNull();
      const item = forgeItem(registry, p, r, new SeededRNG(i + 1));
      expect(item).toMatchObject({
        uid: `g${p.nextUid}`,
        slot: prev.slot,
        baseId: r.baseId,
        rarity: prev.rarity,
        ilvl: prev.ilvl,
        mana: r.element,
        upgrade: 0,
        reforges: 0,
        hones: 0,
        locked: false,
      });
      expect(item.implicits.map((x) => x.stat)).toEqual(prev.implicits.map((x) => x.stat));
      item.implicits.forEach((x, j) => {
        expect(x.value).toBeGreaterThanOrEqual(prev.implicits[j].min);
        expect(x.value).toBeLessThanOrEqual(prev.implicits[j].max);
      });
      expect(item.affixes).toHaveLength(prev.lines.length);
      expect(new Set(item.affixes.map((a) => a.stat)).size).toBe(item.affixes.length);
      prev.lines.forEach((line, j) => {
        const a = item.affixes[j];
        const [lo, hi] = line.band;
        expect(a.roll).toBeGreaterThanOrEqual(lo + (hi - lo) * prev.floor);
        expect(a.roll).toBeLessThanOrEqual(hi);
        if (!line.shard) return expect(a.band).toBeUndefined();
        expect(a).toMatchObject({ stat: line.shard.stat, band: line.band });
        expect(a.value).toBeGreaterThanOrEqual(line.range![0]);
        expect(a.value).toBeLessThanOrEqual(line.range![1]);
      });
      if (prev.legendary) {
        const [lo] = prev.legendary.band;
        expect(item.legendary!.id).toBe(prev.legendary.id);
        expect(item.legendary!.roll).toBeGreaterThanOrEqual(lo + (1 - lo) * prev.floor);
        expect(item.name).toBe(registry.getLegendary(prev.legendary.id).name);
      } else expect(item.legendary).toBeUndefined();
      if (!prev.weapon) {
        expect(item.moveset).toBeUndefined();
        continue;
      }
      const m = item.moveset!;
      expect(Object.keys(m.chains).sort()).toEqual([...prev.weapon.carries].sort());
      for (const s of prev.weapon.carries)
        expect(m.slots[s]! - baseSlots(registry, r.baseId, s)).toBe(prev.weapon.slots[s]);
      const sockets = CHAIN_SKILLS.flatMap((s) => movesOf(m.chains[s])).flatMap(socketsOf);
      expect(sockets).toHaveLength(prev.weapon.sockets);
    }
  });

  it('rolls the same item from the same stream, named by its rarity, sockets on the Primary first', () => {
    const p = smith();
    expect(forgeItem(registry, p, reqs[2], new SeededRNG(9))).toEqual(
      forgeItem(registry, p, reqs[2], new SeededRNG(9)),
    );
    const helm = forgeItem(registry, p, reqs[0], new SeededRNG(1));
    expect(helm.name).toBe(`Rusty ${registry.getGearBase('helm').name}`);
    const primary = forgeItem(registry, p, reqs[4], new SeededRNG(1)).moveset!.chains.primary!;
    expect(primary.moves.map((m) => socketsOf(m).length)).toEqual([1, 1, 0, 0]);
  });

  it("previews each shard line's and the legendary's range as the floored draw's ends", () => {
    /** A stream whose every draw is `x` (nextInt its low end). */
    const fixed = (x: number) =>
      ({ next: () => x, nextInt: (lo: number) => lo }) as unknown as SeededRNG;
    for (const p of [smith(), smith(6)])
      for (const element of ['fire', 'frost'] as const) {
        const r = { ...reqs[4], element, shards: [{ stat: 'damagePct' as const, tier: 3 }] };
        const prev = previewForge(registry, p, r);
        expect(prev.floor > 0).toBe(element === 'fire');
        const lo = forgeItem(registry, p, r, fixed(0));
        const hi = forgeItem(registry, p, r, fixed(1)); // the limit r → 1
        expect([lo.affixes[0].value, hi.affixes[0].value]).toEqual(prev.lines[0].range);
        expect([lo.legendary!.value, hi.legendary!.value]).toEqual(prev.legendary!.range);
      }
  });

  it("random lines never roll another element's Power or Attunement; the item's own element's stay", () => {
    const p = smith(20);
    const req = reqs[3]; // a Fire ring at epic: four random lines
    const elemental = /^(fire|frost|storm|earth|shadow|nature)(Power|Attune)$/;
    const stats = Array.from({ length: 300 }, (_, i) =>
      forgeItem(registry, p, req, new SeededRNG(i + 1)).affixes.map((a) => a.stat),
    ).flat();
    const own = stats.filter((s) => elemental.test(s));
    expect(own.length).toBeGreaterThan(0);
    for (const s of own) expect(s.startsWith(req.element)).toBe(true);
  });

  it('throws where the preview refuses', () => {
    expect(() => forgeItem(registry, { ...smith(), scrap: 0 }, reqs[0], new SeededRNG(1))).toThrow(
      'Not enough scrap',
    );
  });
});

describe('forge: the profile op', () => {
  it('pays and consumes what it uses, bags the item and counts the find', () => {
    const p = smith();
    const r = reqs[4]; // the legendary sword
    const prev = previewForge(registry, p, r);
    const res = forge(registry, p, r);
    expect(res.ok).toBe(true);
    expect(res.item).toEqual(forgeItem(registry, p, r, forgeStream(p)));
    const q = res.profile;
    expect(q.bag).toEqual([...p.bag, res.item]);
    expect(q.scrap).toBe(p.scrap - prev.price.scrap);
    expect(q.manaDust).toBe(p.manaDust);
    expect([q.nextUid, q.forgeCount]).toEqual([p.nextUid + 1, p.forgeCount + 1]);
    for (const ref of forgeInputs(r))
      expect(materialCount(q.materials, ref)).toBe(materialCount(p.materials, ref) - 1);
    expect(q.stats.itemsFound.legendary).toBe(p.stats.itemsFound.legendary + 1);
    expect(q.codex.pyroclasm?.count).toBe(1);
  });

  it('charges Mana Dust outside the pair', () => {
    const p = smith();
    expect(forge(registry, p, reqs[1]).profile.manaDust).toBe(p.manaDust - C.offPairDust);
  });

  it('refuses with the reason, changing nothing', () => {
    const p = { ...smith(), scrap: 0 };
    expect(forge(registry, p, reqs[0])).toEqual({
      ok: false,
      profile: p,
      reason: 'Not enough scrap',
    });
    const diving = startDive(registry, smith(), 1);
    expect(forge(registry, diving, reqs[0])).toEqual({
      ok: false,
      profile: diving,
      reason: FORGE_LOCKED,
    });
  });
});

describe('Hone', () => {
  /** A rare Fire sword: Damage V and Fire Attunement II from shards, and one random line. */
  const sword = () =>
    forgeItem(
      registry,
      smith(),
      {
        baseId: 'sword',
        metal: 'iron',
        flux: 'rare',
        element: 'fire',
        shards: [
          { stat: 'damage', tier: 5 },
          { stat: 'fireAttune', tier: 2 },
        ],
      },
      new SeededRNG(3),
    );

  it('rerolls one line within its band, the floor applied, and counts the hone', () => {
    const item = sword();
    const [lo, hi] = item.affixes[0].band!;
    for (let seed = 1; seed <= 30; seed++) {
      const out = honeLine(registry, smith(100), item, 0, new SeededRNG(seed));
      expect(out.affixes[0]).toMatchObject({ stat: 'damage', band: [lo, hi] });
      expect(out.affixes[0].roll).toBeGreaterThanOrEqual(lo + (hi - lo) * C.attuneRoll.cap);
      expect(out.affixes.slice(1)).toEqual(item.affixes.slice(1));
      expect(out.hones).toBe(1);
    }
    expect(honeLine(registry, smith(), item, 2, new SeededRNG(1)).affixes[2].band).toBeUndefined();
    expect(() => honeLine(registry, smith(), item, 3, new SeededRNG(1))).toThrow();
  });

  it('costs honeScrap × the rarity × honeGrowth ^ hones × the level factor', () => {
    const item = gloves();
    const base = C.honeScrap * bal.forge.rarityCostMult.rare * scrapLevelFactor(registry, 10);
    expect(honeCost(registry, item)).toBe(Math.round(base));
    expect(honeCost(registry, { ...item, hones: 2 })).toBe(Math.round(base * C.honeGrowth ** 2));
  });

  it('at the Anvil: pays, draws on the forge stream, and refuses with a reason', () => {
    const p = { ...smith(), bag: [gloves()] };
    const res = hone(registry, p, 'r1', 1);
    expect(res.ok).toBe(true);
    expect(res.item).toEqual(honeLine(registry, p, gloves(), 1, forgeStream(p)));
    expect(res.profile.bag).toEqual([res.item]);
    expect(res.profile.scrap).toBe(p.scrap - honeCost(registry, gloves()));
    expect(res.profile.forgeCount).toBe(p.forgeCount + 1);
    expect(hone(registry, p, 'nope', 0).reason).toBe('Item not found');
    expect(hone(registry, p, 'r1', 9).reason).toBe('No such affix');
    expect(hone(registry, { ...p, scrap: 0 }, 'r1', 0).reason).toBe('Not enough scrap');
    expect(hone(registry, startDive(registry, p, 1), 'r1', 0).reason).toBe(FORGE_LOCKED);
  });
});

describe('Imprint', () => {
  const item = gloves();
  /** An affix gloves can roll that these gloves don't have. */
  const free = registry
    .getDelveData()
    .affixes.find(
      (a) => a.slots.includes('gloves') && !item.affixes.some((x) => x.stat === a.stat),
    )!.stat;
  const moveSpeed = registry.getGearAffix('moveSpeed')!.label;

  it("replaces a line with the shard's affix, rolled in its band with the floor", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const out = imprintLine(
        registry,
        smith(100),
        item,
        0,
        { stat: free, tier: 5 },
        new SeededRNG(seed),
      );
      const [lo, hi] = tier(5);
      expect(out.affixes[0]).toMatchObject({ stat: free, band: [lo, hi] });
      expect(out.affixes[0].roll).toBeGreaterThanOrEqual(lo + (hi - lo) * C.attuneRoll.cap);
      expect(out.affixes.slice(1)).toEqual(item.affixes.slice(1));
      expect([out.hones, out.reforges]).toEqual([item.hones, item.reforges]);
    }
  });

  it('refuses an affix on another line or not on the slot; its own line may take a better shard', () => {
    const taken = { stat: item.affixes[1].stat, tier: 1 };
    expect(imprintRefusal(registry, item, 0, taken)).toBe('Already on this item');
    expect(imprintRefusal(registry, item, 0, { stat: 'moveSpeed', tier: 1 })).toBe(
      `${moveSpeed} doesn't roll on this item`,
    );
    expect(imprintRefusal(registry, item, 1, taken)).toBeNull();
    expect(imprintRefusal(registry, item, 9, taken)).toBe('No such affix');
    expect(() => imprintLine(registry, smith(), item, 0, taken, new SeededRNG(1))).toThrow(
      'Already on this item',
    );
  });

  it('at the Anvil: takes the shard and scrap, and refuses with a reason', () => {
    const p = { ...smith(), bag: [item] };
    const shard = { stat: free, tier: 2 };
    const res = imprint(registry, p, 'r1', 0, shard);
    expect(res.ok).toBe(true);
    expect(res.item).toEqual(imprintLine(registry, p, item, 0, shard, forgeStream(p)));
    const ref = { kind: 'shard' as const, ...shard };
    expect(materialCount(res.profile.materials, ref)).toBe(materialCount(p.materials, ref) - 1);
    const cost = Math.round(C.imprintScrap.rare * scrapLevelFactor(registry, 10));
    expect(imprintCost(registry, item)).toBe(cost);
    expect(res.profile.scrap).toBe(p.scrap - cost);
    expect(res.profile.forgeCount).toBe(p.forgeCount + 1);
    const bare = { ...p, materials: emptyMaterials() };
    expect(imprint(registry, bare, 'r1', 0, shard).reason).toBe('Missing the shard');
    expect(imprint(registry, p, 'r1', 0, { stat: 'moveSpeed', tier: 1 }).reason).toBe(
      `${moveSpeed} doesn't roll on this item`,
    );
    expect(imprint(registry, { ...p, scrap: 0 }, 'r1', 0, shard).reason).toBe('Not enough scrap');
    expect(imprint(registry, startDive(registry, p, 1), 'r1', 0, shard).reason).toBe(FORGE_LOCKED);
  });
});
