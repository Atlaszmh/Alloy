import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { createMonster } from '../src/delve/monsters.js';
import {
  createFight,
  stepFight,
  triggerSlam,
  isSlamReady,
  slamChargeMax,
  healHeroInFight,
  refreshFightHero,
  runFightToEnd,
} from '../src/delve/combat.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { FightEvent, HeroStats, MonsterInstance } from '../src/types/delve.js';

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();

function hero(overrides: Partial<HeroStats> = {}): HeroStats {
  return { ...computeHeroStats({}, registry), ...overrides };
}

function monster(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    id: 'dummy',
    name: 'Dummy',
    icon: '?',
    kind: 'normal',
    depth: 1,
    biomeId: 'cinder_mines',
    maxHp: 100,
    damage: 5,
    attackInterval: 1,
    traits: [],
    ...overrides,
  };
}

function fight(h: HeroStats, m: MonsterInstance, seed = 1, phoenix = false) {
  return createFight(registry, { hero: h, monster: m, heroHpFrac: 1, depth: m.depth, phoenixAvailable: phoenix }, new SeededRNG(seed));
}

describe('createMonster', () => {
  it('is deterministic', () => {
    const a = createMonster(registry, { depth: 7, kind: 'elite', door: null }, new SeededRNG(3));
    const b = createMonster(registry, { depth: 7, kind: 'elite', door: null }, new SeededRNG(3));
    expect(a).toEqual(b);
  });

  it('uses the biome boss for bosses and scales them up', () => {
    const boss = createMonster(registry, { depth: 5, kind: 'boss', door: null }, new SeededRNG(1));
    expect(boss.id).toBe(registry.getBiomeForDepth(5).boss.id);
    const normal = createMonster(registry, { depth: 5, kind: 'normal', door: null }, new SeededRNG(1));
    expect(boss.maxHp).toBeGreaterThan(normal.maxHp * 3);
  });

  it('elites carry extra traits', () => {
    for (let s = 0; s < 20; s++) {
      const m = createMonster(registry, { depth: 3, kind: 'elite', door: null }, new SeededRNG(s));
      expect(m.traits.length).toBeGreaterThanOrEqual(bal.monster.elite.minTraits);
      expect(new Set(m.traits).size).toBe(m.traits.length);
    }
  });

  it('grows with depth and door modifiers', () => {
    const shallow = createMonster(registry, { depth: 1, kind: 'normal', door: null }, new SeededRNG(9));
    const deep = createMonster(registry, { depth: 20, kind: 'normal', door: null }, new SeededRNG(9));
    expect(deep.maxHp).toBeGreaterThan(shallow.maxHp * 5);
    const gilded = registry.getDoor('gilded');
    const tough = createMonster(registry, { depth: 1, kind: 'normal', door: gilded }, new SeededRNG(9));
    expect(tough.maxHp).toBeGreaterThan(shallow.maxHp);
  });
});

describe('stepFight', () => {
  it('is deterministic and independent of step size', () => {
    const h = hero({ weaponDamage: 12, critChance: 0.3, fireDamage: 3, coldDamage: 2, lightningDamage: 4 });
    const m = monster({ maxHp: 400, traits: ['regenerating'] });
    const a = fight(h, m, 42);
    const b = fight(h, m, 42);
    const eventsA: FightEvent[] = [];
    const eventsB: FightEvent[] = [];
    while (!a.over) eventsA.push(...stepFight(registry, a, 1 / 60));
    while (!b.over) eventsB.push(...stepFight(registry, b, 0.7));
    expect(eventsB).toEqual(eventsA);
    expect(a.heroHp).toBeCloseTo(b.heroHp);
    expect(a.winner).toBe(b.winner);
  });

  it('a geared hero beats a weak monster and emits a monster death', () => {
    const f = fight(hero({ weaponDamage: 30 }), monster({ maxHp: 60 }));
    const events = runFightToEnd(registry, f);
    expect(f.winner).toBe('hero');
    expect(events.at(-1)).toMatchObject({ kind: 'death', target: 'monster' });
  });

  it('a naked hero loses to a brutal monster', () => {
    const f = fight(hero(), monster({ maxHp: 5000, damage: 60 }));
    runFightToEnd(registry, f);
    expect(f.winner).toBe('monster');
    expect(f.heroHp).toBeLessThanOrEqual(0);
  });

  it('armored monsters take less physical damage', () => {
    const plain = fight(hero({ weaponDamage: 20, critChance: 0 }), monster({ maxHp: 1e6 }));
    const armored = fight(hero({ weaponDamage: 20, critChance: 0 }), monster({ maxHp: 1e6, traits: ['armored'] }));
    const first = (evs: FightEvent[]) => evs.find((e) => e.kind === 'hit' && e.source === 'hero') as Extract<FightEvent, { kind: 'hit' }>;
    const a = first(stepFight(registry, plain, 1));
    const b = first(stepFight(registry, armored, 1));
    expect(b.amount).toBeCloseTo(a.amount * (1 - bal.monster.traits.armoredReduction));
  });

  it('heal on kill restores life when the monster dies', () => {
    const f = fight(hero({ weaponDamage: 500, healOnKill: 0.2 }), monster({ maxHp: 10 }));
    f.heroHp = 10;
    const events = runFightToEnd(registry, f);
    expect(events.some((e) => e.kind === 'heal' && e.source === 'kill')).toBe(true);
    expect(f.heroHp).toBeGreaterThan(10);
  });

  it('bulwark blocks the first monster hit', () => {
    const f = fight(hero({ weaponDamage: 1, legendaries: { bulwark: 20 } }), monster({ maxHp: 1e6, damage: 10 }));
    const events = stepFight(registry, f, 3);
    const monsterHits = events.filter((e) => e.kind === 'hit' && e.source === 'monster') as Extract<FightEvent, { kind: 'hit' }>[];
    expect(monsterHits[0].blocked).toBe(true);
    expect(monsterHits[0].amount).toBe(0);
    expect(monsterHits.slice(1).every((h) => !h.blocked)).toBe(true);
  });

  it('phoenix plume revives once when available', () => {
    const f = fight(hero({ weaponDamage: 1, legendaries: { phoenix_plume: 50 } }), monster({ maxHp: 1e6, damage: 80 }), 1, true);
    const events = runFightToEnd(registry, f);
    expect(events.filter((e) => e.kind === 'revive')).toHaveLength(1);
    expect(f.phoenixUsed).toBe(true);
    expect(f.winner).toBe('monster');
  });

  it('phoenix does nothing when already spent this dive', () => {
    const f = fight(hero({ weaponDamage: 1, legendaries: { phoenix_plume: 50 } }), monster({ maxHp: 1e6, damage: 80 }), 1, false);
    const events = runFightToEnd(registry, f);
    expect(events.some((e) => e.kind === 'revive')).toBe(false);
  });

  it('twin fang adds an extra strike every third attack', () => {
    const f = fight(hero({ weaponDamage: 5, legendaries: { twin_fang: 100 } }), monster({ maxHp: 1e6, damage: 0.01 }));
    const events = stepFight(registry, f, 3.5);
    expect(events.filter((e) => e.kind === 'hit' && e.extra === 'twin')).toHaveLength(1);
  });
});

describe('slam & potions', () => {
  it('charges from hits, then deals a big stunning blow', () => {
    const f = fight(hero({ weaponDamage: 10, critChance: 0 }), monster({ maxHp: 1e6, damage: 1, attackInterval: 1 }));
    expect(isSlamReady(registry, f)).toBe(false);
    expect(triggerSlam(registry, f)).toEqual([]);
    while (!isSlamReady(registry, f)) stepFight(registry, f, 0.05);
    expect(f.slamCharge).toBe(slamChargeMax(registry, f));
    const before = f.monsterNextAttack;
    const hp = f.monsterHp;
    const events = triggerSlam(registry, f);
    expect(events[0]).toMatchObject({ kind: 'slam' });
    expect(hp - f.monsterHp).toBeCloseTo(10 * bal.slam.damageMult);
    expect(f.slamCharge).toBe(0);
    expect(f.monsterNextAttack).toBeGreaterThan(before);
  });

  it('seismic slam charges faster', () => {
    const f = fight(hero({ legendaries: { seismic_slam: 50 } }), monster());
    expect(slamChargeMax(registry, f)).toBeLessThan(bal.slam.chargeMax);
  });

  it('potions heal but never overheal', () => {
    const f = fight(hero(), monster());
    f.heroHp = 10;
    const ev = healHeroInFight(f, 0.4);
    expect(ev).toMatchObject({ kind: 'heal', source: 'potion' });
    expect(f.heroHp).toBeCloseTo(10 + f.hero.maxHp * 0.4);
    healHeroInFight(f, 5);
    expect(f.heroHp).toBe(f.hero.maxHp);
  });

  it('refreshing hero stats keeps the life fraction', () => {
    const f = fight(hero(), monster());
    f.heroHp = f.hero.maxHp / 2;
    refreshFightHero(f, hero({ maxHp: 400 }));
    expect(f.heroHp).toBeCloseTo(200);
  });
});
