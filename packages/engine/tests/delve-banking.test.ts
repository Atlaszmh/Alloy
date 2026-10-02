import { describe, it, expect } from 'vitest';
import { hitMonster, makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import {
  bankWorld,
  beginFloor,
  chooseDoor,
  closeDive,
  completeFloor,
  extractDive,
  failFloor,
  settleDive,
  startDive,
} from '../src/delve/dive.js';
import { runAutopilot } from '../src/delve/autopilot.js';
import { createDelveProfile, setAutoSalvage } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { addHaul, addMaterial, addMaterials, emptyHaul } from '../src/loot/materials.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import type { MaterialRef } from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';
import { registry } from './fixtures/arena.js';
// See the crafting spec's "Banking and death".

const IRON: MaterialRef = { kind: 'metal', metal: 'iron' };
const EMBER: MaterialRef = { kind: 'essence', essence: 'pyroclasm' };
const SPLIT_I = { id: 'split', tier: 1 } as const;

const diving = (seed = 5): DelveProfile =>
  startDive(registry, createDelveProfile(registry, seed), 1);

/** Kill everything on the floor and let the loot vacuum in. */
function clearFloor(world: ArpgWorld): void {
  const ctx = makeCtx(registry, world, []);
  for (const m of [...world.monsters]) hitMonster(ctx, m, 1e12, null, { source: 'skill' });
  for (let i = 0; i < 150 && world.drops.length > 0; i++)
    stepWorld(registry, world, { move: { x: 0, y: 0 } }, 1 / 30);
}

describe('banking a floor', () => {
  it('bankWorld puts gear in the bag and every other pickup in the floor haul; patterns are learned and essences seen at once', () => {
    const p = diving();
    const world = beginFloor(registry, p);
    const sword = generateItem(registry, { uid: 'x1', ilvl: 2, rarity: 'magic' }, new SeededRNG(1));
    world.pending = {
      ...world.pending,
      items: [sword],
      scrap: 12,
      runes: [SPLIT_I],
      haul: addMaterial(addMaterial(emptyHaul(), IRON, 2), EMBER),
      patterns: ['axe', 'axe'],
    };
    const res = bankWorld(registry, p, world);
    expect(res.profile.bag.map((i) => i.uid)).toEqual(['x1']);
    const { scrap, runes, materials } = res.profile;
    expect({ scrap, runes, materials }).toEqual({
      scrap: p.scrap,
      runes: p.runes,
      materials: p.materials,
    });
    const { haul } = res.profile.dive!;
    expect(haul).toMatchObject({ scrap: 12, runes: { split: [1, 0, 0, 0, 0] } });
    expect(haul.metals.iron).toBe(2);
    expect(haul.essences).toEqual({ pyroclasm: 1 });
    expect(res.profile.patterns).toEqual([...p.patterns, 'axe']);
    expect(res.patterns).toEqual(['axe']);
    expect(res.profile.essencesSeen).toEqual(['pyroclasm']);
    // A second bank adds only what came since.
    world.pending.haul = addMaterial(emptyHaul(), IRON);
    expect(bankWorld(registry, res.profile, world).profile.dive!.haul.metals.iron).toBe(3);
  });

  it('a cleared floor banks its haul into the dive; the stockpile waits for the settle', () => {
    const p = diving();
    const world = beginFloor(registry, p);
    clearFloor(world);
    const mid = bankWorld(registry, p, world).profile;
    const { haul } = mid.dive!;
    expect(haul.scrap).toBeGreaterThan(0);
    const done = completeFloor(registry, mid, world).profile;
    expect(done.dive!.banked).toEqual(addHaul(p.dive!.banked, haul));
    expect(done.dive!.haul).toEqual(emptyHaul());
    expect(done.scrap).toBe(p.scrap);
    expect(done.stats.scrapEarned).toBe(p.stats.scrapEarned);
  });

  it('a floor replayed from its seed loses its unbanked haul instead of collecting it twice', () => {
    const p = diving();
    const first = beginFloor(registry, p);
    first.pending.haul = addMaterial(emptyHaul(), IRON);
    const once = bankWorld(registry, p, first).profile;
    expect(once.dive!.haul.metals.iron).toBe(1);
    // Left for the Anvil mid-floor: the floor starts over.
    const again = beginFloor(registry, once);
    again.pending.haul = addMaterial(emptyHaul(), IRON);
    expect(bankWorld(registry, once, again).profile.dive!.haul.metals.iron).toBe(1);
  });

  // ponytail: B2's applySalvage sends mid-dive salvage into the haul; the integrator un-skips this once B1 and B2 merge.
  it.skip("mid-dive auto-salvage yields (scrap, a shard) go to the floor's haul, not the stockpile", () => {
    const p = startDive(
      registry,
      setAutoSalvage(createDelveProfile(registry, 5), 'magic', true),
      1,
    );
    const world = beginFloor(registry, p);
    world.pending.items = [
      generateItem(registry, { uid: 'x2', ilvl: 2, rarity: 'magic' }, new SeededRNG(2)),
    ];
    const res = bankWorld(registry, p, world);
    expect(res.salvaged).toHaveLength(1);
    expect(res.profile.scrap).toBe(p.scrap);
    expect(res.profile.dive!.haul.scrap).toBeGreaterThan(0);
    expect(Object.keys(res.profile.dive!.haul.shards)).not.toEqual([]);
  });
});

describe('settling a dive', () => {
  const loss = registry.getDelveBalance().crafting.deathLoss;
  /** A haul with a bit of everything: bars, flux, shards, an essence, scrap, Mana Dust, Links and runes. */
  const BANKED = {
    ...emptyHaul(),
    metals: { ...emptyHaul().metals, iron: 10, rusty: 1 },
    flux: { ...emptyHaul().flux, magic: 3 },
    shards: { damage: [4, 1] },
    essences: { pyroclasm: 1 },
    scrap: 100,
    dust: 5,
    links: 2,
    runes: { split: [3, 0, 0, 0, 0] },
  };
  /** Diving, with `BANKED` banked and an iron bar and an essence in the floor's haul. */
  const holding = (seed = 5): DelveProfile => {
    const p = diving(seed);
    const haul = addMaterial(addMaterial(emptyHaul(), IRON), { kind: 'essence', essence: 'prism' });
    return { ...p, dive: { ...p.dive!, banked: BANKED, haul } };
  };

  it('an extract stocks everything banked, once; nothing is lost', () => {
    const p = holding();
    const out = settleDive(registry, p, 'extract');
    expect(out.scrap).toBe(p.scrap + 100);
    expect(out).toMatchObject({ manaDust: p.manaDust + 5, links: p.links + 2 });
    expect(out.materials).toEqual(addMaterials(p.materials, BANKED));
    expect(out.runes).toEqual({ split: [3, 0, 0, 0, 0] });
    expect(out.stats.scrapEarned).toBe(p.stats.scrapEarned + 100);
    expect(out.dive).toMatchObject({ settled: true, lost: null, banked: BANKED });
    expect(settleDive(registry, out, 'death')).toBe(out);
  });

  it("a death loses the floor's haul and deathLoss of each banked entry, rounded on the dive's seed; banked essences are exempt", () => {
    const p = holding();
    const out = settleDive(registry, p, 'death');
    const { banked: kept, lost } = out.dive!;
    expect(settleDive(registry, p, 'death')).toEqual(out);
    expect(kept.essences).toEqual({ pyroclasm: 1 });
    expect(lost!.essences).toEqual({ prism: 1 });
    const share = (n: number, k: number) => {
      expect(k === Math.floor(n * loss) || k === Math.ceil(n * loss)).toBe(true);
    };
    share(10, 10 - kept.metals.iron);
    expect(lost!.metals.iron).toBe(1 + 10 - kept.metals.iron); // the haul's bar and the share
    share(3, 3 - kept.flux.magic);
    share(4, 4 - kept.shards.damage![0]);
    share(100, 100 - kept.scrap);
    share(5, 5 - kept.dust);
    share(3, 3 - kept.runes.split[0]);
    expect(addHaul(kept, { ...lost!, essences: {} })).toEqual(
      addHaul(addMaterial(emptyHaul(), IRON), BANKED),
    );
    expect(out.scrap).toBe(p.scrap + kept.scrap);
    expect(out.dive).toMatchObject({ settled: true, haul: emptyHaul() });
    expect(settleDive(registry, out, 'extract')).toBe(out);
  });

  it('small stacks are still at risk: a lone banked bar is lost about deathLoss of the time', () => {
    let lostBars = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const p = diving(seed);
      const banked = addMaterial(emptyHaul(), IRON);
      const out = settleDive(registry, { ...p, dive: { ...p.dive!, banked } }, 'abandon');
      lostBars += out.dive!.lost!.metals.iron;
    }
    expect(lostBars / 400).toBeCloseTo(loss, 1);
  });

  it('failFloor settles a death, closeDive an abandon while the dive is under way, and nothing settles twice', () => {
    const p = holding();
    const world = beginFloor(registry, p);
    world.heroDead = true;
    const dead = failFloor(registry, p, world).profile;
    expect(dead.dive).toMatchObject({ phase: 'dead', settled: true });
    expect(dead).toEqual({ ...settleDive(registry, dead, 'death') });
    expect(closeDive(registry, dead)).toEqual({ ...dead, dive: null });

    const abandoned = closeDive(registry, p);
    expect(abandoned.dive).toBeNull();
    expect(abandoned.scrap).toBe(settleDive(registry, p, 'abandon').scrap);
    expect(abandoned.scrap).toBeLessThan(p.scrap + 100);

    const extracted = extractDive(registry, { ...p, dive: { ...p.dive!, phase: 'choosing' } });
    expect(extracted.scrap).toBe(p.scrap + p.dive!.bounty + 100);
    expect(closeDive(registry, extracted)).toEqual({ ...extracted, dive: null });
  });
});

describe('the first boss and a seeded dive', () => {
  it("the first boss's essence and epic flux bank with its floor, and count as given then", () => {
    const start = diving(3);
    const p = { ...start, dive: { ...start.dive!, depth: 5 } };
    const world = beginFloor(registry, p);
    expect(world.loot.firstEssence).toBe(true);
    clearFloor(world);
    const res = completeFloor(registry, p, world);
    const { banked } = res.profile.dive!;
    const [essence] = Object.keys(banked.essences);
    const slots = p.patterns.map((id) => registry.getGearBase(id).slot);
    expect(registry.getLegendary(essence).slots.some((s) => slots.includes(s))).toBe(true);
    expect(banked.flux.epic).toBe(1);
    expect(res.profile.essencesSeen).toEqual([essence]);
    expect(res.profile.firstEssenceGiven).toBe(true);
    const next = chooseDoor(registry, res.profile, res.profile.dive!.doorChoices[0]);
    expect(beginFloor(registry, next).loot.firstEssence).toBe(false);
  });

  it("a death before the first boss's floor banks grants its essence again", () => {
    const start = diving(3);
    const p = { ...start, dive: { ...start.dive!, depth: 5 } };
    const world = beginFloor(registry, p);
    clearFloor(world);
    world.heroDead = true;
    const dead = failFloor(registry, p, world).profile;
    expect(dead.dive!.lost!.flux.epic).toBe(1);
    expect(dead.firstEssenceGiven).toBe(false);
    const again = startDive(registry, closeDive(registry, dead), 1);
    expect(beginFloor(registry, again).loot.firstEssence).toBe(true);
  });

  it('a seeded dive plays out the same: its drops, haul, banking and settle', () => {
    const dives = () => runAutopilot(registry, { seed: 9, dives: 2 }).profile;
    const a = dives();
    expect(a).toEqual(dives());
    const bars = (p: DelveProfile) => Object.values(p.materials.metals).reduce((x, y) => x + y, 0);
    expect(bars(a)).toBeGreaterThan(bars(createDelveProfile(registry, 9)));
    expect(a.stats.dives).toBe(2);
  });
});
