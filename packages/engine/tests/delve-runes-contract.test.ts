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
import { makeCtx } from '../src/arpg/combat.js';
import { spawnProjectile } from '../src/arpg/abilities/targeting.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { MOVE_KINDS } from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import { arena, bal, damaged, dummy, moveOf, press, registry, run } from './fixtures/arena.js';

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
      { count: 2, power: 0.725 },
      { count: 2, power: 0.7625 },
      { count: 3, power: 0.8 },
    ]);
    expect(at('pierce')).toEqual([1, 2, 3, 4, 5].map((pierce) => ({ pierce, power: 0.9 })));
    expect(at('heavy')[2]).toEqual({
      power: 1.3,
      applies: ['stagger'],
      quick: { beat: 1.2, windup: 1.2 },
    });
    expect(at('quick')[4]).toEqual({ quick: { beat: 0.7, cooldown: 0.7 }, power: 0.9 });
    expect(at('saturate').map((t) => t.stacksBonus)).toEqual([1, 1, 1, 2, 2]);
    expect(at('volatile').map((t) => t.catalyst)).toEqual([0.15, 0.2375, 0.325, 0.4125, 0.5]);
    expect(at('guard').map((t) => t.guardOnLand)).toEqual([0.03, 0.0425, 0.055, 0.0675, 0.08]);
    expect(at('linger')[0]).toEqual({ zone: { seconds: 1.5, tickPower: 0.2 } });
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
      shardSpeed: 12,
      shardRange: 4,
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
    expect(ok({ socketScrap: [20, 40, 60, 80] })).toBe(false);
    expect(ok({ pullScrap: [15, 30, 50, 80] })).toBe(false);
    expect(ok({ fuseScrap: [20, 40, 80, 160, 320] })).toBe(false);
    expect(ok({ unsocket: 'keep' })).toBe(false);
  });
});
