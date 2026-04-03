import { simulate } from '../src/duel/duel-engine.js';
import { createGladiator } from '../src/duel/gladiator.js';
import { createEmptyDerivedStats } from '../src/types/derived-stats.js';
import type { DerivedStats } from '../src/types/derived-stats.js';
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

describe('Duel Engine', () => {
  // 1. Mirror determinism
  it('mirror match with same seed produces identical CombatLog', () => {
    const stats = makeStats({ maxHP: 200, physicalDamage: 10, attackSpeed: 1.0 });
    const statsArr: [DerivedStats, DerivedStats] = [stats, { ...stats }];
    const loadouts = makeLoadouts();

    const rng1 = new SeededRNG(42);
    const rng2 = new SeededRNG(42);

    const log1 = simulate(statsArr, loadouts, registry, rng1, 1);
    const log2 = simulate([{ ...stats }, { ...stats }], loadouts, registry, rng2, 1);

    expect(log1.result.winner).toBe(log2.result.winner);
    expect(log1.result.duration).toBe(log2.result.duration);
    expect(log1.result.finalHP).toEqual(log2.result.finalHP);
    expect(log1.frames.length).toBe(log2.frames.length);
  });

  // 2. One-shot kill
  it('high damage attacker kills low HP defender quickly', () => {
    const attacker = makeStats({ maxHP: 200, physicalDamage: 500, attackSpeed: 0.3 });
    const defender = makeStats({ maxHP: 50, physicalDamage: 1, attackSpeed: 1.0 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(99);

    const log = simulate([attacker, defender], loadouts, registry, rng, 1);

    expect(log.result.winner).toBe(0);
    expect(log.result.duration).toBeLessThan(2.0);
    expect(log.result.finalHP[1]).toBe(0);
  });

  // 3. HP regen heals
  it('gladiator with hpRegen gains HP each second', () => {
    const stats = makeStats({
      maxHP: 200,
      physicalDamage: 5,
      attackSpeed: 1.0,
      hpRegen: 1,
    });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(123);

    const log = simulate([stats, { ...stats }], loadouts, registry, rng, 1);

    // Look for hp_change events from regen (HP going up)
    const regenEvents = log.frames.flatMap((f) =>
      f.events.filter(
        (e) => e.type === 'hp_change' && e.newHP > e.oldHP,
      ),
    );
    expect(regenEvents.length).toBeGreaterThan(0);
  });

  // 4. Block prevents damage
  it('high blockChance gladiator blocks attacks', () => {
    const attacker = makeStats({ maxHP: 200, physicalDamage: 20, attackSpeed: 0.5 });
    const blocker = makeStats({ maxHP: 200, physicalDamage: 1, attackSpeed: 1.0, blockChance: 100, blockAmount: 9999 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(77);

    const log = simulate([attacker, blocker], loadouts, registry, rng, 1);

    const blockEvents = log.frames.flatMap((f) =>
      f.events.filter((e) => e.type === 'block'),
    );
    expect(blockEvents.length).toBeGreaterThan(0);

    // Blocker should take no damage since blockChance = 100 (100%)
    // (blocker is player 1)
    const hpDrops = log.frames.flatMap((f) =>
      f.events.filter(
        (e) => e.type === 'hp_change' && e.player === 1 && e.newHP < e.oldHP,
      ),
    );
    expect(hpDrops.length).toBe(0);
  });

  // 5. Dodge avoids damage
  it('high dodgeChance gladiator dodges attacks', () => {
    const attacker = makeStats({ maxHP: 200, physicalDamage: 20, attackSpeed: 0.5 });
    const dodger = makeStats({ maxHP: 200, physicalDamage: 1, attackSpeed: 1.0, dodgeChance: 100 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(55);

    const log = simulate([attacker, dodger], loadouts, registry, rng, 1);

    const dodgeEvents = log.frames.flatMap((f) =>
      f.events.filter((e) => e.type === 'dodge'),
    );
    expect(dodgeEvents.length).toBeGreaterThan(0);

    // Dodger should take no damage
    const hpDrops = log.frames.flatMap((f) =>
      f.events.filter(
        (e) => e.type === 'hp_change' && e.player === 1 && e.newHP < e.oldHP,
      ),
    );
    expect(hpDrops.length).toBe(0);
  });

  // 6. Lifesteal heals attacker
  it('lifesteal returns HP on damage dealt', () => {
    const attacker = makeStats({
      maxHP: 200,
      physicalDamage: 30,
      attackSpeed: 0.5,
      lifestealPercent: 50,
    });
    const defender = makeStats({ maxHP: 500, physicalDamage: 20, attackSpeed: 0.5 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(88);

    const log = simulate([attacker, defender], loadouts, registry, rng, 1);

    const lifestealEvents = log.frames.flatMap((f) =>
      f.events.filter((e) => e.type === 'lifesteal' && e.player === 0),
    );
    expect(lifestealEvents.length).toBeGreaterThan(0);
  });

  // 7. Thorns damages attacker
  it('defender with thorns damages attacker on hit', () => {
    const attacker = makeStats({ maxHP: 200, physicalDamage: 20, attackSpeed: 0.5 });
    const thorny = makeStats({ maxHP: 500, physicalDamage: 1, attackSpeed: 2.0, thornsDamage: 10 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(44);

    const log = simulate([attacker, thorny], loadouts, registry, rng, 1);

    const thornsEvents = log.frames.flatMap((f) =>
      f.events.filter((e) => e.type === 'thorns' && e.reflector === 1),
    );
    expect(thornsEvents.length).toBeGreaterThan(0);
  });

  // 8. Barrier absorbs first
  it('barrier absorbs damage before HP', () => {
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

    const barrierEvents = log.frames.flatMap((f) =>
      f.events.filter((e) => e.type === 'barrier_absorb' && e.player === 1),
    );
    expect(barrierEvents.length).toBeGreaterThan(0);

    // First hit should be fully absorbed by barrier (30 < 100)
    const firstBarrier = barrierEvents[0];
    if (firstBarrier.type === 'barrier_absorb') {
      expect(firstBarrier.absorbed).toBe(30);
      expect(firstBarrier.remaining).toBe(70);
    }
  });

  // 9. Max duration timeout
  it('if no one dies, tiebreaker determines winner by higher HP%', () => {
    // Both gladiators with tiny damage and huge HP — should time out
    const stats1 = makeStats({ maxHP: 10000, physicalDamage: 1, attackSpeed: 1.0 });
    const stats2 = makeStats({ maxHP: 10000, physicalDamage: 2, attackSpeed: 1.0 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(11);

    const log = simulate([stats1, stats2], loadouts, registry, rng, 1);

    expect(log.result.wasTiebreak).toBe(true);
    expect(log.result.duration).toBe(100);
  });

  // 10. Same seed = same result
  it('same seed produces identical results', () => {
    const stats = makeStats({ maxHP: 200, physicalDamage: 15, attackSpeed: 0.7 });
    const loadouts = makeLoadouts();

    const log1 = simulate([{ ...stats }, { ...stats }], loadouts, registry, new SeededRNG(777), 1);
    const log2 = simulate([{ ...stats }, { ...stats }], loadouts, registry, new SeededRNG(777), 1);

    expect(log1.result).toEqual(log2.result);
    expect(log1.frames.length).toBe(log2.frames.length);
  });

  // 11. Different seeds = potentially different results
  it('different seeds can produce different results', () => {
    const stats = makeStats({
      maxHP: 200,
      physicalDamage: 15,
      attackSpeed: 0.7,
      critChance: 30,
      dodgeChance: 20,
    });
    const loadouts = makeLoadouts();

    const results = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const log = simulate([{ ...stats }, { ...stats }], loadouts, registry, new SeededRNG(seed), 1);
      results.add(`${log.result.winner}-${log.result.duration}`);
    }

    // With randomness (crit, dodge), different seeds should yield at least some variation
    expect(results.size).toBeGreaterThan(1);
  });

  // Lifesteal barrier interaction
  it('lifesteal is based on HP damage dealt, not barrier-absorbed damage', () => {
    const atkStats = makeStats({
      maxHP: 100,
      physicalDamage: 50,
      attackSpeed: 1.0,
      lifestealPercent: 100,
    });
    const defStats = makeStats({
      maxHP: 200,
      physicalDamage: 10,
      attackSpeed: 2.0,
      barrierAmount: 1000,
    });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);
    const log = simulate([atkStats, defStats], loadouts, registry, rng, 1);

    const lifestealEvents = log.frames.flatMap(f =>
      f.events.filter((e): e is Extract<typeof e, { type: 'lifesteal' }> =>
        e.type === 'lifesteal' && e.player === 0
      )
    );
    const barrierAbsorbs = log.frames.flatMap(f =>
      f.events.filter((e): e is Extract<typeof e, { type: 'barrier_absorb' }> =>
        e.type === 'barrier_absorb'
      )
    );

    expect(barrierAbsorbs.length).toBeGreaterThan(0);
    // With 1000 barrier, early hits fully absorbed — lifesteal should be 0 for those
    // If incorrectly using totalDamage, every lifesteal event would show healed >= 50
    // With the fix, while barrier absorbs all damage, no lifesteal events should fire
    // (because damageToHP is 0)
    if (barrierAbsorbs.length > 5) {
      // Barrier absorbed many hits — lifesteal events should be fewer than attack events
      const attackEvents = log.frames.flatMap(f =>
        f.events.filter(e => e.type === 'attack' && e.attacker === 0)
      );
      expect(lifestealEvents.length).toBeLessThan(attackEvents.length);
    }
  });

  // Low HP trigger test
  it('gladiator crossing low HP threshold does not error', () => {
    const stats0 = makeStats({ maxHP: 100, physicalDamage: 5, attackSpeed: 1.0 });
    const stats1 = makeStats({ maxHP: 100, physicalDamage: 40, attackSpeed: 1.0 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(999);
    const log = simulate([stats0, stats1], loadouts, registry, rng, 1);
    expect(log.result.winner).toBe(1);
    expect(log.result.finalHP[0]).toBeLessThanOrEqual(0);
  });

  // Simultaneous death tiebreaker
  it('simultaneous death via thorns resolves to a winner', () => {
    const stats0 = makeStats({
      maxHP: 50,
      physicalDamage: 100,
      attackSpeed: 1.0,
      thornsDamage: 100,
    });
    const stats1 = makeStats({
      maxHP: 50,
      physicalDamage: 100,
      attackSpeed: 1.0,
      thornsDamage: 100,
    });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);

    const log = simulate([stats0, stats1], loadouts, registry, rng, 1);

    expect([0, 1]).toContain(log.result.winner);
    const deaths = log.frames.flatMap(f => f.events.filter(e => e.type === 'death'));
    expect(deaths.length).toBeGreaterThanOrEqual(1);
  });

  it('simultaneous death always produces a valid winner across many seeds', () => {
    for (let seed = 0; seed < 20; seed++) {
      const stats0 = makeStats({
        maxHP: 50,
        physicalDamage: 200,
        attackSpeed: 1.0,
        thornsDamage: 200,
      });
      const stats1 = makeStats({
        maxHP: 50,
        physicalDamage: 200,
        attackSpeed: 1.0,
        thornsDamage: 200,
      });
      const loadouts = makeLoadouts();
      const rng = new SeededRNG(seed);
      const log = simulate([stats0, stats1], loadouts, registry, rng, 1);
      expect([0, 1]).toContain(log.result.winner);
    }
  });

  // Regen timing: once per second, not per step
  it('regen fires once per second, not per step', () => {
    // Give opponent some damage so player 0 takes hits and has room to regen
    const regenGladiator = makeStats({
      maxHP: 500,
      physicalDamage: 1,
      attackSpeed: 100, // very slow, won't attack
      hpRegen: 10,
      initiative: 0,
    });
    const damager = makeStats({
      maxHP: 10000,
      physicalDamage: 5,
      attackSpeed: 0.5, // attacks frequently to keep HP below max
      initiative: 0,
    });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);
    const log = simulate([regenGladiator, damager], loadouts, registry, rng, 1);

    // Count heal events for player 0 — should be roughly 1 per second of combat
    const healEvents = log.frames.flatMap((f) =>
      f.events.filter((e) => e.type === 'heal' && e.player === 0),
    );
    // With 1/sec regen, expect roughly duel-duration heal events, not 10x that
    expect(healEvents.length).toBeLessThan(150);
    expect(healEvents.length).toBeGreaterThan(20);
  });

  // Attack timing: attackSpeed 2.0 fires at correct intervals
  it('attack at attackSpeed 2.0 fires at correct intervals', () => {
    const attacker = makeStats({ maxHP: 10000, physicalDamage: 10, attackSpeed: 2.0, initiative: 0 });
    const defender = makeStats({ maxHP: 10000, physicalDamage: 0, attackSpeed: 100, initiative: 0 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);
    const log = simulate([attacker, defender], loadouts, registry, rng, 1);

    const attackFrames = log.frames
      .filter((f) => f.events.some((e) => e.type === 'attack' && e.attacker === 0))
      .map((f) => f.time);

    // Timer decrements at start of each step, so first attack fires at step 19 (time 1.9s)
    // Second attack fires 20 steps later at time 3.9s — interval is exactly 2.0s
    expect(attackFrames.length).toBeGreaterThan(2);
    const interval = attackFrames[1] - attackFrames[0];
    expect(interval).toBeCloseTo(2.0, 1);
    // Verify first attack is within 1 step of expected
    expect(attackFrames[0]).toBeCloseTo(1.9, 1);
  });

  // Frame times should be clean 0.1s values (no floating-point drift)
  it('combat log frame times are clean 0.1s values', () => {
    const stats = makeStats({ maxHP: 200, physicalDamage: 20, attackSpeed: 1.0 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);
    const log = simulate([stats, { ...stats }], loadouts, registry, rng, 1);

    for (const frame of log.frames) {
      const rounded = Math.round(frame.time * 10) / 10;
      expect(frame.time).toBe(rounded);
    }
  });

  // Gladiator creation tests
  describe('createGladiator', () => {
    it('initializes HP and barrier from stats', () => {
      const stats = makeStats({ maxHP: 300, barrierAmount: 50 });
      const g = createGladiator(0, stats);

      expect(g.playerId).toBe(0);
      expect(g.currentHP).toBe(300);
      expect(g.maxHP).toBe(300);
      expect(g.barrier).toBe(50);
      expect(g.activeDOTs).toEqual([]);
      expect(g.activeBuffs).toEqual([]);
      expect(g.stunTimer).toBe(0);
      expect(g.isLowHP).toBe(false);
    });

    it('applies initiative to reduce attack timer', () => {
      const stats = makeStats({ attackSpeed: 1.0, initiative: 50 }); // 50 = 50%
      const g = createGladiator(1, stats);

      expect(g.attackTimer).toBeCloseTo(0.5); // 1.0 * (1 - 50/100) = 0.5
    });
  });
});
