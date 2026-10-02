import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import runesData from '../src/data/runes.json';
import { BalanceConfigSchema, RunesSchema } from '../src/data/schemas.js';
import type { DataRegistry } from '../src/data/registry.js';
import {
  baseCost,
  chargeCap,
  resolveAbility,
  resolveChain,
} from '../src/arpg/abilities/resolve.js';
import {
  basicIncome,
  computeHeroStats,
  estimateCombat,
  manaPool,
  manaSupport,
  strikeInterval,
  useInterval,
} from '../src/delve/hero-stats.js';
import * as engine from '../src/index.js';
import { loadEase, runeLoad } from '../src/loot/runes.js';
import type { AbilityPayment, AbilitySlot, Chain, Move, MoveKind } from '../src/types/ability.js';
import type { DelveBalance, HeroStats } from '../src/types/delve.js';
import type { RuneRef } from '../src/types/rune.js';
import GOLDEN from './fixtures/rune-costs-v051.json';
import { arena, dummy, gear, moveOf, press, registry } from './fixtures/arena.js';

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

  it('ships delve.runes.load with every slot at 1', () => {
    expect(registry.getDelveBalance().runes.load).toEqual({
      bySlot: { primary: 1, defensive: 1, ultimate: 1 },
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

/** The spec's worked example: Echo, Heavy and Linger at tier III, a raw load of 1.95. */
const SET = [III('echo'), III('heavy'), III('linger')];

/** A medium Fire Bolt with these parts changed. */
function bolt(over: Partial<Move> = {}): Move {
  return { kind: 'medium', form: 'bolt', elements: ['fire'], ...over };
}

describe('resolveAbility: the load and the prices', () => {
  /** The golden's moves: each slot's form, its element and the runes of its runed rows. */
  const MOVES: Record<AbilitySlot, [Move['form'], Move['elements'], RuneRef[]]> = {
    primary: ['bolt', ['fire'], SET],
    defensive: ['ward', ['frost'], [III('quick'), III('chain'), III('drain')]],
    ultimate: ['nova', ['fire'], SET],
  };

  it('resolves as v0.51.0 did: a runed move with bySlot at 0, a rune-less one at any bySlot', () => {
    const stats = at(15, 15);
    const rows = Object.entries(GOLDEN as Record<string, number[]>);
    expect(rows).toHaveLength(108);
    for (const [key, want] of rows) {
      const [slot, payment, kind, stage, runed] = key.split('|') as [
        AbilitySlot,
        AbilityPayment,
        MoveKind,
        string,
        string,
      ];
      const [form, elements, runes] = MOVES[slot];
      const move: Move = { kind, form, elements, ...(runed === 'runed' ? { runes } : {}) };
      for (const reg of runed === 'runed' ? [unloaded] : [unloaded, loaded]) {
        const r = resolveAbility(reg, slot, move, payment, stats, +stage);
        const got = [r.cost, r.chargeNeed, r.conjure, r.channel, r.castTime, r.cooldown];
        expect(got, key).toEqual(want);
        expect(r.load, key).toBe(0);
        expect(r.ease, key).toBeCloseTo(0.45);
      }
    }
  });

  it('adds the shares of the runes acting, then eases them: 0.97, 0.55 and 0.4 of raw at 1, 15 and 25', () => {
    const r = (stats: HeroStats) =>
      resolveAbility(loaded, 'primary', bolt({ runes: SET }), 'mana', stats);
    expect(r(at(0)).load).toBeCloseTo(1.95);
    expect(r(at(1)).load).toBeCloseTo(1.95 * 0.97);
    expect(r(at(15)).load).toBeCloseTo(1.95 * 0.55);
    expect(r(at(25)).load).toBeCloseTo(1.95 * 0.4);
    const none = resolveAbility(loaded, 'primary', bolt(), 'mana', at(15));
    expect(none.load).toBe(0);
    expect(none.ease).toBeCloseTo(0.45);
    // A fusion move eases by its two elements' mean.
    const fusion = resolveAbility(
      loaded,
      'primary',
      bolt({ elements: ['fire', 'frost'], runes: [III('echo')] }),
      'mana',
      at(15, 5),
    );
    expect(fusion.ease).toBeCloseTo(0.3);
    expect(fusion.load).toBeCloseTo(0.45 * 0.7);
  });

  it('adds nothing for an empty socket, an unknown id or a Pierce on an Earth Bolt', () => {
    const r = (over: Partial<Move>) => resolveAbility(loaded, 'primary', bolt(over), 'mana', at(0));
    expect(r({ runes: [III('echo'), null, { id: 'nope', tier: 3 }] }).load).toBeCloseTo(0.45);
    const earth = r({ elements: ['earth'], runes: [III('pierce'), III('echo')] });
    expect(earth.runes).toEqual([III('echo')]);
    expect(earth.load).toBeCloseTo(0.45);
  });

  it('raises the price in the payment: mana × (1 + load), a cast its mana and its channel, a charge chain its need; never a cooldown or the conjure', () => {
    // The spec's worked example: a starting hero (1 attunement), eased 3%, so the load is 1.89.
    const pay = (payment: AbilityPayment, reg = loaded) =>
      resolveAbility(reg, 'primary', bolt({ runes: SET }), payment, at(1));
    const load = 1.95 * 0.97;
    expect(pay('mana').cost).toBeCloseTo(23.1, 1);
    expect(pay('charge').chargeNeed).toBeCloseTo(8.1, 1);
    expect(pay('charge').cost).toBe(0);
    expect(pay('cast').cost).toBeCloseTo(11.6, 1);
    // Heavy's wind-up +20%: a 0.42 s channel becomes 1.21 s.
    expect(pay('cast').channel).toBeCloseTo(1.21, 2);
    for (const payment of ['mana', 'charge', 'cast'] as const) {
      const now = pay(payment);
      const before = pay(payment, unloaded);
      expect(now.load).toBeCloseTo(load);
      expect(now.cost).toBeCloseTo(before.cost * (1 + load));
      expect(now.chargeNeed).toBeCloseTo(before.chargeNeed * (1 + load));
      expect(now.channel).toBeCloseTo(before.channel * (1 + load));
      expect(now.castTime).toBeCloseTo(now.conjure + now.channel);
      expect(now.conjure).toBe(before.conjure);
      expect(now.cooldown).toBe(before.cooldown);
    }
    // The conversions: how much of the load a charge need and a channel take.
    const conv = withLoad({
      bySlot: { primary: 1, defensive: 1, ultimate: 1 },
      charge: 2,
      cast: 0.5,
    });
    expect(pay('charge', conv).chargeNeed).toBeCloseTo(
      pay('charge', unloaded).chargeNeed * (1 + load * 2),
    );
    expect(pay('cast', conv).channel).toBeCloseTo(pay('cast', unloaded).channel * (1 + load * 0.5));
    expect(pay('cast', conv).cost).toBeCloseTo(pay('cast').cost);
  });

  it("keeps a charge chain's lockout, and its meter grows to hold the loaded need", () => {
    const novas = (reg: DataRegistry) =>
      resolveChain(reg, at(1), 'ultimate', {
        payment: 'charge',
        moves: [
          { kind: 'medium', form: 'nova', elements: ['fire'], runes: [III('echo')] },
          { kind: 'heavy', form: 'nova', elements: ['fire'] },
        ],
      });
    const before = novas(unloaded);
    const now = novas(loaded);
    expect(now.moves[0].cooldown).toBe(before.moves[0].cooldown);
    expect(now.moves[0].chargeNeed).toBeCloseTo(before.moves[0].chargeNeed * (1 + 0.45 * 0.97));
    expect(now.moves[1].chargeNeed).toBe(before.moves[1].chargeNeed);
    // Unloaded the heavy Nova needs most; loaded, the runed medium one does.
    expect(chargeCap(before)).toBe(before.moves[1].chargeNeed);
    expect(chargeCap(now)).toBe(now.moves[0].chargeNeed);
  });

  it("stacks with Manaweaver as one product, and loads each of a hold's stages", () => {
    const load = 1.95 * 0.97;
    const weaver = { ...at(1), legendaries: { manaweaver: 20 } };
    expect(
      resolveAbility(loaded, 'primary', bolt({ runes: SET }), 'mana', weaver).cost,
    ).toBeCloseTo(8 * 0.8 * (1 + load));
    for (const payment of ['mana', 'charge'] as const) {
      const hold = (reg: DataRegistry) =>
        resolveChain(reg, at(1), 'primary', {
          payment,
          moves: [bolt({ kind: 'hold', runes: SET })],
        }).hold[0]!;
      const [now, before] = [hold(loaded), hold(unloaded)];
      for (const stage of [0, 1, 2]) {
        expect(now[stage].cost).toBeCloseTo(before[stage].cost * (1 + load));
        expect(now[stage].chargeNeed).toBeCloseTo(before[stage].chargeNeed * (1 + load));
      }
    }
  });

  it('leaves basic blows free: runed blows resolve the same at any bySlot', () => {
    const blows = (reg: DataRegistry) =>
      computeHeroStats({ weapon: gear('fire') }, reg, {
        pair: { primary: 'fire', secondary: null },
        basic: [
          { kind: 'light', element: 'fire', runes: [III('echo')] },
          { kind: 'light', element: 'fire', runes: [III('heavy')] },
          { kind: 'heavy', element: 'fire', runes: [III('linger')] },
        ],
      }).weapon.blows;
    expect(blows(loaded)).toEqual(blows(unloaded));
    expect(blows(loaded)[2].runes).toEqual([III('linger')]);
  });

  it('baseCost is the mana cost before the load: 0 for a charge move', () => {
    const pay = (payment: AbilityPayment) =>
      resolveAbility(loaded, 'primary', bolt({ runes: SET }), payment, at(1));
    expect(baseCost(pay('mana'))).toBeCloseTo(8);
    expect(baseCost(pay('cast'))).toBeCloseTo(4);
    expect(baseCost(pay('charge'))).toBe(0);
    expect(baseCost(resolveAbility(loaded, 'primary', bolt(), 'mana', at(1)))).toBe(8);
  });
});

describe('basicIncome and manaSupport', () => {
  /** A common Fire sword, the arena fixture's, attuned `extra` more to Fire; its blows Drain III when `drain`. */
  function swordHero(drain: boolean, extra = 0): HeroStats {
    return computeHeroStats({ weapon: gear('fire') }, registry, {
      pair: { primary: 'fire', secondary: null },
      attunement: { fire: extra },
      basic: (['light', 'light', 'heavy'] as const).map((kind) => ({
        kind,
        element: 'fire' as const,
        ...(drain ? { runes: [III('drain')] } : {}),
      })),
    });
  }

  it("strikeInterval is the attack interval × the blows' mean time, a blow's Quick shortening its share", () => {
    expect(engine.strikeInterval).toBe(strikeInterval);
    const plain = swordHero(false);
    const times = plain.weapon.blows.map((b) => b.time);
    expect(strikeInterval(plain)).toBeCloseTo(
      (plain.attackInterval * times.reduce((a, t) => a + t, 0)) / times.length,
    );
    const quick = computeHeroStats({ weapon: gear('fire') }, registry, {
      pair: { primary: 'fire', secondary: null },
      basic: (['light', 'light', 'heavy'] as const).map((kind) => ({
        kind,
        element: 'fire' as const,
        runes: [III('quick')],
      })),
    });
    const beat = quick.weapon.blows[0].knobs.quick.beat;
    expect(beat).toBeLessThan(1);
    expect(strikeInterval(quick)).toBeCloseTo(strikeInterval(plain) * beat);
  });

  it("basicIncome is regen and a strike's gain, plus the blows' Drain, over the strike interval", () => {
    const plain = swordHero(false);
    const drained = swordHero(true);
    const gain = registry.getDelveBalance().mana.basicAttackGain;
    expect(basicIncome(registry, plain)).toBeCloseTo(
      manaPool(plain, registry).regen + gain / strikeInterval(plain),
    );
    // Drain III: 2 mana a foe-hit over the sword's cleave, at most half a strike's 5.
    expect(basicIncome(registry, drained) - basicIncome(registry, plain)).toBeCloseTo(
      2.5 / strikeInterval(drained),
    );
  });

  it("leaves estimateCombat as it was: v0.51.0's Power exactly, its DPS to the float", () => {
    const hero = computeHeroStats({ weapon: gear('fire') }, registry, {
      pair: { primary: 'fire', secondary: 'frost' },
      attunement: { fire: 14, frost: 5 },
      basic: (['light', 'light', 'heavy'] as const).map((kind) => ({
        kind,
        element: 'fire' as const,
        runes: [III('drain')],
      })),
    });
    const drained: Partial<Record<AbilitySlot, Chain>> = {
      primary: {
        payment: 'mana',
        moves: [
          bolt({ kind: 'light', runes: [III('drain'), III('echo')] }),
          bolt({ kind: 'hold', elements: ['fire', 'frost'], runes: [III('drain')] }),
        ],
      },
      defensive: {
        payment: 'mana',
        moves: [{ kind: 'medium', form: 'ward', elements: ['frost'], runes: [III('drain')] }],
      },
      ultimate: {
        payment: 'cast',
        moves: [
          { kind: 'heavy', form: 'nova', elements: ['fire'], runes: [III('drain'), III('heavy')] },
        ],
      },
    };
    const charged = {
      ...drained,
      ultimate: {
        payment: 'charge' as const,
        moves: [
          {
            kind: 'medium' as const,
            form: 'nova' as const,
            elements: ['fire' as const],
            runes: [III('drain')],
          },
        ],
      },
    };
    const cases: [Partial<Record<AbilitySlot, Chain>> | undefined, number, number][] = [
      [drained, 77.33972432955927, 1098],
      [charged, 122.88517595614529, 1385],
      [undefined, 158.57566058873041, 1573],
    ];
    for (const [chains, dps, power] of cases) {
      // The chains are runed: v0.51.0's numbers are theirs with the loads zeroed.
      const e = estimateCombat(hero, unloaded, 10, chains);
      expect(e.power).toBe(power);
      expect(e.dps).toBeCloseTo(dps, 9);
    }
  });

  it("spend is the moves' mean cost over their unbounded interval; refill is basicIncome without Drain on the chain", () => {
    const stats = swordHero(false);
    const bal = registry.getDelveBalance();
    const chain = resolveChain(registry, stats, 'primary', {
      payment: 'mana',
      moves: [bolt(), bolt({ kind: 'heavy' })],
    });
    const every = useInterval(bal, chain, stats.tempo, Infinity, Infinity);
    const support = manaSupport(registry, stats, chain);
    expect(support.spend).toBeCloseTo((chain.moves[0].cost + chain.moves[1].cost) / 2 / every);
    expect(support.refill).toBe(basicIncome(registry, stats));
    const charge = resolveChain(registry, stats, 'primary', { payment: 'charge', moves: [bolt()] });
    expect(manaSupport(registry, stats, charge)).toEqual({
      spend: 0,
      refill: basicIncome(registry, stats),
    });
  });

  it('spends the eased load: a runed chain costs 1 + load as much, less on a better-attuned hero', () => {
    // Echo, Linger and Pierce leave the wind-up and the beat alone, so the interval stays.
    const runes = [III('echo'), III('linger'), III('pierce')];
    const spend = (stats: HeroStats, withRunes: boolean) =>
      manaSupport(
        loaded,
        stats,
        resolveChain(loaded, stats, 'primary', {
          payment: 'mana',
          moves: [bolt(withRunes ? { runes } : {})],
        }),
      ).spend;
    const starved = swordHero(false);
    const supported = swordHero(false, 14);
    expect(starved.attunement.fire).toBe(1);
    expect(spend(starved, true) / spend(starved, false)).toBeCloseTo(1 + 2.35 * 0.97);
    expect(spend(supported, true) / spend(supported, false)).toBeCloseTo(1 + 2.35 * 0.55);
  });
});

describe("Drain's cap: half the cost before the load", () => {
  /** A light mana Bolt with Drain III: 5.6 mana before its load, so Drain gives back at most 2.8. */
  const chain: Chain = { payment: 'mana', moves: [bolt({ kind: 'light', runes: [III('drain')] })] };

  it("a cast's Drain budget is baseCost × drainShare, not the loaded cost's", () => {
    const w = arena([dummy(13, 26)], { noBasic: true, chains: { primary: chain } });
    w.hero.chains[0] = resolveChain(loaded, w.hero.stats, 'primary', chain);
    const ab = moveOf(w, 0);
    expect(ab.cost).toBeGreaterThan(baseCost(ab));
    press(w, 0);
    expect(w.hero.drainLeft[0]).toBeCloseTo(
      baseCost(ab) * registry.getDelveBalance().runes.drainShare,
    );
  });

  it("manaSupport's refill counts the chain's Drain capped the same way", () => {
    const stats = computeHeroStats({ weapon: gear('fire') }, registry, {
      pair: { primary: 'fire', secondary: null },
    });
    const resolved = resolveChain(loaded, stats, 'primary', chain);
    const every = useInterval(
      registry.getDelveBalance(),
      resolved,
      stats.tempo,
      Infinity,
      Infinity,
    );
    // 2 a foe-hit × a Bolt's 1.6 foes is 3.2, past the cap of 2.8.
    expect(manaSupport(loaded, stats, resolved).refill - basicIncome(registry, stats)).toBeCloseTo(
      2.8 / every,
    );
  });
});

describe("the contract's exports", () => {
  it('exports runeLoad, loadEase, baseCost, basicIncome and manaSupport', () => {
    for (const name of ['runeLoad', 'loadEase', 'baseCost', 'basicIncome', 'manaSupport'] as const)
      expect(typeof engine[name], name).toBe('function');
  });
});
