import { describe, it, expect } from 'vitest';
import {
  rollMaterialDrops,
  type MaterialDropContext,
  type MaterialDrops,
} from '../src/arpg/material-drops.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { FLUX_GRADES, type MaterialRef } from '../src/types/crafting.js';
import type { DoorMods } from '../src/types/delve.js';
import { bal, registry } from './fixtures/arena.js';

const drops = bal.drops;
const BASE: MaterialDropContext = {
  depth: 1,
  kind: 'normal',
  biomeId: 'cinder_mines',
  biomeMana: 'fire',
  door: null,
  find: 0,
  legendaryBoost: 1,
  firstEssence: false,
  patterns: ['sword', 'cuirass', 'dagger'],
};
const N = 4000;

/** `n` foes' rolls, seeds 0 to n − 1. */
function roll(over: Partial<MaterialDropContext>, n = N): MaterialDrops[] {
  return Array.from({ length: n }, (_, s) =>
    rollMaterialDrops(registry, { ...BASE, ...over }, new SeededRNG(s)),
  );
}
const door = (mods: DoorMods) => ({ ...registry.getDoor('winding'), mods });
const all = (rolls: MaterialDrops[]) => rolls.flatMap((r) => r.materials);
const of = <K extends MaterialRef['kind']>(rolls: MaterialDrops[], kind: K) =>
  all(rolls).filter((m) => m.material.kind === kind) as {
    material: Extract<MaterialRef, { kind: K }>;
    amount: number;
  }[];
/** The share of foes that dropped any `kind`. */
const rate = (rolls: MaterialDrops[], kind: MaterialRef['kind']) =>
  rolls.filter((r) => r.materials.some((m) => m.material.kind === kind)).length / rolls.length;

describe('material drop tables', () => {
  it('a normal foe drops bars, Mana Dust, shards and Links at its chances; never flux, essences or patterns', () => {
    const rolls = roll({});
    expect(rate(rolls, 'metal')).toBeCloseTo(drops.normal.bars.chance, 1);
    expect(rate(rolls, 'dust')).toBeCloseTo(drops.normal.dust.chance, 1);
    expect(rate(rolls, 'shard')).toBeCloseTo(drops.normal.shards.chance, 1);
    expect(rate(rolls, 'links')).toBeLessThan(0.03);
    expect(of(rolls, 'flux')).toEqual([]);
    expect(of(rolls, 'essence')).toEqual([]);
    expect(rolls.every((r) => r.pattern === null)).toBe(true);
  });

  it('counts are uniform in the entry: bars and shards one pickup each, Dust and Links one pickup of the count', () => {
    const rolls = roll({ kind: 'elite' });
    for (const r of rolls) {
      const bars = r.materials.filter((m) => m.material.kind === 'metal');
      expect(bars.length).toBeLessThanOrEqual(drops.elite.bars.count[1]);
      expect(bars.every((m) => m.amount === 1)).toBe(true);
      const dust = r.materials.filter((m) => m.material.kind === 'dust');
      expect(dust.length).toBeLessThanOrEqual(1);
      for (const d of dust) {
        expect(d.amount).toBeGreaterThanOrEqual(drops.elite.dust.count[0]);
        expect(d.amount).toBeLessThanOrEqual(drops.elite.dust.count[1]);
      }
    }
    expect(rate(rolls, 'flux')).toBeCloseTo(drops.elite.flux.chance, 1);
  });

  it('a boss always drops flux and shards, and an essence at its chance × Lucky Charm × the door', () => {
    const rolls = roll({ kind: 'boss' });
    expect(rate(rolls, 'flux')).toBe(1);
    expect(rate(rolls, 'shard')).toBe(1);
    expect(rate(rolls, 'essence')).toBeCloseTo(drops.boss.essenceChance, 1);
    expect(rate(roll({ kind: 'boss', legendaryBoost: 2 }), 'essence')).toBeCloseTo(
      drops.boss.essenceChance * 2,
      1,
    );
    expect(rate(roll({ kind: 'boss', door: door({ essence: 1.5 }) }), 'essence')).toBeCloseTo(
      drops.boss.essenceChance * 1.5,
      1,
    );
    const ids = new Set(of(rolls, 'essence').map((m) => m.material.essence));
    expect(ids.size).toBeGreaterThan(3);
    for (const id of ids) expect(registry.getLegendary(id)).toBeDefined();
  });

  it("the first boss's guarantee: an essence whose legendary fits a known pattern's slot, and an epic flux", () => {
    const known = ['ring'];
    for (const r of roll({ kind: 'boss', firstEssence: true, patterns: known }, 50)) {
      const [essence] = of([r], 'essence');
      expect(registry.getLegendary(essence.material.essence).slots).toContain('ring');
      expect(of([r], 'flux').some((m) => m.material.grade === 'epic')).toBe(true);
    }
  });

  it('elites and bosses drop a pattern the hero does not know, at their chance; none once every one is known', () => {
    const rolls = roll({ kind: 'elite' });
    const patterns = rolls.flatMap((r) => (r.pattern ? [r.pattern] : []));
    expect(patterns.length / N).toBeCloseTo(drops.elite.patternChance, 1);
    for (const id of patterns) expect(BASE.patterns).not.toContain(id);
    const every = registry.getDelveData().bases.map((b) => b.id);
    expect(roll({ kind: 'boss', patterns: every }, 200).every((r) => r.pattern === null)).toBe(
      true,
    );
  });
});

describe('doors, depth and Find', () => {
  it("the door's materials multiply every entry's chance, at most 1 (the Shrine halves, the Swarm adds 30%)", () => {
    expect(rate(roll({ door: door({ materials: 0.5 }) }), 'metal')).toBeCloseTo(
      drops.normal.bars.chance * 0.5,
      1,
    );
    expect(rate(roll({ door: door({ materials: 1.3 }) }), 'metal')).toBeCloseTo(
      drops.normal.bars.chance * 1.3,
      1,
    );
    expect(rate(roll({ door: door({ materials: 20 }) }, 200), 'metal')).toBe(1);
    expect(rate(roll({ kind: 'elite', door: door({ flux: 1.5 }) }), 'flux')).toBeCloseTo(
      drops.elite.flux.chance * 1.5,
      1,
    );
  });

  it("a bar is the floor's metal, the next one up at metalUpChance", () => {
    const bars = of(roll({ door: door({ materials: 20 }) }), 'metal').map((m) => m.material.metal);
    const up = bars.filter((m) => m === 'iron').length / bars.length;
    expect(bars.every((m) => m === 'rusty' || m === 'iron')).toBe(true);
    expect(up).toBeCloseTo(drops.metalUpChance, 1);
    const deep = of(roll({ depth: 12, door: door({ materials: 20 }) }, 200), 'metal');
    expect(new Set(deep.map((m) => m.material.metal))).toEqual(new Set(['steel', 'mithril']));
  });

  it('shard tiers and flux grades come by depth, the lower ones likelier', () => {
    const shallow = roll({ kind: 'boss' });
    expect(of(shallow, 'shard').every((m) => m.material.tier === 1)).toBe(true);
    expect(of(shallow, 'flux').every((m) => m.material.grade === 'uncommon')).toBe(true);
    const deep = roll({ kind: 'boss', depth: 30 });
    const tiers = of(deep, 'shard').map((m) => m.material.tier);
    expect(new Set(tiers)).toEqual(new Set([1, 2, 3, 4, 5]));
    const count = (t: number) => tiers.filter((x) => x === t).length;
    expect(count(1)).toBeGreaterThan(count(2));
    expect(count(2)).toBeGreaterThan(count(3));
    const grades = of(deep, 'flux').map((m) => m.material.grade);
    expect(new Set(grades)).toEqual(new Set(FLUX_GRADES));
  });

  it("Find and the door's shardTier bring a shard or flux one tier up, never past the affix's last", () => {
    const tierUp = (rolls: MaterialDrops[]) => {
      const shards = of(rolls, 'shard');
      return shards.filter((m) => m.material.tier === 2).length / shards.length;
    };
    expect(tierUp(roll({ kind: 'boss' }))).toBe(0);
    const cap = drops.find.cap;
    const find = (cap / drops.find.perPoint) * 100;
    expect(tierUp(roll({ kind: 'boss', find }))).toBeCloseTo(cap, 1);
    expect(tierUp(roll({ kind: 'boss', door: door({ shardTier: 0.35 }) }))).toBeCloseTo(0.35, 1);
    // Both: one tier up at 1 − (1 − Find's) × (1 − the door's), never two.
    const both = roll({ kind: 'boss', find, door: door({ shardTier: 0.35 }) });
    expect(tierUp(both)).toBeCloseTo(1 - (1 - cap) * 0.65, 1);
    expect(of(both, 'shard').every((m) => m.material.tier <= 2)).toBe(true);
    const flux = of(roll({ kind: 'boss', door: door({ shardTier: 1 }) }, 200), 'flux');
    expect(flux.every((m) => m.material.grade === 'magic')).toBe(true);
    // An Attune shard has two tiers: at depth 30, all bumped, none past II.
    const attune = of(roll({ kind: 'boss', depth: 30, door: door({ shardTier: 1 }) }), 'shard');
    for (const { material } of attune.filter((m) => m.material.stat.endsWith('Attune')))
      expect(material.tier).toBe(2);
  });

  it("biomes and doors lean the shards: the biome's element and families weigh more", () => {
    const share = (rolls: MaterialDrops[], pick: (stat: string) => boolean) => {
      const shards = of(rolls, 'shard');
      return shards.filter((m) => pick(m.material.stat)).length / shards.length;
    };
    const fire = (s: string) => s === 'firePower' || s === 'fireAttune';
    const cinder = roll({ kind: 'boss' });
    const frost = roll({ kind: 'boss', biomeId: 'frostvault', biomeMana: 'frost' });
    expect(share(cinder, fire)).toBeGreaterThan(1.5 * share(frost, fire));
    const { families } = registry.getCraftingData();
    const sustain = (s: string) => families[s as keyof typeof families] === 'sustain';
    const shrine = { ...registry.getDoor('shrine'), mods: {} };
    expect(share(roll({ kind: 'boss', door: shrine }), sustain)).toBeGreaterThan(
      1.2 * share(cinder, sustain),
    );
  });
});
