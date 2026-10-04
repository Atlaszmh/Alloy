import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { grantRewards } from '../src/delve/quests.js';
import { resolveReward } from '../src/delve/rewards.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { Reward } from '../src/types/quests.js';

// See the quests spec's Rewards: concrete and rule rewards, resolved on the
// claim's stream, straight to the stockpile.

const registry = createDefaultRegistry();
const fresh = () => createDelveProfile(registry, 11, { primary: 'fire' });
const resolve = (p: DelveProfile, r: Reward, label = 'x') =>
  resolveReward(registry, p, r, new SeededRNG(p.seed).fork(label));

describe('resolveReward', () => {
  it('adds scrap, Mana Dust, Links, a metal and a flux to the stockpile', () => {
    const p = fresh();
    const cases: [Reward, (q: DelveProfile) => number][] = [
      [{ kind: 'scrap', count: 40 }, (q) => q.scrap],
      [{ kind: 'dust', count: 7 }, (q) => q.manaDust],
      [{ kind: 'links', count: 2 }, (q) => q.links],
      [{ kind: 'metal', id: 'steel', count: 3 }, (q) => q.materials.metals.steel],
      [{ kind: 'flux', grade: 'rare', count: 1 }, (q) => q.materials.flux.rare],
    ];
    for (const [reward, read] of cases) {
      const r = resolve(p, reward);
      expect(read(r.profile) - read(p), reward.kind).toBe(reward.count);
      expect(r.granted.count).toBe(reward.count);
    }
    expect(resolve(p, { kind: 'scrap', count: 40 }).granted.ref).toEqual({ kind: 'scrap' });
  });

  it("gives the metal of the hero's best depth for 'depth'", () => {
    const at = (bestDepth: number) =>
      resolve({ ...fresh(), bestDepth }, { kind: 'metal', id: 'depth', count: 2 }).granted.ref;
    expect(at(0)).toEqual({ kind: 'metal', metal: 'rusty' });
    expect(at(7)).toEqual({ kind: 'metal', metal: 'iron' });
    expect(at(12)).toEqual({ kind: 'metal', metal: 'steel' });
  });

  it("gives a shard of the family at the tier, clamped to the affix's tiers", () => {
    const { families } = registry.getCraftingData();
    for (let i = 0; i < 40; i++) {
      const p = fresh();
      const r = resolve(p, { kind: 'shard', family: 'element', tier: 3, count: 1 }, `s${i}`);
      const ref = r.granted.ref as { kind: 'shard'; stat: string; tier: number };
      expect(families[ref.stat as keyof typeof families]).toBe('element');
      expect(ref.tier).toBe(ref.stat.endsWith('Attune') ? 2 : 3);
      expect(r.profile.materials.shards[ref.stat as 'damage']![ref.tier - 1]).toBe(1);
    }
  });

  it("gives an essence that fits a learned pattern for 'fit', seen at once (from depth 20)", () => {
    const { bases, legendaries } = registry.getDelveData();
    const bestDepth = registry.getDelveBalance().drops.essenceMinDepth;
    const p = { ...fresh(), patterns: ['ring'], bestDepth };
    for (let i = 0; i < 20; i++) {
      const r = resolve(p, { kind: 'essence', id: 'fit', count: 1 }, `e${i}`);
      const { essence } = r.granted.ref as { kind: 'essence'; essence: string };
      const def = legendaries.find((l) => l.id === essence)!;
      expect(def.slots).toContain(bases.find((b) => b.id === 'ring')!.slot);
      expect(r.profile.materials.essences[essence]).toBe(1);
      expect(r.profile.essencesSeen).toContain(essence);
    }
  });

  it('teaches an unknown pattern, or gives the fallback once every pattern is known', () => {
    const p = fresh();
    const reward: Reward = {
      kind: 'pattern',
      id: 'unknown',
      count: 1,
      fallback: { kind: 'dust', count: 30 },
    };
    const r = resolve(p, reward);
    const { pattern } = r.granted.ref as { kind: 'pattern'; pattern: string };
    expect(p.patterns).not.toContain(pattern);
    expect(r.profile.patterns).toEqual([...p.patterns, pattern]);
    const all = { ...p, patterns: registry.getDelveData().bases.map((b) => b.id) };
    const f = resolve(all, reward);
    expect(f.granted).toEqual({ ref: { kind: 'dust' }, count: 30 });
    expect(f.profile.manaDust).toBe(all.manaDust + 30);
    expect(f.profile.patterns).toEqual(all.patterns);
  });

  it('resolves the same on the same stream, and goes to the stockpile mid-dive too', () => {
    const p = fresh();
    const rule: Reward = { kind: 'shard', family: 'offense', tier: 2, count: 1 };
    expect(resolve(p, rule, 'same')).toEqual(resolve(p, rule, 'same'));
    const diving = startDive(registry, p, 1);
    const r = resolve(diving, { kind: 'flux', grade: 'magic', count: 1 });
    expect(r.profile.materials.flux.magic).toBe(diving.materials.flux.magic + 1);
    expect(r.profile.dive!.haul).toEqual(diving.dive!.haul);
  });
});

describe('a claim through grantRewards', () => {
  it("resolves every reward on the claim's stream, deterministically", () => {
    const p = fresh();
    const rewards: Reward[] = [
      { kind: 'metal', id: 'depth', count: 3 },
      { kind: 'shard', family: 'utility', tier: 1, count: 2 },
      { kind: 'essence', id: 'fit', count: 1 },
    ];
    const a = grantRewards(registry, p, 'first_steps', rewards);
    expect(a).toEqual(grantRewards(registry, p, 'first_steps', rewards));
    // Below drops.essenceMinDepth the essence comes as epic flux.
    expect(a.granted.map((g) => g.ref.kind)).toEqual(['metal', 'shard', 'flux']);
    expect(a.profile.materials.metals.rusty).toBe(p.materials.metals.rusty + 3);
  });
});
