import { vi } from 'vitest';
import {
  addMaterial,
  addMaterials,
  buyShard,
  emptyHaul,
  forge,
  generateItem,
  hone,
  honeCost,
  imprint,
  imprintCost,
  pairElements,
  previewForge,
  refine,
  refineCost,
  SeededRNG,
  shardTiersOf,
  type DataRegistry,
  type DelveProfile,
  type ForgePreview,
  type ForgeRequest,
  type MaterialRef,
  type ProfileActionResult,
  type Rarity,
} from '@alloy/engine';

/**
 * Stand-ins for the crafting ops stage 4c's B2 fills (`loot/forge.ts`,
 * `loot/materials.ts`' refineCost, `delve/crafting.ts`), for the Forge tab's
 * tests: a test file mocks those nine exports with `vi.fn()` (its `vi.mock`
 * of `@alloy/engine`) and calls `fakeCrafting()` before each test. Their
 * numbers are the tests' own.
 */

/** The scrap every fake forge and refine costs; a hone's base and an imprint's. */
export const FAKE = { forge: 30, refine: 10, hone: 15, imprint: 25, floor: 0.12 };

function rarityOf(req: ForgeRequest): Rarity {
  return req.flux === 'epic' && req.essence ? 'legendary' : (req.flux ?? 'common');
}

/** A preview from the request: the rarity's lines (the shards first), a 12% floor in the pair. */
export function fakePreview(
  registry: DataRegistry,
  profile: DelveProfile,
  req: ForgeRequest,
): ForgePreview {
  const base = registry.getGearBase(req.baseId);
  const rarity = rarityOf(req);
  const { affixCount, minRoll } = registry.getDelveBalance().loot;
  const count = affixCount[rarity];
  const inPair = pairElements(profile.pair).includes(req.element);
  return {
    baseId: base.id,
    slot: base.slot,
    rarity,
    ilvl: 3,
    element: req.element,
    floor: inPair ? FAKE.floor : 0,
    implicits: [{ stat: 'armor', min: 3, max: 5 }],
    lines: Array.from({ length: count }, (_, i) => {
      const shard = req.shards[i] ?? null;
      if (!shard) return { shard: null, band: [minRoll[rarity], 1], range: null };
      const t = shardTiersOf(registry, shard.stat)[shard.tier - 1];
      return { shard, band: [t.min, t.max], range: [2, 4] };
    }),
    legendary: req.essence && rarity === 'legendary' ? { id: req.essence, band: [0.4, 1] } : null,
    price: {
      scrap: FAKE.forge,
      dust: inPair ? 0 : registry.getDelveBalance().crafting.offPairDust,
    },
    weapon:
      base.slot === 'weapon'
        ? { carries: ['basic', 'primary'], slots: { primary: 1 }, sockets: 1 }
        : null,
    refused:
      profile.materials.metals[req.metal] < 1
        ? { code: 'materials', reason: 'You have no such bar' }
        : null,
  };
}

/** The forged item into the bag, its legendary in the Codex. */
export function fakeForge(
  registry: DataRegistry,
  profile: DelveProfile,
  req: ForgeRequest,
): ProfileActionResult {
  const rarity = rarityOf(req);
  const base = registry.getGearBase(req.baseId);
  const rolled = generateItem(
    registry,
    { uid: 'f1', ilvl: 3, rarity, slot: base.slot, mana: req.element, baseId: base.id },
    new SeededRNG(7),
  );
  const item = req.essence
    ? { ...rolled, legendary: { id: req.essence, value: 20, roll: 0.5 } }
    : rolled;
  const codex = req.essence
    ? {
        ...profile.codex,
        [req.essence]: { count: (profile.codex[req.essence]?.count ?? 0) + 1, bestRoll: 0.5 },
      }
    : profile.codex;
  return { ok: true, item, profile: { ...profile, bag: [...profile.bag, item], codex } };
}

/** 3 → 1 for 10 scrap, but at the top (Voidforged, epic flux, a shard's last tier) and for essences. */
export function fakeRefineCost(
  registry: DataRegistry,
  what: MaterialRef,
): { count: number; scrap: number } | null {
  const top =
    (what.kind === 'metal' && what.metal === 'voidforged') ||
    (what.kind === 'flux' && what.grade === 'epic') ||
    (what.kind === 'shard' && what.tier >= shardTiersOf(registry, what.stat).length) ||
    what.kind === 'essence' ||
    what.kind === 'dust' ||
    what.kind === 'links';
  return top ? null : { count: 3, scrap: FAKE.refine };
}

/** Install the fakes on the mocked engine exports. */
export function fakeCrafting(): void {
  vi.mocked(previewForge).mockImplementation(fakePreview);
  vi.mocked(forge).mockImplementation(fakeForge);
  vi.mocked(refineCost).mockImplementation(fakeRefineCost);
  vi.mocked(refine).mockImplementation((_r, profile) => ({
    ok: true,
    profile: { ...profile, scrap: profile.scrap - FAKE.refine },
  }));
  vi.mocked(buyShard).mockImplementation((_r, profile, stat) => ({
    ok: true,
    profile: {
      ...profile,
      materials: addMaterials(
        profile.materials,
        addMaterial(emptyHaul(), { kind: 'shard', stat, tier: 1 }),
      ),
    },
  }));
  vi.mocked(honeCost).mockImplementation((_r, item) => FAKE.hone * (item.hones + 1));
  vi.mocked(hone).mockImplementation((_r, profile) => ({ ok: true, profile }));
  vi.mocked(imprintCost).mockImplementation(() => FAKE.imprint);
  vi.mocked(imprint).mockImplementation((_r, profile) => ({ ok: true, profile }));
}
