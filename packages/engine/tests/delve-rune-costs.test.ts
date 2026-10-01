import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import runesData from '../src/data/runes.json';
import { BalanceConfigSchema, RunesSchema } from '../src/data/schemas.js';
import type { DataRegistry } from '../src/data/registry.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { loadEase, runeLoad } from '../src/loot/runes.js';
import type { DelveBalance, HeroStats } from '../src/types/delve.js';
import type { RuneRef } from '../src/types/rune.js';
import { registry } from './fixtures/arena.js';

/**
 * Rune costs (see the rune costs spec): each rune's load raises its move's
 * price in its chain's own payment, eased by the hero's attunement. Step 1
 * ships `bySlot` at 0, so the price tests run on a copy of the data with it at 1.
 */

describe('rune costs: the data', () => {
  it("pins every rune's five loads", () => {
    expect(Object.fromEntries(registry.getRunes().map((d) => [d.id, d.load]))).toEqual({
      split: [0.27, 0.36, 0.45, 0.54, 0.63],
      multishot: [0.15, 0.2, 0.25, 0.3, 0.35],
      pierce: [0.57, 0.76, 0.95, 1.14, 1.33],
      chain: [0.45, 0.6, 0.75, 0.9, 1.05],
      widen: [0.12, 0.16, 0.2, 0.24, 0.28],
      quick: [0.15, 0.2, 0.25, 0.3, 0.35],
      echo: [0.27, 0.36, 0.45, 0.54, 0.63],
      heavy: [0.33, 0.44, 0.55, 0.66, 0.77],
      saturate: [0.12, 0.16, 0.2, 0.24, 0.28],
      linger: [0.57, 0.76, 0.95, 1.14, 1.33],
      volatile: [0.15, 0.2, 0.25, 0.3, 0.35],
      leech: [0.12, 0.16, 0.2, 0.24, 0.28],
      drain: [0.24, 0.32, 0.4, 0.48, 0.56],
      guard: [0.12, 0.16, 0.2, 0.24, 0.28],
    });
  });

  it('refuses a rune without a load, with four, with one below 0, or with one that falls with tier', () => {
    const [split] = runesData;
    const ok = (row: object) => RunesSchema.safeParse([row]).success;
    const { load, ...noLoad } = split;
    expect(ok(split)).toBe(true);
    expect(ok(noLoad)).toBe(false);
    expect(ok({ ...split, load: load.slice(0, 4) })).toBe(false);
    expect(ok({ ...split, load: [-0.1, 0.36, 0.45, 0.54, 0.63] })).toBe(false);
    expect(ok({ ...split, load: [0.36, 0.27, 0.45, 0.54, 0.63] })).toBe(false);
  });

  it('ships delve.runes.load with every slot at 0, so every load is 0', () => {
    expect(registry.getDelveBalance().runes.load).toEqual({
      bySlot: { primary: 0, defensive: 0, ultimate: 0 },
      byForm: {},
      charge: 1,
      cast: 1,
      easePerAttune: 0.03,
      easeCap: 0.6,
    });
  });

  it('names only real forms in byForm', () => {
    const forms = registry.getArpgData().forms.map((f) => f.id);
    for (const id of Object.keys(registry.getDelveBalance().runes.load.byForm))
      expect(forms).toContain(id);
  });

  it('refuses an easeCap above 1, a negative factor and a slot missing from bySlot', () => {
    const runes = balanceData.delve.runes;
    const ok = (load: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: { ...balanceData.delve, runes: { ...runes, load: { ...runes.load, ...load } } },
      }).success;
    expect(ok({})).toBe(true);
    expect(ok({ easeCap: 1, byForm: { volley: 0.8 } })).toBe(true);
    expect(ok({ easeCap: 1.01 })).toBe(false);
    expect(ok({ easePerAttune: -0.01 })).toBe(false);
    expect(ok({ charge: -1 })).toBe(false);
    expect(ok({ byForm: { bolt: -0.5 } })).toBe(false);
    expect(ok({ bySlot: { primary: 1, defensive: 1 } })).toBe(false);
  });
});

const III = (id: string): RuneRef => ({ id, tier: 3 });

/** The default data with `delve.runes.load` changed. */
function withLoad(load: Partial<DelveBalance['runes']['load']>): DataRegistry {
  const bal = registry.getDelveBalance();
  const next = { ...bal, runes: { ...bal.runes, load: { ...bal.runes.load, ...load } } };
  return Object.assign(Object.create(registry) as DataRegistry, { getDelveBalance: () => next });
}
const loaded = withLoad({ bySlot: { primary: 1, defensive: 1, ultimate: 1 } });
const unloaded = withLoad({ bySlot: { primary: 0, defensive: 0, ultimate: 0 } });

/** An unarmed hero attuned `fire` to Fire and `frost` to Frost. */
const bare = computeHeroStats({}, registry);
function at(fire: number, frost = 0): HeroStats {
  return { ...bare, attunement: { ...bare.attunement, fire, frost } };
}

describe('runeLoad and loadEase', () => {
  it("runeLoad is the tier's load × its slot's factor × its form's (1 when unlisted)", () => {
    const r = withLoad({
      bySlot: { primary: 0.5, defensive: 1, ultimate: 1 },
      byForm: { lance: 2 },
    });
    expect(runeLoad(r, III('echo'), 'bolt')).toBeCloseTo(0.45 * 0.5);
    expect(runeLoad(r, III('echo'), 'lance')).toBeCloseTo(0.45 * 0.5 * 2);
    expect(runeLoad(r, { id: 'echo', tier: 5 }, 'nova')).toBeCloseTo(0.63);
    expect(runeLoad(r, { id: 'quick', tier: 1 }, 'ward')).toBeCloseTo(0.15);
    expect(runeLoad(unloaded, { id: 'pierce', tier: 5 }, 'bolt')).toBe(0);
  });

  it("loadEase is easePerAttune × the move's mean attunement, at most easeCap", () => {
    expect(loadEase(registry, at(0), ['fire'])).toBe(0);
    expect(loadEase(registry, at(1), ['fire'])).toBeCloseTo(0.03);
    expect(loadEase(registry, at(15), ['fire'])).toBeCloseTo(0.45);
    expect(loadEase(registry, at(25), ['fire'])).toBe(0.6);
    expect(loadEase(registry, at(15, 5), ['fire', 'frost'])).toBeCloseTo(0.3);
    expect(loadEase(withLoad({ easeCap: 0.2 }), at(15), ['fire'])).toBe(0.2);
  });
});
