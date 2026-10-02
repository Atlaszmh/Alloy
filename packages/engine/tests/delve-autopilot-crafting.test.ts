import { describe, it, expect } from 'vitest';
import { betweenDives, runAutopilot, takeBestStop } from '../src/delve/autopilot.js';
import { startDive } from '../src/delve/dive.js';
import { economySim } from '../src/delve/economy.js';
import { bindSecondary } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { honeCost } from '../src/loot/forge.js';
import { generateItem } from '../src/loot/item-generator.js';
import { emptyMaterials, withMaterial } from '../src/loot/materials.js';
import { upgradeCost } from '../src/loot/smithing.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { Haul, MaterialRef } from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import { bal, registry } from './fixtures/arena.js';

// See the crafting spec: "Engine shape → Autopilot" and the Economy view.

describe('economySim', () => {
  const report = economySim(registry, 1, 3);

  it('plays exactly the dives asked for, in order, from a new save, as the autopilot does', () => {
    expect(report.seed).toBe(1);
    expect(report.dives.map((d) => d.dive)).toEqual([1, 2, 3]);
    const run = runAutopilot(registry, { seed: 1, dives: 3 });
    expect(report.profile).toEqual(run.profile);
    expect(report.dives.map((d) => d.depth)).toEqual(run.reports.map((r) => r.endDepth));
    expect(report.dives.map((d) => d.died)).toEqual(run.reports.map((r) => r.result === 'dead'));
    expect(economySim(registry, 1, 3)).toEqual(report); // seeded: the same report
  });

  it("counts every rarity forged and a death's loss, never below zero, as plain data", () => {
    for (const d of report.dives) {
      expect(Object.keys(d.forged)).toEqual(RARITY_ORDER);
      expect(d.lost === null).toBe(!d.died);
      for (const h of [d.income, d.salvaged, d.spent, ...(d.lost ? [d.lost] : [])]) {
        const counts = [
          h.scrap,
          h.dust,
          h.links,
          ...Object.values(h.metals),
          ...Object.values(h.flux),
        ];
        expect(Math.min(...counts)).toBeGreaterThanOrEqual(0);
      }
    }
    expect(structuredClone(report)).toEqual(report);
  });

  it('reconciles each dive with the stockpile: what came in and what the Anvil salvaged, less what it and the stops spent', () => {
    /** Every non-zero count in `h`, by a flat key. */
    const flat = (h: Haul) => {
      const out: Record<string, number> = { scrap: h.scrap, dust: h.dust, links: h.links };
      for (const [k, n] of Object.entries(h.metals)) out[`metal:${k}`] = n;
      for (const [k, n] of Object.entries(h.flux)) out[`flux:${k}`] = n;
      for (const [k, n] of Object.entries(h.essences)) out[`essence:${k}`] = n;
      for (const [k, ns] of Object.entries(h.shards))
        ns!.forEach((n, t) => (out[`shard:${k}:${t}`] = n));
      for (const [k, ns] of Object.entries(h.runes))
        ns!.forEach((n, t) => (out[`rune:${k}:${t}`] = n));
      return Object.fromEntries(Object.entries(out).filter(([, n]) => n !== 0));
    };
    const stock = (p: DelveProfile): Haul => ({
      ...p.materials,
      scrap: p.scrap,
      dust: p.manaDust,
      links: p.links,
      runes: p.runes,
    });
    const minus = (a: Record<string, number>, b: Record<string, number>) => {
      const out = { ...a };
      for (const [k, n] of Object.entries(b)) out[k] = (out[k] ?? 0) - n;
      return Object.fromEntries(Object.entries(out).filter(([, n]) => n !== 0));
    };
    let p = runAutopilot(registry, { seed: 1, dives: 0 }).profile;
    let salvagedAny = false;
    for (const d of report.dives) {
      const next = runAutopilot(registry, { seed: 1, dives: 1, profile: p }).profile;
      const delta = minus(flat(stock(next)), flat(stock(p)));
      const net = minus(minus(flat(d.income), flat(d.spent)), minus({}, flat(d.salvaged)));
      expect(net).toEqual(delta);
      salvagedAny ||= Object.keys(flat(d.salvaged)).length > 0;
      p = next;
    }
    expect(p).toEqual(report.profile);
    expect(salvagedAny).toBe(true);
  });

  it('plays a forced pair', () => {
    const forced = economySim(registry, 2, 1, { primary: 'frost', secondary: 'fire' });
    expect(forced.dives).toHaveLength(1);
    expect(forced.profile.pair).toEqual({ primary: 'frost', secondary: 'fire' });
  });
});

describe('the autopilot at the Anvil', () => {
  /** `refs` in a pouch, `n` of each. */
  const pouch = (n: number, ...refs: MaterialRef[]) =>
    refs.reduce((m, ref) => withMaterial(m, ref, n), emptyMaterials());
  /** A Fire hero, Frost bound, back from a dive to depth 6, holding `over`. */
  const hero = (over: Partial<DelveProfile> = {}): DelveProfile => {
    const p0 = createDelveProfile(registry, 4, { primary: 'fire' });
    const p = bindSecondary(registry, { ...p0, bestDepth: 6 }, 'frost').profile;
    const stats = { ...p.stats, dives: 1 };
    return { ...p, materials: emptyMaterials(), scrap: 0, stats, ...over };
  };

  it('forges a legendary first, then each slot it can improve: the weapon and two armour pieces in the primary, the rest in the secondary', () => {
    const materials = pouch(
      1,
      { kind: 'flux', grade: 'epic' },
      { kind: 'essence', essence: 'bedrock' }, // chest, boots or helm
    );
    const p = hero({
      materials: withMaterial(
        withMaterial(materials, { kind: 'metal', metal: 'iron' }, 5),
        { kind: 'flux', grade: 'magic' },
        2,
      ),
      patterns: ['sword', 'cuirass', 'dagger', 'gauntlets'],
      scrap: 5000,
    });
    const after = betweenDives(registry, p);
    const { weapon, chest, gloves } = after.equipped;
    expect(chest).toMatchObject({ rarity: 'legendary', mana: 'fire', ilvl: 6 });
    expect(chest!.legendary!.id).toBe('bedrock');
    expect(weapon).toMatchObject({ rarity: 'magic', mana: 'fire', baseId: 'sword' });
    expect(gloves).toMatchObject({ rarity: 'magic', mana: 'frost' });
    expect(after.materials.flux).toEqual({ uncommon: 0, magic: 0, rare: 0, epic: 0 });
    expect(after.materials.metals.iron).toBe(2);
    expect(after.materials.essences.bedrock).toBe(0);
  });

  it("keeps its scrap and its epic flux for an essence it can't yet pay to forge", () => {
    const materials = pouch(
      1,
      { kind: 'flux', grade: 'epic' },
      { kind: 'essence', essence: 'bedrock' },
      { kind: 'metal', metal: 'iron' },
    );
    const p = hero({ materials, scrap: 100 }); // a legendary at item level 6 costs more
    const after = betweenDives(registry, p);
    expect(after.scrap).toBe(100); // no upgrades either
    expect(after.materials).toEqual(materials);
    expect(after.equipped.chest!.rarity).toBe('common');
  });

  it('refines flux triples up, and bars up while its best bar forges below its deepest depth', () => {
    const materials = withMaterial(
      pouch(7, { kind: 'flux', grade: 'uncommon' }),
      { kind: 'metal', metal: 'rusty' },
      9,
    );
    const { refine } = bal.crafting;
    // No patterns, so nothing is forged: two magic flux, then rusty → iron ×3 → steel (band 10–15).
    const p = hero({
      materials,
      patterns: [],
      bestDepth: 12,
      scrap: 2 * refine.flux.scrap + 4 * refine.metal.scrap,
    });
    const after = betweenDives(registry, p);
    expect(after.materials.flux).toEqual({ uncommon: 1, magic: 2, rare: 0, epic: 0 });
    expect(after.materials.metals).toMatchObject({ rusty: 0, iron: 0, steel: 1 });
    expect(after.scrap).toBe(0);
  });

  it('buys the tier I shard that makes a triple of an affix it wants, and refines it', () => {
    const shards = pouch(2, { kind: 'shard', stat: 'damage', tier: 1 });
    const { scrap, dust } = bal.crafting.shardBench;
    const refine = bal.crafting.refine.shard.scrap[0];
    const p = hero({ materials: shards, patterns: [], scrap: scrap + refine, manaDust: dust });
    const after = betweenDives(registry, p);
    expect(after.materials.shards.damage).toEqual([0, 1]);
    expect([after.scrap, after.manaDust]).toEqual([0, 0]);
  });

  it('hones an equipped line that rolled below the middle of its band', () => {
    const ring = generateItem(
      registry,
      { uid: 'r', ilvl: 6, rarity: 'magic', slot: 'ring', mana: 'frost' },
      new SeededRNG(3),
    );
    const low = { ...ring, affixes: ring.affixes.map((a) => ({ ...a, roll: 0.05 })) };
    const p = hero({ patterns: [], scrap: honeCost(registry, low) });
    const after = betweenDives(registry, { ...p, equipped: { ...p.equipped, ring: low } });
    expect(after.equipped.ring!.hones).toBe(1);
    expect(after.scrap).toBe(0);
  });

  it("takes a stop's upgrade with the scrap the dive banked (stops spend banked first)", () => {
    const p = startDive(registry, hero(), 1);
    const cost = upgradeCost(registry, p.equipped.weapon!)!; // its cheapest (first on a tie)
    const dive = p.dive!;
    const atStop: DelveProfile = {
      ...p,
      dive: {
        ...dive,
        phase: 'choosing',
        doorChoices: ['winding'],
        stop: { offers: ['upgrade'], taken: false },
        banked: { ...dive.banked, scrap: cost },
      },
    };
    const after = takeBestStop(registry, atStop);
    expect(after.equipped.weapon!.upgrade).toBe(1);
    expect([after.scrap, after.dive!.banked.scrap]).toEqual([0, 0]);
  });
});
