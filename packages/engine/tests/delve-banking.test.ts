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
  isDiveActive,
  settleDive,
  startDive,
} from '../src/delve/dive.js';
import { takeStop } from '../src/delve/stops.js';
import { botStep } from '../src/delve/autopilot.js';
import { createDelveProfile, setAutoSalvage } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { addHaul, addMaterial, addMaterials, emptyHaul } from '../src/loot/materials.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import type { MaterialRef } from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';
import { registry } from './fixtures/arena.js';
import { armed } from './fixtures/carries.js';
// See the crafting spec's "Banking and death".

const IRON: MaterialRef = { kind: 'metal', metal: 'iron' };
const EMBER: MaterialRef = { kind: 'essence', essence: 'pyroclasm' };
const SPLIT_I = { id: 'split', tier: 1 } as const;

const diving = (seed = 5): DelveProfile =>
  startDive(registry, createDelveProfile(registry, seed), 1);

/** Kill everything on the floor and pick up what it dropped. */
function clearFloor(world: ArpgWorld): void {
  const ctx = makeCtx(registry, world, []);
  for (const m of [...world.monsters]) hitMonster(ctx, m, 1e12, null, { source: 'skill' });
  // Walls stop the vacuum on a generated floor: the hero goes to each drop in turn.
  for (let i = 0; i < 150 && world.drops.length > 0; i++) {
    const drop = world.drops.find((d) => !d.dead);
    if (drop) Object.assign(world.hero, { x: drop.x, y: drop.y });
    stepWorld(registry, world, { move: { x: 0, y: 0 } }, 1 / 30);
  }
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

  it("mid-dive auto-salvage yields (scrap, a shard) go to the floor's haul, not the stockpile", () => {
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

describe('a replayed floor', () => {
  it("doesn't drop again the gear or patterns its foes gave this dive: clear, bank, restart × 4", () => {
    const boss = registry.getDelveBalance().drops.boss;
    const chance = boss.patternChance;
    boss.patternChance = 1;
    try {
      const start = diving(3);
      let p: DelveProfile = { ...start, dive: { ...start.dive!, depth: 5 } };
      const gear: number[] = [];
      const learned: number[] = [];
      for (let run = 0; run < 4; run++) {
        // Each run after the first: left for the Anvil mid-floor, the floor starts over.
        const world = beginFloor(registry, p);
        clearFloor(world);
        const res = bankWorld(registry, p, world);
        gear.push(res.kept.length + res.salvaged.length);
        learned.push(res.patterns.length);
        p = res.profile;
      }
      expect(gear[0]).toBeGreaterThan(0);
      expect(learned[0]).toBeGreaterThan(0);
      expect(gear.slice(1)).toEqual([0, 0, 0]);
      expect(learned.slice(1)).toEqual([0, 0, 0]);
      // The record is this depth's: the next depth's foes drop as ever.
      const world = beginFloor(registry, p);
      clearFloor(world);
      const done = completeFloor(registry, p, world).profile;
      const next = chooseDoor(registry, done, done.dive!.doorChoices[0]);
      expect(next.dive!.dropsGiven).toEqual([]);
      expect(beginFloor(registry, next).loot.dropsGiven).toEqual([]);
    } finally {
      boss.patternChance = chance;
    }
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

describe('a settled dive', () => {
  it('is over once an abandon settles it: not active, and no door, extract, stop or floor clear goes through', () => {
    const p = diving();
    const world = beginFloor(registry, p);
    clearFloor(world);
    const cleared = completeFloor(registry, p, world).profile;
    const stop = { offers: ['slot' as const], taken: false };
    const atStop = { ...cleared, dive: { ...cleared.dive!, stop } };
    const left = settleDive(registry, atStop, 'abandon');
    expect(isDiveActive(atStop)).toBe(true);
    expect(isDiveActive(left)).toBe(false);
    expect(() => extractDive(registry, left)).toThrow();
    expect(() => chooseDoor(registry, left, left.dive!.doorChoices[0])).toThrow();
    expect(takeStop(registry, left, { kind: 'slot', skill: 'primary' })).toMatchObject({
      ok: false,
    });

    const abandoned = settleDive(registry, p, 'abandon');
    expect(isDiveActive(abandoned)).toBe(false);
    const again = beginFloor(registry, p);
    clearFloor(again);
    expect(() => completeFloor(registry, abandoned, again)).toThrow();
  });
});

describe('the first boss, and when pickups bank', () => {
  it("the first boss's floor banks no essence: none drops below drops.essenceMinDepth", () => {
    const start = diving(3);
    const p = { ...start, dive: { ...start.dive!, depth: 5 } };
    const world = beginFloor(registry, p);
    clearFloor(world);
    const res = completeFloor(registry, p, world);
    expect(res.bossKilled).toBe(true);
    expect(res.profile.dive!.banked.essences).toEqual({});
    expect(res.profile.essencesSeen).toEqual([]);
  });

  /**
   * A floor the bot plays at `fps`, banked every frame or only as it ends: the profile after it.
   * Its sword is uncommon: it fights with the Primary.
   */
  function play(seed: number, depth: number, fps: number, everyFrame: boolean): DelveProfile {
    const start = armed(registry, diving(seed));
    let p: DelveProfile = { ...start, dive: { ...start.dive!, depth } };
    const world = beginFloor(registry, p);
    for (let i = 0; i < fps * 120 && !world.heroDead && !world.exited; i++) {
      p = botStep(registry, p, world, 1 / fps);
      if (everyFrame) p = bankWorld(registry, p, world).profile;
    }
    return world.exited
      ? completeFloor(registry, p, world).profile
      : failFloor(registry, p, world).profile;
  }

  it('when pickups bank never changes the outcome: every frame or only at the end, at 60 and 20 frames a second', () => {
    for (const [seed, depth] of [
      [64, 1], // taken to the exit, with two pieces of elites' gear
      [3, 5], // the first boss, which kills the starter hero: the floor's haul is lost
    ])
      for (const fps of [60, 20]) {
        const once = play(seed, depth, fps, false);
        expect(play(seed, depth, fps, true)).toEqual(once);
        const { phase, kills, banked, lost } = once.dive!;
        expect(kills).toBeGreaterThan(0);
        if (phase === 'dead') expect(lost!.scrap).toBeGreaterThan(0);
        else expect([banked.scrap, once.bag.length]).toEqual([expect.any(Number), 2]);
      }
  }, 20_000); // eight bot-played floors: slow under the whole suite's load
});

describe('the E2E dives', () => {
  it("seed 50's first floor, played by the bot, drops gear at any frame rate (delve.spec.ts D02 relies on it)", () => {
    const p = startDive(registry, createDelveProfile(registry, 50, { primary: 'fire' }), 1);
    for (const fps of [60, 45, 30, 20]) {
      const world = beginFloor(registry, p);
      const items: unknown[] = [];
      for (let i = 0, q = p; i < fps * 120 && !world.heroDead && !world.exited; i++) {
        q = botStep(registry, q, world, 1 / fps);
        items.push(...world.drops.filter((d) => d.kind === 'item' && !items.includes(d)));
      }
      expect(world.exited).toBe(true);
      expect(items.length).toBeGreaterThan(0);
    }
  });
});
