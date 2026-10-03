import { describe, it, expect } from 'vitest';
import { BalanceConfigSchema, RunesSchema } from '../src/data/schemas.js';
import balanceData from '../src/data/balance.json';
import runesData from '../src/data/runes.json';
import {
  NEUTRAL,
  beatFor,
  mergeKnobs,
  moveBeat,
  playedKind,
  resolveAbility,
  resolveChain,
} from '../src/arpg/abilities/resolve.js';
import * as engine from '../src/index.js';
import { makeCtx } from '../src/arpg/combat.js';
import { spawnProjectile } from '../src/arpg/abilities/targeting.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { startDive } from '../src/delve/dive.js';
import {
  addLootToBag,
  createDelveProfile,
  parseDelveProfile,
  salvageItems,
} from '../src/delve/profile.js';
import { stopKinds } from '../src/delve/stops.js';
import {
  addToPouch,
  extraShotPower,
  loadText,
  pouchCount,
  runeActive,
  runeFits,
  runeKnobs,
  runeText,
  socketCap,
  socketPrice,
  socketsOf,
  takeFromPouch,
} from '../src/loot/runes.js';
import type { RunePouch, RuneRef, RuneTier } from '../src/types/rune.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { MOVE_KINDS, type Move } from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { DelveProfile } from '../src/types/delve.js';
import {
  arena,
  bal,
  chainsOf,
  damaged,
  dummy,
  moveOf,
  press,
  registry,
  run,
  withChains,
} from './fixtures/arena.js';

// The runes spec's wave-0 contract: every new knob neutral, so nothing plays differently yet.

const bare = computeHeroStats({}, registry);

describe('knobs: the new fields and their merge rules', () => {
  it('merges split (the larger count wins), extra shots, echo, quick and the added knobs', () => {
    const k = mergeKnobs(
      {
        split: { count: 2, power: 0.3 },
        extraShots: { count: 1, power: 0.65 },
        echo: 0.3,
        quick: { beat: 0.9, cooldown: 0.9 },
        stacksBonus: 1,
        catalyst: 0.15,
        manaOnHit: 1,
        guardOnLand: 0.03,
      },
      {
        split: { count: 3, power: 0.4 },
        extraShots: { count: 2, power: 0.8 },
        echo: 0.45,
        quick: { beat: 1.2, windup: 1.2 },
        stacksBonus: 2,
        catalyst: 0.5,
        manaOnHit: 1.5,
        guardOnLand: 0.08,
      },
      { split: { count: 2, power: 0.5 } },
    );
    expect(k.split).toEqual({ count: 3, power: 0.4 });
    expect(k.extraShots!.count).toBe(3);
    expect(k.extraShots!.power).toBeCloseTo(0.52);
    expect(k.echo).toBe(0.45);
    expect(k.quick.beat).toBeCloseTo(1.08);
    expect(k.quick.cooldown).toBeCloseTo(0.9);
    expect(k.quick.windup).toBeCloseTo(1.2);
    expect(k.stacksBonus).toBe(3);
    expect(k.catalyst).toBeCloseTo(0.65);
    expect(k.manaOnHit).toBeCloseTo(2.5);
    expect(k.guardOnLand).toBeCloseTo(0.11);
  });

  it('counts pierce: true is every foe, counts add', () => {
    expect(mergeKnobs({ pierce: true }).pierce).toBe(Infinity);
    expect(mergeKnobs({ pierce: false }).pierce).toBe(0);
    expect(mergeKnobs({ pierce: 2 }, { pierce: 3 }).pierce).toBe(5);
    expect(mergeKnobs({ pierce: true }, { pierce: 2 }).pierce).toBe(Infinity);
  });

  it('merges zones field by field: the longer seconds and the larger tick power', () => {
    const zone = mergeKnobs(
      { zone: { seconds: 1.5, tickPower: 0.2 } },
      { zone: { seconds: 3, tickPower: 0.15 } },
    ).zone;
    expect(zone).toEqual({ seconds: 3, tickPower: 0.2 });
    // Linger's cap rides along: the smaller, where either has one.
    const capped = mergeKnobs(
      { zone: { seconds: 1.5, tickPower: 0.2, perCast: 3 } },
      { zone: { seconds: 3, tickPower: 0.15 } },
    ).zone;
    expect(capped).toEqual({ seconds: 3, tickPower: 0.2, perCast: 3 });
  });

  it('starts every merge from NEUTRAL and never changes it', () => {
    mergeKnobs({ applies: ['burn'], quick: { beat: 0.5 } });
    expect(NEUTRAL.applies).toEqual([]);
    expect(NEUTRAL.quick).toEqual({ beat: 1, cooldown: 1, windup: 1 });
    expect(mergeKnobs()).toEqual(NEUTRAL);
  });
});

describe('moves and blows without runes', () => {
  it('resolve with no runes and neutral rune knobs; Earth still pierces every foe', () => {
    const chain = resolveChain(registry, bare, 'primary', {
      moves: [{ kind: 'medium', form: 'bolt', elements: ['earth'] }],
      payment: 'mana',
    });
    const m = chain.moves[0];
    expect(m.runes).toEqual([]);
    expect(m.knobs.pierce).toBe(Infinity);
    expect(m.knobs.quick).toEqual(NEUTRAL.quick);
    expect(m.knobs.split).toBeNull();
    expect(bare.weapon.blows.length).toBeGreaterThan(0);
    for (const b of bare.weapon.blows) {
      expect(b.knobs).toBe(NEUTRAL);
      expect(b.runes).toEqual([]);
    }
  });

  it("moveBeat is the beat of the kind it played as, times the move's quick.beat", () => {
    for (const kind of MOVE_KINDS) {
      const ab = resolveAbility(
        registry,
        'primary',
        { kind, form: 'bolt', elements: ['fire'] },
        'mana',
        bare,
      );
      expect(moveBeat(bal, ab, 1.3)).toBe(beatFor(bal, 'primary', playedKind(ab), 1.3));
      const quick = { ...ab, knobs: { ...ab.knobs, quick: { beat: 0.8, cooldown: 1, windup: 1 } } };
      expect(moveBeat(bal, quick, 1)).toBeCloseTo(beatFor(bal, 'primary', playedKind(ab), 1) * 0.8);
    }
  });
});

describe("a shot's pierce count", () => {
  // The hero starts at (13, 36) facing up; three sturdy foes on its line.
  const line = () => [dummy(13, 33), dummy(13, 30.5), dummy(13, 28)];
  const explodes = (events: ArpgEvent[]) => events.filter((e) => e.kind === 'explode').length;

  it('a Bolt passes its pierce count of foes, impacting on each, and the next hit ends it', () => {
    const w = arena(line(), { noBasic: true });
    moveOf(w, 0).knobs.pierce = 1;
    const events = [...press(w, 0), ...run(w, 1.5)];
    expect(w.monsters.map(damaged)).toEqual([true, true, false]);
    expect(explodes(events)).toBe(2);
  });

  it('a Bolt that pierces every foe hits all three and never bursts at the end of its flight', () => {
    const w = arena(line(), { noBasic: true });
    moveOf(w, 0).knobs.pierce = Infinity;
    const events = [...press(w, 0), ...run(w, 1.5)];
    expect(w.monsters.every(damaged)).toBe(true);
    expect(explodes(events)).toBe(3);
  });

  it('a spawn without a count takes it from pierce: all when piercing, else none', () => {
    const w = arena([], { noBasic: true });
    const ctx = makeCtx(registry, w, []);
    const shot = (pierce: boolean) =>
      spawnProjectile(ctx, {
        owner: 'hero',
        form: null,
        ability: null,
        homingId: null,
        x: 13,
        y: 35,
        vx: 0,
        vy: -13,
        radius: 0.3,
        damage: 10,
        element: 'fire',
        pierce,
        maxDist: 5,
        explodeRadius: 0,
        applies: [],
        knockback: 0,
      });
    expect(shot(true).pierceLeft).toBe(Infinity);
    expect(shot(false).pierceLeft).toBe(0);
  });
});

describe('data: runes', () => {
  const runes = registry.getRunes();

  it("loads the spec's 14 runes in its order, each with five tiers", () => {
    expect(runes.map((r) => r.id)).toEqual([
      'split',
      'multishot',
      'pierce',
      'chain',
      'widen',
      'quick',
      'echo',
      'heavy',
      'saturate',
      'linger',
      'volatile',
      'leech',
      'drain',
      'guard',
    ]);
    expect(runes.map((r) => r.family)).toEqual([
      ...Array(5).fill('shape'),
      ...Array(3).fill('tempo'),
      ...Array(3).fill('elemental'),
      ...Array(3).fill('sustain'),
    ]);
    for (const r of runes) expect(r.tiers).toHaveLength(5);
  });

  it('fits only real forms and weapon bases', () => {
    const forms = new Set(registry.getArpgData().forms.map((f) => f.id));
    const weapons = new Set(registry.getGearBasesForSlot('weapon').map((b) => b.id));
    for (const r of runes) {
      for (const f of r.fits.forms) expect(forms.has(f)).toBe(true);
      for (const w of r.fits.weapons) expect(weapons.has(w)).toBe(true);
    }
  });

  it("holds the spec's tier tables", () => {
    const at = (id: string) => registry.getRune(id).tiers;
    expect(at('multishot').map((t) => t.extraShots)).toEqual([
      { count: 1, power: 0.65 },
      { count: 1, power: 0.6875 },
      { count: 1, power: 0.725 },
      { count: 2, power: 0.7625 },
      { count: 2, power: 0.8 },
    ]);
    // The balance pass: Pierce passes fewer foes at a steeper cut, Chain jumps less, Widen grows less.
    expect(at('pierce')).toEqual([
      { pierce: 1, power: 0.6 },
      { pierce: 1, power: 0.625 },
      { pierce: 1, power: 0.65 },
      { pierce: 2, power: 0.675 },
      { pierce: 2, power: 0.7 },
    ]);
    expect(at('chain').map((t) => t.chain)).toEqual([1, 1, 1, 2, 2]);
    expect(at('widen')).toEqual([1.05, 1.1, 1.15, 1.2, 1.25].map((area) => ({ area, power: 0.9 })));
    expect(at('heavy')[2]).toEqual({
      power: 1.3,
      applies: ['stagger'],
      quick: { beat: 1.2, windup: 1.2 },
    });
    expect(at('quick')[4]).toEqual({ quick: { beat: 0.7, cooldown: 0.7 }, power: 0.9 });
    expect(at('saturate').map((t) => t.stacksBonus)).toEqual([1, 1, 1, 2, 2]);
    expect(at('volatile').map((t) => t.catalyst)).toEqual([0.15, 0.2375, 0.325, 0.4125, 0.5]);
    expect(at('guard').map((t) => t.guardOnLand)).toEqual([0.03, 0.0425, 0.055, 0.0675, 0.08]);
    expect(at('linger')[0]).toEqual({ zone: { seconds: 1.5, tickPower: 0.2, perCast: 3 } });
    expect(registry.getRune('linger').fits.kinds).toEqual(['heavy', 'hold']);
    expect(registry.getRune('pierce').fits).toEqual({
      forms: ['bolt', 'volley'],
      weapons: ['staff', 'wand'],
    });
  });

  it('finds a rune by id, and refuses an unknown one', () => {
    expect(registry.getRune('split')).toMatchObject({ name: 'Split', icon: '✳️', family: 'shape' });
    expect(registry.findRune('nope')).toBeUndefined();
    expect(() => registry.getRune('nope')).toThrow('Rune not found: nope');
  });

  it('refuses four tiers, an unknown family, a misspelled knob or a repeated id', () => {
    const [split, multishot] = runesData;
    const bad = (rows: unknown[]) => RunesSchema.safeParse(rows).success;
    expect(bad(runesData)).toBe(true);
    expect(bad([{ ...split, tiers: split.tiers.slice(0, 4) }])).toBe(false);
    expect(bad([{ ...split, family: 'arcane' }])).toBe(false);
    expect(bad([{ ...split, tiers: [...split.tiers.slice(1), { splitt: 1 }] }])).toBe(false);
    expect(bad([{ ...split, tiers: [...split.tiers.slice(1), { pierce: 0 }] }])).toBe(false);
    expect(bad([split, { ...multishot, id: 'split' }])).toBe(false);
  });
});

describe('balance: delve.runes', () => {
  it("loads the spec's numbers", () => {
    expect(bal.runes).toEqual({
      socketCap: { common: 1, uncommon: 1, magic: 2, rare: 2, epic: 3, legendary: 3 },
      socketLinks: [1, 2, 3],
      socketScrap: [20, 40, 60],
      socketDrops: {
        common: [0, 0],
        uncommon: [0, 0],
        magic: [0, 1],
        rare: [0, 1],
        epic: [1, 2],
        legendary: [2, 3],
      },
      unsocket: 'destroy',
      pullScrap: [15, 30, 50, 80, 120],
      fuseCount: 3,
      fuseScrap: [20, 40, 80, 160],
      dropChance: { normal: 0.03, elite: 0.15, boss: 1 },
      tierDepths: [1, 7, 13, 21, 31],
      tierUp: 0.2,
      echoDelay: 0.4,
      guardSeconds: 3,
      drainFoes: 5,
      drainShare: 0.5,
      shardSpeed: 12,
      shardRange: 4,
      // Pinned in delve-rune-costs.test.ts, which the rune costs build owns.
      load: expect.any(Object),
    });
  });

  it('refuses a cap past MAX_SOCKETS and price tables of the wrong length', () => {
    const withRunes = (runes: object) => ({
      ...balanceData,
      delve: { ...balanceData.delve, runes: { ...balanceData.delve.runes, ...runes } },
    });
    const ok = (runes: object) => BalanceConfigSchema.safeParse(withRunes(runes)).success;
    expect(ok({})).toBe(true);
    expect(ok({ socketCap: { ...balanceData.delve.runes.socketCap, legendary: 4 } })).toBe(false);
    expect(ok({ socketLinks: [1, 2] })).toBe(false);
    // A free socket would let a removal's flat 1-Link refund mint Links.
    expect(ok({ socketLinks: [0, 2, 3] })).toBe(false);
    expect(ok({ socketScrap: [20, 40, 60, 80] })).toBe(false);
    expect(ok({ pullScrap: [15, 30, 50, 80] })).toBe(false);
    expect(ok({ fuseScrap: [20, 40, 80, 160, 320] })).toBe(false);
    expect(ok({ unsocket: 'keep' })).toBe(false);
  });
});

describe('rune helpers: fit, act, knobs', () => {
  const rune = (id: string) => registry.getRune(id);

  it('fits the forms and the weapons it lists; unarmed fits none', () => {
    expect(runeFits(rune('split'), { form: 'bolt' })).toBe(true);
    expect(runeFits(rune('split'), { form: 'burst' })).toBe(false);
    expect(runeFits(rune('split'), { weapon: 'bow', kind: 'light' })).toBe(true);
    expect(runeFits(rune('split'), { weapon: 'sword', kind: 'light' })).toBe(false);
    expect(runeFits(rune('chain'), { weapon: null, kind: 'light' })).toBe(false);
  });

  it("acts only on its kinds' blows, and Pierce not on a row that bursts", () => {
    expect(runeActive(rune('linger'), { weapon: 'sword', kind: 'heavy' })).toBe(true);
    expect(runeActive(rune('linger'), { weapon: 'sword', kind: 'light' })).toBe(false);
    expect(runeFits(rune('linger'), { weapon: 'sword', kind: 'light' })).toBe(true);
    expect(runeActive(rune('linger'), { form: 'bolt' })).toBe(true);
    expect(runeActive(rune('pierce'), { weapon: 'staff', kind: 'light' })).toBe(true);
    expect(runeActive(rune('pierce'), { weapon: 'staff', kind: 'medium', explode: true })).toBe(
      false,
    );
    expect(runeActive(rune('chain'), { weapon: 'staff', kind: 'medium', explode: true })).toBe(
      true,
    );
    expect(runeActive(rune('split'), { form: 'burst' })).toBe(false);
  });

  it('gives the knobs of the runes acting, in socket order, skipping empty, unknown and dormant ones', () => {
    const runes: (RuneRef | null)[] = [
      { id: 'chain', tier: 3 },
      null,
      { id: 'ghost', tier: 1 },
      { id: 'linger', tier: 2 },
      { id: 'quick', tier: 1 },
    ];
    const light = runeKnobs(registry, runes, { weapon: 'sword', kind: 'light' });
    expect(light.active).toEqual([
      { id: 'chain', tier: 3 },
      { id: 'quick', tier: 1 },
    ]);
    expect(light.knobs).toEqual([rune('chain').tiers[2], rune('quick').tiers[0]]);
    const heavy = runeKnobs(registry, runes, { weapon: 'sword', kind: 'heavy' });
    expect(heavy.active.map((r) => r.id)).toEqual(['chain', 'linger', 'quick']);
    expect(runeKnobs(registry, undefined, { form: 'bolt' })).toEqual({ knobs: [], active: [] });
  });

  it("cuts Multi-shot's shots in full, by half on a Volley, not at all on a Barrage", () => {
    expect(extraShotPower(0.65, 'bolt')).toBe(0.65);
    expect(extraShotPower(0.65, null)).toBe(0.65);
    expect(extraShotPower(0.65, 'volley')).toBeCloseTo(0.825);
    expect(extraShotPower(0.65, 'barrage')).toBe(1);
  });
});

describe('rune helpers: text', () => {
  const text = (id: string, tier: RuneTier, on?: Parameters<typeof runeText>[2]) =>
    runeText(registry, { id, tier }, on);

  it('fills the templates: plain values, percentages and signed changes', () => {
    expect(text('split', 1)).toMatchObject({
      effect: 'Splits into 2 shards on hit, each at 30% power',
      tradeoff: null,
    });
    expect(text('split', 4).effect).toBe('Splits into 3 shards on hit, each at 45% power');
    expect(text('quick', 3)).toMatchObject({
      effect: 'Beat −20%, cooldown −20%',
      tradeoff: 'Power −10%',
    });
    expect(text('heavy', 2)).toMatchObject({
      effect: 'Power +22.5%, and it staggers',
      tradeoff: 'Beat and wind-up +20%',
    });
    expect(text('guard', 2).effect).toBe('On landing, a 3 s shield of 4.25% max life');
    expect(text('drain', 2).effect).toBe(
      '+1.5 mana per foe hit, up to 5 foe-hits and 50% of its mana cost a cast',
    );
    expect(text('echo', 1).effect).toBe('Repeats 0.4 s later at 30% power');
  });

  it('words Multi-shot by the move: the cut in full, halved on a Volley, none on a Barrage', () => {
    expect(text('multishot', 2)).toMatchObject({
      effect: 'Extra shots: +1',
      tradeoff: 'Each shot at 68.75% power',
    });
    expect(text('multishot', 2, { form: 'volley' }).tradeoff).toBe('Each shot at 84.375% power');
    expect(text('multishot', 2, { form: 'barrage' }).tradeoff).toBeNull();
    expect(text('multishot', 2, { weapon: 'bow', kind: 'light' }).tradeoff).toBe(
      'Each shot at 68.75% power',
    );
  });

  it("fills every rune's templates at every tier", () => {
    for (const def of registry.getRunes())
      for (const tier of [1, 2, 3, 4, 5] as RuneTier[]) {
        const t = runeText(registry, { id: def.id, tier });
        expect(t.effect).not.toMatch(/[{}]/);
        expect(t.tradeoff === null).toBe(def.tradeoff === null);
        if (t.tradeoff) expect(t.tradeoff).not.toMatch(/[{}]/);
      }
  });
});

describe('rune helpers: costs (the rune costs spec)', () => {
  /**
   * A fresh registry whose load factors are all 1, or `over`'s, and whose Echo row is the
   * spec's, so no tuning of the data moves these texts.
   */
  const priced = (over: object = {}) => {
    const r = engine.createDefaultRegistry();
    Object.assign(
      r.getDelveBalance().runes.load,
      { bySlot: { primary: 1, defensive: 1, ultimate: 1 }, byForm: {}, charge: 1, cast: 1 },
      over,
    );
    r.getRune('echo').load = [0.27, 0.36, 0.45, 0.54, 0.63];
    return r;
  };
  const echo3: RuneRef = { id: 'echo', tier: 3 };
  const bolt = { form: 'bolt' } as const;

  it("prices a rune on a move in its chain's payment", () => {
    const r = priced();
    expect(runeText(r, echo3, bolt, { payment: 'mana' }).cost).toBe('+45% cost');
    expect(runeText(r, echo3, bolt, { payment: 'charge' }).cost).toBe('+45% charge');
    expect(runeText(r, echo3, bolt, { payment: 'cast' }).cost).toBe('+45% cast wind-up, +45% cost');
    expect(runeText(r, echo3, bolt).cost).toBe('+45% cost');
  });

  it("shows the eased figure when the move's ease is known, else the raw one", () => {
    const r = priced();
    expect(runeText(r, echo3, bolt, { payment: 'mana', ease: 0.45 }).cost).toBe('+25% cost');
    expect(runeText(r, echo3, bolt, { payment: 'mana', ease: 0 }).cost).toBe('+45% cost');
  });

  it("applies the slot's and the form's factors, and the payment's conversions", () => {
    const r = priced({
      bySlot: { primary: 0.5, defensive: 1, ultimate: 1 },
      byForm: { bolt: 4 },
      charge: 2,
      cast: 2,
    });
    expect(runeText(r, echo3, bolt, { payment: 'mana' }).cost).toBe('+90% cost');
    const nova = { form: 'nova' } as const;
    expect(runeText(r, echo3, nova, { payment: 'mana' }).cost).toBe('+45% cost');
    expect(runeText(r, echo3, nova, { payment: 'charge' }).cost).toBe('+90% charge');
    expect(runeText(r, echo3, nova, { payment: 'cast' }).cost).toBe('+90% cast wind-up, +45% cost');
  });

  it("prices the pouch (no target) at its tier's raw load: no factor, no ease", () => {
    const r = priced({ bySlot: { primary: 0, defensive: 0, ultimate: 0 }, byForm: { bolt: 4 } });
    expect(runeText(r, echo3).cost).toBe('+45% cost');
    expect(runeText(r, { id: 'echo', tier: 5 }, undefined, { ease: 0.6 }).cost).toBe('+63% cost');
  });

  it('names no cost on a blow, nor where the share comes to 0', () => {
    const r = priced({ bySlot: { primary: 0, defensive: 1, ultimate: 1 } });
    const blow = { weapon: 'sword', kind: 'heavy' } as const;
    expect(runeText(r, echo3, blow, { payment: 'mana' }).cost).toBeNull();
    expect(runeText(r, echo3, bolt, { payment: 'mana' }).cost).toBeNull();
    expect(runeText(r, echo3, { form: 'nova' }, { payment: 'mana' }).cost).toBe('+45% cost');
  });

  it("words a move's total load by its payment, in whole percentages", () => {
    const r = priced();
    expect(loadText(r, 1.0725, 'mana')).toBe('+107% cost');
    expect(loadText(r, 1.0725)).toBe('+107% cost');
    expect(loadText(r, 1.0725, 'charge')).toBe('+107% charge');
    expect(loadText(r, 1.0725, 'cast')).toBe('+107% cast wind-up, +107% cost');
  });
});

describe('rune helpers: sockets and the pouch', () => {
  it("caps a move's sockets by its weapon's rarity; unarmed has none", () => {
    expect(socketCap(registry, 'common')).toBe(1);
    expect(socketCap(registry, 'rare')).toBe(2);
    expect(socketCap(registry, 'legendary')).toBe(3);
    expect(socketCap(registry, null)).toBe(0);
  });

  it('prices the next socket by the sockets the move has, none past MAX_SOCKETS', () => {
    expect(socketPrice(registry, 0)).toEqual({ links: 1, scrap: 20 });
    expect(socketPrice(registry, 2)).toEqual({ links: 3, scrap: 60 });
    expect(socketPrice(registry, 3)).toBeNull();
  });

  it('counts, adds and takes runes by id and tier without changing the pouch it is given', () => {
    const pouch: RunePouch = { split: [1, 0, 0, 0, 0] };
    const more = addToPouch(pouch, [
      { id: 'split', tier: 1 },
      { id: 'quick', tier: 3 },
      { id: 'quick', tier: 3 },
    ]);
    expect(pouch).toEqual({ split: [1, 0, 0, 0, 0] });
    expect(more).toEqual({ split: [2, 0, 0, 0, 0], quick: [0, 0, 2, 0, 0] });
    expect(pouchCount(more, { id: 'quick', tier: 3 })).toBe(2);
    expect(pouchCount(more, { id: 'echo', tier: 1 })).toBe(0);
    expect(takeFromPouch(more, [{ id: 'quick', tier: 3 }])).toEqual({
      split: [2, 0, 0, 0, 0],
      quick: [0, 0, 1, 0, 0],
    });
    expect(takeFromPouch(more, [{ id: 'split', tier: 2 }])).toBeNull();
    expect(takeFromPouch(more, [{ id: 'split', tier: 7 as RuneTier }])).toBeNull();
    expect(
      takeFromPouch(pouch, [
        { id: 'split', tier: 1 },
        { id: 'split', tier: 1 },
      ]),
    ).toBeNull();
  });

  it('reads a move without runes as no sockets', () => {
    expect(socketsOf({ kind: 'light', element: 'fire' })).toEqual([]);
    const runes = [{ id: 'chain', tier: 1 as const }, null];
    expect(socketsOf({ kind: 'light', form: 'bolt', elements: ['fire'], runes })).toBe(runes);
  });
});

describe('the sim and the index: the contract is in place', () => {
  it('sets up a world and a hero with no echoes, no runes pending, nothing drained and a rune stream', () => {
    const w = arena([dummy(13, 30)]);
    expect(w.echoes).toEqual([]);
    expect(w.pending.runes).toEqual([]);
    expect(w.hero.drained).toEqual([0, 0, 0, 0]);
    expect(w.runeRng).toBeInstanceOf(SeededRNG);
    expect(w.runeRng).not.toBe(w.lootRng);
  });

  it('exports every new module and symbol from the package index', () => {
    for (const name of [
      'NEUTRAL',
      'moveBeat',
      'knobHitOpts',
      'guardLand',
      'queueEcho',
      'echoTick',
      'dropRune',
      'runeFits',
      'runeActive',
      'runeKnobs',
      'runeText',
      'extraShotPower',
      'socketCap',
      'socketPrice',
      'pouchCount',
      'addToPouch',
      'takeFromPouch',
      'socketsOf',
      'runeTierAt',
      'rollRuneDrop',
      'rollSockets',
      'weaponParts',
      'unsocketMode',
      'runeChange',
      'draftPrice',
      'openSocket',
      'socketRune',
      'fusePrice',
      'fuseRunes',
      'RUNE_TIERS',
      'MAX_SOCKETS',
      'RUNE_FAMILIES',
    ])
      expect(engine, name).toHaveProperty(name);
  });
});

describe('save v9: sockets and the pouch', () => {
  const json = (x: unknown) => JSON.parse(JSON.stringify(x));
  const fresh = () => createDelveProfile(registry, 1, { primary: 'fire' });
  const bolt = (runes: (RuneRef | null)[]): Move => ({
    kind: 'medium',
    form: 'bolt',
    elements: ['fire'],
    runes,
  });
  /** A rare weapon: two sockets a move. */
  const rare = (p: DelveProfile): DelveProfile => ({
    ...p,
    equipped: { ...p.equipped, weapon: { ...p.equipped.weapon!, rarity: 'rare' } },
  });

  it('a new profile is version 10 with an empty pouch; a version 6 or 7 save resets', () => {
    const p = fresh();
    expect(p).toMatchObject({ version: 10, runes: {} });
    const { runes: _runes, ...v6 } = p;
    expect(parseDelveProfile(registry, json({ ...v6, version: 6 }))).toEqual({ reset: true });
    expect(parseDelveProfile(registry, json({ ...p, version: 7 }))).toEqual({ reset: true });
  });

  it('round-trips sockets, empty ones included, and the pouch', () => {
    const p = {
      ...withChains(rare(fresh()), {
        primary: { moves: [bolt([{ id: 'chain', tier: 2 }, null])], payment: 'mana' },
      }),
      runes: { quick: [0, 1, 0, 0, 0] },
    };
    const res = parseDelveProfile(registry, json(p))!;
    expect(chainsOf(res.profile).primary!.moves[0].runes).toEqual([{ id: 'chain', tier: 2 }, null]);
    expect(res.profile.runes).toEqual({ quick: [0, 1, 0, 0, 0] });
    expect(parseDelveProfile(registry, json(res.profile))).toEqual(res);
  });

  it('empties unknown and repeated runes and trims sockets past the cap: a Link each, the runes destroyed', () => {
    const p = {
      ...withChains(rare(fresh()), {
        primary: {
          moves: [
            bolt([
              { id: 'ghost', tier: 1 },
              { id: 'chain', tier: 1 },
            ]),
            bolt([
              { id: 'quick', tier: 2 },
              { id: 'quick', tier: 3 },
              { id: 'echo', tier: 1 },
            ]),
          ],
          payment: 'mana',
        },
      }),
      runes: { ghost: [1, 0, 0, 0, 0], echo: [0, 0, 1, 0, 0] },
    };
    const res = parseDelveProfile(registry, json(p))!;
    expect(chainsOf(res.profile).primary!.moves.map((m) => m.runes)).toEqual([
      [null, { id: 'chain', tier: 1 }],
      [{ id: 'quick', tier: 2 }, null],
    ]);
    expect(res.profile.links).toBe(p.links + 1);
    // The trimmed Quick III and Echo I are destroyed: the pouch keeps only its own Echo.
    expect(res.profile.runes).toEqual({ echo: [0, 0, 1, 0, 0] });
  });

  it("in 'pay' mode the runes a trim takes off go back to the pouch", () => {
    const p = {
      ...withChains(fresh(), {
        primary: {
          moves: [
            bolt([
              { id: 'quick', tier: 2 },
              { id: 'echo', tier: 1 },
            ]),
          ],
          payment: 'mana',
        },
      }),
      runes: { echo: [0, 0, 1, 0, 0] },
    };
    bal.runes.unsocket = 'pay';
    try {
      const res = parseDelveProfile(registry, json(p))!;
      expect(chainsOf(res.profile).primary!.moves[0].runes).toEqual([{ id: 'quick', tier: 2 }]);
      expect(res.profile.links).toBe(p.links + 1);
      expect(res.profile.runes).toEqual({ echo: [1, 0, 1, 0, 0] });
    } finally {
      bal.runes.unsocket = 'destroy';
    }
  });

  it("a chain the weapon can't carry takes its sockets with it: a Link each, its runes by the rule", () => {
    // A common sword carries no Defensive.
    const ward: Move = {
      kind: 'medium',
      form: 'ward',
      elements: ['fire'],
      runes: [{ id: 'guard', tier: 1 }, null],
    };
    const p = withChains(fresh(), { defensive: { moves: [ward], payment: 'mana' } });
    const res = parseDelveProfile(registry, json(p))!;
    expect(res.profile.equipped.weapon!.moveset!.chains.defensive).toBeUndefined();
    expect(res.profile.links).toBe(p.links + 2);
    expect(res.profile.runes).toEqual({});
  });

  it('refuses more than MAX_SOCKETS sockets, a tier past V, or a pouch row of other than five counts', () => {
    const p = fresh();
    const four = withChains(rare(p), {
      primary: { moves: [bolt([null, null, null, null])], payment: 'mana' },
    });
    const tierSix = withChains(rare(p), {
      primary: { moves: [bolt([{ id: 'chain', tier: 6 as RuneTier }])], payment: 'mana' },
    });
    expect(parseDelveProfile(registry, json(four))).toBeNull();
    expect(parseDelveProfile(registry, json(tierSix))).toBeNull();
    expect(parseDelveProfile(registry, json({ ...p, runes: { chain: [1, 0, 0] } }))).toBeNull();
  });

  it("starts a dive with no runes earned; a dive saved without the count loads with 0, and a stop may offer 'rune'", () => {
    const p = startDive(registry, fresh(), 1);
    expect(p.dive!.runesEarned).toBe(0);
    const { runesEarned: _r, ...dive } = p.dive!;
    const stop = { offers: ['rune'], taken: false };
    const res = parseDelveProfile(registry, json({ ...p, dive: { ...dive, stop } }))!;
    expect(res.profile.dive).toMatchObject({ runesEarned: 0, stop });
  });

  it("doesn't offer the 'rune' stop yet, and the ops that can return runes return none", () => {
    const p = fresh();
    expect(stopKinds(registry, p)).not.toContain('rune');
    expect(salvageItems(registry, p, [])).toMatchObject({ runes: [], destroyed: [] });
    expect(addLootToBag(registry, p, [])).toMatchObject({ runes: [], destroyed: [] });
  });

  it("exports the save's rune schemas", () => {
    expect(engine.RuneRefSchema.safeParse({ id: 'split', tier: 3 }).success).toBe(true);
    expect(engine.RunePouchSchema.safeParse({ split: [0, 1, 0, 0, 0] }).success).toBe(true);
  });
});
