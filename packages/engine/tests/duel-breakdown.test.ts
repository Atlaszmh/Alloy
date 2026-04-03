import { simulate } from '../src/duel/duel-engine.js';
import { createEmptyDerivedStats } from '../src/types/derived-stats.js';
import type { DerivedStats } from '../src/types/derived-stats.js';
import type { CombatEvent } from '../src/types/combat.js';
import type { DamageBreakdown, HealBreakdown } from '../src/types/damage-breakdown.js';
import { createEmptyLoadout } from '../src/types/item.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);

function makeStats(overrides: Partial<DerivedStats> = {}): DerivedStats {
  const base = createEmptyDerivedStats();
  base.maxHP = 200;
  return { ...base, ...overrides };
}

function makeLoadouts(): [ReturnType<typeof createEmptyLoadout>, ReturnType<typeof createEmptyLoadout>] {
  return [createEmptyLoadout('sword', 'chainmail'), createEmptyLoadout('sword', 'chainmail')];
}

function allEvents(log: ReturnType<typeof simulate>): CombatEvent[] {
  return log.frames.flatMap((f) => f.events);
}

describe('Duel Breakdown Integration', () => {
  it('attack events have breakdown with physical and totalNet fields', () => {
    const attacker = makeStats({ maxHP: 200, physicalDamage: 25, attackSpeed: 0.5 });
    const defender = makeStats({ maxHP: 500, physicalDamage: 1, attackSpeed: 2.0 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);

    const log = simulate([attacker, defender], loadouts, registry, rng, 1);
    const events = allEvents(log);

    const attacks = events.filter(
      (e): e is Extract<CombatEvent, { type: 'attack' }> => e.type === 'attack' && e.attacker === 0,
    );

    expect(attacks.length).toBeGreaterThan(0);

    for (const atk of attacks) {
      expect(atk.breakdown).toBeDefined();
      expect(atk.breakdown.physical).toBeDefined();
      expect(typeof atk.breakdown.physical.raw).toBe('number');
      expect(typeof atk.breakdown.physical.net).toBe('number');
      expect(typeof atk.breakdown.totalNet).toBe('number');
      expect(typeof atk.breakdown.totalRaw).toBe('number');
      expect(typeof atk.breakdown.isCrit).toBe('boolean');
      expect(typeof atk.breakdown.dodged).toBe('boolean');
    }
  });

  it('non-dodged attack breakdown has positive physical damage', () => {
    const attacker = makeStats({ maxHP: 200, physicalDamage: 30, attackSpeed: 0.5 });
    const defender = makeStats({ maxHP: 500, physicalDamage: 1, attackSpeed: 2.0, armor: 0 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);

    const log = simulate([attacker, defender], loadouts, registry, rng, 1);
    const events = allEvents(log);

    const nonDodgedAttacks = events.filter(
      (e): e is Extract<CombatEvent, { type: 'attack' }> =>
        e.type === 'attack' && e.attacker === 0 && !e.breakdown.dodged,
    );

    expect(nonDodgedAttacks.length).toBeGreaterThan(0);
    for (const atk of nonDodgedAttacks) {
      expect(atk.breakdown.physical.raw).toBeGreaterThan(0);
      expect(atk.breakdown.totalNet).toBeGreaterThan(0);
    }
  });

  it('dodged attack breakdown has totalNet = 0', () => {
    const attacker = makeStats({ maxHP: 200, physicalDamage: 30, attackSpeed: 0.5 });
    const defender = makeStats({ maxHP: 500, physicalDamage: 1, attackSpeed: 2.0, dodgeChance: 100 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);

    const log = simulate([attacker, defender], loadouts, registry, rng, 1);
    const events = allEvents(log);

    const attacks = events.filter(
      (e): e is Extract<CombatEvent, { type: 'attack' }> => e.type === 'attack' && e.attacker === 0,
    );

    expect(attacks.length).toBeGreaterThan(0);
    for (const atk of attacks) {
      expect(atk.breakdown.dodged).toBe(true);
      expect(atk.breakdown.totalNet).toBe(0);
    }
  });

  it('crit attack has isCrit = true in breakdown', () => {
    const attacker = makeStats({ maxHP: 200, physicalDamage: 20, attackSpeed: 0.5, critChance: 100 });
    const defender = makeStats({ maxHP: 1000, physicalDamage: 1, attackSpeed: 2.0 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);

    const log = simulate([attacker, defender], loadouts, registry, rng, 1);
    const events = allEvents(log);

    const attacks = events.filter(
      (e): e is Extract<CombatEvent, { type: 'attack' }> =>
        e.type === 'attack' && e.attacker === 0 && !e.breakdown.dodged,
    );

    expect(attacks.length).toBeGreaterThan(0);
    for (const atk of attacks) {
      expect(atk.breakdown.isCrit).toBe(true);
      // With 150% crit multiplier (default), raw should be 30 (20 * 1.5)
      expect(atk.breakdown.physical.raw).toBe(30);
    }
  });

  it('heal events from lifesteal have source: lifesteal', () => {
    const attacker = makeStats({
      maxHP: 200,
      physicalDamage: 30,
      attackSpeed: 0.5,
      lifestealPercent: 50,
    });
    const defender = makeStats({ maxHP: 500, physicalDamage: 5, attackSpeed: 1.0 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);

    const log = simulate([attacker, defender], loadouts, registry, rng, 1);
    const events = allEvents(log);

    const healEvents = events.filter(
      (e): e is Extract<CombatEvent, { type: 'heal' }> =>
        e.type === 'heal' && e.player === 0 && e.breakdown.source === 'lifesteal',
    );

    expect(healEvents.length).toBeGreaterThan(0);
    for (const heal of healEvents) {
      expect(heal.breakdown.source).toBe('lifesteal');
      expect(heal.breakdown.rawHeal).toBeGreaterThan(0);
      expect(heal.breakdown.effectiveHeal).toBeGreaterThanOrEqual(0);
      expect(heal.breakdown.overheal).toBeGreaterThanOrEqual(0);
    }
  });

  it('heal events from regen have source: regen', () => {
    const stats = makeStats({
      maxHP: 200,
      physicalDamage: 5,
      attackSpeed: 1.0,
      hpRegen: 2,
    });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);

    const log = simulate([stats, { ...stats }], loadouts, registry, rng, 1);
    const events = allEvents(log);

    const regenHeals = events.filter(
      (e): e is Extract<CombatEvent, { type: 'heal' }> =>
        e.type === 'heal' && e.breakdown.source === 'regen',
    );

    expect(regenHeals.length).toBeGreaterThan(0);
    for (const heal of regenHeals) {
      expect(heal.breakdown.rawHeal).toBe(2);
      expect(heal.breakdown.effectiveHeal).toBeGreaterThanOrEqual(0);
      expect(heal.breakdown.effectiveHeal).toBeLessThanOrEqual(2);
    }
  });

  it('HP changes sum correctly with attack breakdown totalNet', () => {
    const attacker = makeStats({ maxHP: 200, physicalDamage: 25, attackSpeed: 0.5 });
    const defender = makeStats({ maxHP: 500, physicalDamage: 1, attackSpeed: 2.0, armor: 0 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);

    const log = simulate([attacker, defender], loadouts, registry, rng, 1);

    // For each frame, check that attack breakdown totalNet matches HP drop
    // (when no barrier is involved)
    for (const frameData of log.frames) {
      const attacks = frameData.events.filter(
        (e): e is Extract<CombatEvent, { type: 'attack' }> =>
          e.type === 'attack' && e.attacker === 0 && !e.breakdown.dodged,
      );
      const hpDrops = frameData.events.filter(
        (e): e is Extract<CombatEvent, { type: 'hp_change' }> =>
          e.type === 'hp_change' && e.player === 1 && e.newHP < e.oldHP,
      );

      if (attacks.length === 1 && hpDrops.length === 1) {
        const netDamage = attacks[0].breakdown.totalNet - attacks[0].breakdown.barrierAbsorbed;
        const hpDrop = hpDrops[0].oldHP - hpDrops[0].newHP;
        // HP drop should equal totalNet minus barrier absorbed
        // (may differ if defender HP is low enough to cap at 0)
        expect(hpDrop).toBeLessThanOrEqual(netDamage);
        expect(hpDrop).toBeGreaterThan(0);
      }
    }
  });

  it('blocked attack has breakdown.blocked > 0', () => {
    const attacker = makeStats({ maxHP: 200, physicalDamage: 20, attackSpeed: 0.5 });
    const blocker = makeStats({
      maxHP: 500,
      physicalDamage: 1,
      attackSpeed: 2.0,
      blockChance: 100,
      blockAmount: 10,
    });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);

    const log = simulate([attacker, blocker], loadouts, registry, rng, 1);
    const events = allEvents(log);

    const attacks = events.filter(
      (e): e is Extract<CombatEvent, { type: 'attack' }> =>
        e.type === 'attack' && e.attacker === 0 && !e.breakdown.dodged,
    );

    expect(attacks.length).toBeGreaterThan(0);
    for (const atk of attacks) {
      expect(atk.breakdown.blocked).toBe(10);
      // totalNet should be raw - mitigated - blocked
      expect(atk.breakdown.totalNet).toBe(atk.breakdown.physical.net - 10);
    }
  });

  it('barrier absorption is recorded in breakdown.barrierAbsorbed', () => {
    const attacker = makeStats({ maxHP: 200, physicalDamage: 30, attackSpeed: 0.5 });
    const shielded = makeStats({
      maxHP: 200,
      physicalDamage: 1,
      attackSpeed: 2.0,
      barrierAmount: 100,
    });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(33);

    const log = simulate([attacker, shielded], loadouts, registry, rng, 1);
    const events = allEvents(log);

    const attacks = events.filter(
      (e): e is Extract<CombatEvent, { type: 'attack' }> =>
        e.type === 'attack' && e.attacker === 0 && !e.breakdown.dodged,
    );

    // At least one attack should have barrierAbsorbed > 0
    const barrierAttacks = attacks.filter((a) => a.breakdown.barrierAbsorbed > 0);
    expect(barrierAttacks.length).toBeGreaterThan(0);

    // First hit should be fully absorbed (30 damage < 100 barrier)
    expect(barrierAttacks[0].breakdown.barrierAbsorbed).toBe(30);
  });

  it('armor reduces physical net damage in breakdown', () => {
    const attacker = makeStats({ maxHP: 200, physicalDamage: 100, attackSpeed: 0.5 });
    const armored = makeStats({ maxHP: 500, physicalDamage: 1, attackSpeed: 2.0, armor: 50 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);

    const log = simulate([attacker, armored], loadouts, registry, rng, 1);
    const events = allEvents(log);

    const attacks = events.filter(
      (e): e is Extract<CombatEvent, { type: 'attack' }> =>
        e.type === 'attack' && e.attacker === 0 && !e.breakdown.dodged && !e.breakdown.isCrit,
    );

    expect(attacks.length).toBeGreaterThan(0);
    for (const atk of attacks) {
      expect(atk.breakdown.physical.raw).toBe(100);
      expect(atk.breakdown.physical.armorPoints).toBe(50);
      expect(atk.breakdown.physical.mitigated).toBe(50); // 50% reduction
      expect(atk.breakdown.physical.net).toBe(50);
      expect(atk.breakdown.totalNet).toBe(50);
    }
  });

  it('determinism is preserved with breakdown events', () => {
    const stats = makeStats({
      maxHP: 200,
      physicalDamage: 15,
      attackSpeed: 0.7,
      critChance: 20,
      dodgeChance: 10,
      lifestealPercent: 10,
      hpRegen: 1,
    });
    const loadouts = makeLoadouts();

    const log1 = simulate([{ ...stats }, { ...stats }], loadouts, registry, new SeededRNG(555), 1);
    const log2 = simulate([{ ...stats }, { ...stats }], loadouts, registry, new SeededRNG(555), 1);

    expect(log1.result).toEqual(log2.result);
    expect(log1.frames.length).toBe(log2.frames.length);

    // Check that every event matches
    for (let i = 0; i < log1.frames.length; i++) {
      expect(log1.frames[i].events.length).toBe(log2.frames[i].events.length);
      for (let j = 0; j < log1.frames[i].events.length; j++) {
        expect(log1.frames[i].events[j]).toEqual(log2.frames[i].events[j]);
      }
    }
  });
});
