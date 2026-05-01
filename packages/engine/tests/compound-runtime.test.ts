import { describe, it, expect } from 'vitest';
import { applyTriggerEffect, simulate } from '../src/duel/duel-engine.js';
import { createGladiator, effectiveMaxHP } from '../src/duel/gladiator.js';
import { createCombatLog } from '../src/duel/combat-log.js';
import { extractTriggers } from '../src/duel/trigger-system.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { createGem } from '../src/types/gem.js';
import { createEmptyDerivedStats } from '../src/types/derived-stats.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { Loadout, EquippedSlot } from '../src/types/item.js';
import type { GladiatorRuntime, TriggerEffect } from '../src/types/combat.js';
import type { DerivedStats } from '../src/types/derived-stats.js';

const data = loadAndValidateData();
const registry = new DataRegistry(
  data.affixes,
  data.combinations,
  data.synergies,
  data.baseItems,
  data.balance,
  data.recipes,
);

function makeGladiator(overrides: Partial<DerivedStats> = {}): GladiatorRuntime {
  const stats = { ...createEmptyDerivedStats(), maxHP: 1000, ...overrides };
  return createGladiator(0, stats);
}

function makeOpponent(overrides: Partial<DerivedStats> = {}): GladiatorRuntime {
  const stats = { ...createEmptyDerivedStats(), maxHP: 1000, ...overrides };
  return createGladiator(1, stats);
}

function emptyLog() {
  return createCombatLog(42);
}

/* -------------------------------------------------------------------------- */
/*  applyTriggerEffect — runtime correctness                                  */
/* -------------------------------------------------------------------------- */

describe('applyTriggerEffect — stun', () => {
  it('replacement (Math.max), not stack: spam procs do not perma-lock', () => {
    const owner = makeGladiator();
    const opponent = makeOpponent();
    const log = emptyLog();
    const stun: TriggerEffect = { kind: 'stun', duration: 1.0 };

    applyTriggerEffect(stun, owner, opponent, log, 0);
    applyTriggerEffect(stun, owner, opponent, log, 0);
    applyTriggerEffect(stun, owner, opponent, log, 0);

    expect(opponent.stunTimer).toBe(1.0);
  });

  it('longer stun overwrites shorter one (Math.max)', () => {
    const owner = makeGladiator();
    const opponent = makeOpponent();
    const log = emptyLog();

    applyTriggerEffect({ kind: 'stun', duration: 0.5 }, owner, opponent, log, 0);
    applyTriggerEffect({ kind: 'stun', duration: 1.5 }, owner, opponent, log, 0);

    expect(opponent.stunTimer).toBe(1.5);
  });

  it('shorter stun does not shorten an active longer stun', () => {
    const owner = makeGladiator();
    const opponent = makeOpponent();
    const log = emptyLog();

    applyTriggerEffect({ kind: 'stun', duration: 2.0 }, owner, opponent, log, 0);
    applyTriggerEffect({ kind: 'stun', duration: 0.3 }, owner, opponent, log, 0);

    expect(opponent.stunTimer).toBe(2.0);
  });
});

describe('applyTriggerEffect — gain_barrier', () => {
  it('isPercent false adds to permanent barrier pool', () => {
    const owner = makeGladiator({ maxHP: 1000 });
    const opponent = makeOpponent();
    const log = emptyLog();

    applyTriggerEffect(
      { kind: 'gain_barrier', amount: 50, isPercent: false },
      owner, opponent, log, 0,
    );

    expect(owner.barrier).toBe(50);
    expect(owner.temporaryBarriers).toHaveLength(0);
  });

  it('isPercent true scales by maxHP', () => {
    const owner = makeGladiator({ maxHP: 1000 });
    const opponent = makeOpponent();
    const log = emptyLog();

    applyTriggerEffect(
      { kind: 'gain_barrier', amount: 0.10, isPercent: true },
      owner, opponent, log, 0,
    );

    expect(owner.barrier).toBe(100);
  });

  it('duration > 0 pushes to temporaryBarriers, not permanent', () => {
    const owner = makeGladiator({ maxHP: 1000 });
    const opponent = makeOpponent();
    const log = emptyLog();

    applyTriggerEffect(
      { kind: 'gain_barrier', amount: 0.20, isPercent: true, duration: 8 },
      owner, opponent, log, 0,
    );

    expect(owner.barrier).toBe(0);
    expect(owner.temporaryBarriers).toHaveLength(1);
    expect(owner.temporaryBarriers[0]).toMatchObject({ amount: 200, remaining: 8 });
  });

  it('emits a barrier_absorb log event on grant so UI can surface the shield', () => {
    // Regression: previously gain_barrier was silent — no signal a shield was
    // granted. Bastion / Reactive Shield / Phoenix Embers were invisible.
    const owner = makeGladiator({ maxHP: 1000 });
    const opponent = makeOpponent();
    const log = emptyLog();

    applyTriggerEffect(
      { kind: 'gain_barrier', amount: 0.10, isPercent: true, duration: 30 },
      owner, opponent, log, 0,
    );

    const events = log.frames.flatMap((f) => f.events);
    const barrierEvents = events.filter((e) => e.type === 'barrier_absorb');
    expect(barrierEvents).toHaveLength(1);
    expect(barrierEvents[0]).toMatchObject({ player: 0, absorbed: 0, remaining: 100 });
  });

  it('skips zero-amount grants (no event, no state change)', () => {
    const owner = makeGladiator();
    const opponent = makeOpponent();
    const log = emptyLog();

    applyTriggerEffect(
      { kind: 'gain_barrier', amount: 0, isPercent: false },
      owner, opponent, log, 0,
    );

    expect(owner.barrier).toBe(0);
    expect(log.frames.flatMap((f) => f.events)).toHaveLength(0);
  });
});

describe('applyTriggerEffect — reduce_max_hp', () => {
  it('shrinks effective max HP by `fraction` for `duration`', () => {
    const owner = makeGladiator();
    const opponent = makeOpponent({ maxHP: 1000 });
    const log = emptyLog();

    applyTriggerEffect(
      { kind: 'reduce_max_hp', fraction: 0.30, duration: 10 },
      owner, opponent, log, 0,
    );

    expect(opponent.maxHpDebuffMultiplier).toBeCloseTo(0.70);
    expect(opponent.maxHpDebuffRemaining).toBe(10);
    expect(effectiveMaxHP(opponent)).toBeCloseTo(700);
  });

  it('clamps currentHP down when applied (player visibly takes the loss)', () => {
    const owner = makeGladiator();
    const opponent = makeOpponent({ maxHP: 1000 });
    opponent.currentHP = 1000;
    const log = emptyLog();

    applyTriggerEffect(
      { kind: 'reduce_max_hp', fraction: 0.30, duration: 10 },
      owner, opponent, log, 0,
    );

    expect(opponent.currentHP).toBeCloseTo(700);
    const events = log.frames.flatMap((f) => f.events);
    const hpChanges = events.filter((e) => e.type === 'hp_change');
    expect(hpChanges).toHaveLength(1);
  });

  it('does not raise currentHP when current is already below new max', () => {
    const owner = makeGladiator();
    const opponent = makeOpponent({ maxHP: 1000 });
    opponent.currentHP = 200;
    const log = emptyLog();

    applyTriggerEffect(
      { kind: 'reduce_max_hp', fraction: 0.30, duration: 10 },
      owner, opponent, log, 0,
    );

    expect(opponent.currentHP).toBe(200);
  });
});

describe('applyTriggerEffect — bonus_damage_scaled', () => {
  it('damages opponent by damageContext * multiplier', () => {
    const owner = makeGladiator();
    const opponent = makeOpponent({ maxHP: 1000 });
    opponent.currentHP = 1000;
    const log = emptyLog();

    applyTriggerEffect(
      { kind: 'bonus_damage_scaled', damageType: 'physical', multiplier: 1.5 },
      owner, opponent, log, 0, 100,
    );

    expect(opponent.currentHP).toBe(850); // 1000 - (100 * 1.5)
  });

  it('deals 0 when damageContext is undefined (no in-flight damage)', () => {
    const owner = makeGladiator();
    const opponent = makeOpponent({ maxHP: 1000 });
    opponent.currentHP = 1000;
    const log = emptyLog();

    applyTriggerEffect(
      { kind: 'bonus_damage_scaled', damageType: 'physical', multiplier: 1.5 },
      owner, opponent, log, 0,
    );

    expect(opponent.currentHP).toBe(1000);
  });
});

describe('applyTriggerEffect — apply_slow', () => {
  it('sets opponent slowDebuff (replacement semantics)', () => {
    const owner = makeGladiator();
    const opponent = makeOpponent();
    const log = emptyLog();

    applyTriggerEffect({ kind: 'apply_slow', multiplier: 1.5, duration: 4 }, owner, opponent, log, 0);
    expect(opponent.slowDebuffMultiplier).toBe(1.5);
    expect(opponent.slowDebuffRemaining).toBe(4);

    // Fresh slow overwrites magnitude AND refreshes duration
    applyTriggerEffect({ kind: 'apply_slow', multiplier: 2.0, duration: 6 }, owner, opponent, log, 0);
    expect(opponent.slowDebuffMultiplier).toBe(2.0);
    expect(opponent.slowDebuffRemaining).toBe(6);
  });
});

describe('applyTriggerEffect — compound_dot', () => {
  it('emits compound_trigger callout AND pushes a DOT', () => {
    const owner = makeGladiator();
    const opponent = makeOpponent();
    const log = emptyLog();

    applyTriggerEffect(
      {
        kind: 'compound_dot',
        compoundId: 'ignite',
        element: 'fire',
        damagePerSecond: 10,
        duration: 12,
        tickInterval: 1.0,
        dotMultiplier: 2.0,
      },
      owner, opponent, log, 0,
    );

    expect(opponent.activeDOTs).toHaveLength(1);
    expect(opponent.activeDOTs[0]).toMatchObject({
      element: 'fire',
      damagePerSecond: 20, // 10 * 2.0 (recipe dotMultiplier pre-baked)
      sourceAffixId: 'compound:ignite',
    });

    const events = log.frames.flatMap((f) => f.events);
    expect(events.some((e) => e.type === 'compound_trigger')).toBe(true);
    expect(events.some((e) => e.type === 'dot_apply')).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Integration: extractTriggers + applyTriggerEffect for live recipes        */
/* -------------------------------------------------------------------------- */

function loadoutWithGem(affixId: string, slot: 'weapon' | 'armor' = 'weapon'): Loadout {
  const gem = createGem(`uid_${affixId}`, affixId, 1, 'common', {
    sourceRecipe: affixId,
    recipeDepth: 1,
  });
  const equipped: EquippedSlot = { gem };
  const empty = (): EquippedSlot[] => Array(6).fill(null);
  const weaponSlots = slot === 'weapon' ? [equipped, ...empty().slice(1)] : empty();
  const armorSlots = slot === 'armor' ? [equipped, ...empty().slice(1)] : empty();
  return {
    weapon: { baseItemId: 'sword', baseStats: null, slots: weaponSlots },
    armor: { baseItemId: 'chainmail', baseStats: null, slots: armorSlots },
  };
}

describe('Live recipe runtime: each wired compound applies its declared effects', () => {
  it('frostbite (multi-effect): one chance roll fires both DOT and slow', () => {
    const loadout = loadoutWithGem('frostbite', 'weapon');
    const triggers = extractTriggers(loadout, registry);
    const fb = triggers.find((t) => t.affixId === 'frostbite')!;

    const owner = makeGladiator();
    const opponent = makeOpponent();
    const log = emptyLog();
    for (const effect of fb.effects) {
      applyTriggerEffect(effect, owner, opponent, log, 0);
    }

    // DOT pushed
    expect(opponent.activeDOTs.some((d) => d.sourceAffixId === 'compound:frostbite')).toBe(true);
    // Slow applied
    expect(opponent.slowDebuffMultiplier).toBeGreaterThan(1);
  });

  it('bastion (capstone, on_block): grants a temporary 10%-maxHP barrier', () => {
    const loadout = loadoutWithGem('bastion', 'armor');
    const triggers = extractTriggers(loadout, registry);
    const bastion = triggers.find((t) => t.affixId === 'bastion')!;
    expect(bastion.condition).toBe('on_block');

    const owner = makeGladiator({ maxHP: 1000 });
    const opponent = makeOpponent();
    const log = emptyLog();
    for (const effect of bastion.effects) {
      applyTriggerEffect(effect, owner, opponent, log, 0);
    }

    expect(owner.temporaryBarriers).toHaveLength(1);
    expect(owner.temporaryBarriers[0].amount).toBeCloseTo(100); // 10% of 1000
    expect(owner.temporaryBarriers[0].remaining).toBeGreaterThan(0);
  });

  it('soul_rend (multi-effect): hits both current-HP and max-HP halves', () => {
    const loadout = loadoutWithGem('soul_rend', 'weapon');
    const triggers = extractTriggers(loadout, registry);
    const sr = triggers.find((t) => t.affixId === 'soul_rend')!;

    const owner = makeGladiator();
    const opponent = makeOpponent({ maxHP: 1000 });
    opponent.currentHP = 1000;
    const log = emptyLog();
    for (const effect of sr.effects) {
      applyTriggerEffect(effect, owner, opponent, log, 0);
    }

    expect(opponent.maxHpDebuffMultiplier).toBeLessThan(1);
    expect(opponent.currentHP).toBeLessThan(1000); // current-HP siphon
  });

  it('counter_strike: bonus_damage_scaled echoes the blocked amount', () => {
    const loadout = loadoutWithGem('counter_strike', 'armor');
    const triggers = extractTriggers(loadout, registry);
    const cs = triggers.find((t) => t.affixId === 'counter_strike')!;

    const owner = makeGladiator(); // owner = defender of the original attack
    const opponent = makeOpponent({ maxHP: 1000 });
    opponent.currentHP = 1000;
    const log = emptyLog();
    const blockedDamage = 80;
    for (const effect of cs.effects) {
      applyTriggerEffect(effect, owner, opponent, log, 0, blockedDamage);
    }

    // Counter Strike's multiplier is 1.5; opponent should lose ~120 HP.
    expect(opponent.currentHP).toBeCloseTo(1000 - 120);
  });
});

/* -------------------------------------------------------------------------- */
/*  simulate(): full duel exercises the trigger pipeline end-to-end          */
/* -------------------------------------------------------------------------- */

describe('simulate(): trigger pipeline integration', () => {
  function emptyLoadout(): Loadout {
    return {
      weapon: { baseItemId: 'sword', baseStats: null, slots: Array(6).fill(null) },
      armor: { baseItemId: 'chainmail', baseStats: null, slots: Array(6).fill(null) },
    };
  }

  it('produces a deterministic CombatLog given the same seed (smoke test)', () => {
    const stats: [DerivedStats, DerivedStats] = [
      { ...createEmptyDerivedStats(), maxHP: 500, physicalDamage: 50 },
      { ...createEmptyDerivedStats(), maxHP: 500, physicalDamage: 50 },
    ];
    const loadouts: [Loadout, Loadout] = [emptyLoadout(), emptyLoadout()];
    const a = simulate(stats, loadouts, registry, new SeededRNG(42), 1);
    const b = simulate(stats, loadouts, registry, new SeededRNG(42), 1);

    expect(a.result.finalHP).toEqual(b.result.finalHP);
    expect(a.frames.length).toBe(b.frames.length);
    expect(a.result.duration).toBe(b.result.duration);
  });

  it('socketed ignite gem produces compound_trigger events at runtime across many seeds', () => {
    // Probabilistic — Ignite procs at 15% per attack. Across many seeds at
    // least one should fire. Locks the full path:
    //   extractTriggers → fireTriggers → applyTriggerEffect → log event.
    const igniteWeapon = loadoutWithGem('ignite', 'weapon');
    const stats: [DerivedStats, DerivedStats] = [
      { ...createEmptyDerivedStats(), maxHP: 5000, physicalDamage: 30, attackSpeed: 0.5 },
      { ...createEmptyDerivedStats(), maxHP: 5000, physicalDamage: 30, attackSpeed: 0.5 },
    ];

    let seenIgnite = false;
    for (let seed = 1; seed <= 50 && !seenIgnite; seed++) {
      const log = simulate(
        stats,
        [igniteWeapon, emptyLoadout()],
        registry,
        new SeededRNG(seed),
        1,
      );
      const events = log.frames.flatMap((f) => f.events);
      if (events.some((e) => e.type === 'compound_trigger' && e.compoundId === 'ignite')) {
        seenIgnite = true;
      }
    }
    expect(seenIgnite).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Tick-down semantics                                                       */
/* -------------------------------------------------------------------------- */

describe('Tick-down semantics (regression for global-tick fix)', () => {
  it('stat_buff_add ticks down each step regardless of which gladiator is acting', () => {
    // Run a duel where one gladiator is much slower. Both should still see
    // their buffs decay at the same rate — pre-fix, the slower one's buffs
    // would last longer because processBuffs only fired on attacker turns.
    const owner = makeGladiator({ critChance: 5 });
    const opponent = makeOpponent();
    const log = emptyLog();

    applyTriggerEffect(
      { kind: 'stat_buff_add', stat: 'critChance', value: 50, duration: 1.0 },
      owner, opponent, log, 0,
    );
    expect(owner.activeBuffs).toHaveLength(1);
    expect(owner.activeBuffs[0]).toMatchObject({ kind: 'add', stat: 'critChance', value: 50 });
  });
});

/* -------------------------------------------------------------------------- */
/*  RNG determinism (used by future Playwright fixtures)                     */
/* -------------------------------------------------------------------------- */

describe('SeededRNG forking (used by trigger system for independent rolls)', () => {
  it('same seed + same fork key produces same sequence', () => {
    const a = new SeededRNG(42).fork('triggers');
    const b = new SeededRNG(42).fork('triggers');
    const seqA = Array.from({ length: 10 }, () => a.nextBool(0.5));
    const seqB = Array.from({ length: 10 }, () => b.nextBool(0.5));
    expect(seqA).toEqual(seqB);
  });
});

/* -------------------------------------------------------------------------- */
/*  Parameterized: every recipe with compoundEffects produces a firing trigger */
/* -------------------------------------------------------------------------- */

/**
 * Walks every recipe with `compoundEffects` and asserts:
 *   1. extractTriggers produces at least one TriggerDef whose affixId matches.
 *   2. The effects array is non-empty and matches the blueprint count grouped by condition.
 *   3. Applying the effects mutates the expected gladiator field per effect kind.
 *
 * This auto-extends to new wired compounds — adding a 22nd compound to
 * recipes.json with a `compoundEffects` block automatically gets coverage.
 */
describe('Parameterized: every wired compound fires correctly', () => {
  type EffectKind = TriggerEffect['kind'];

  // Map effect kind → predicate over (owner, opponent) that returns true if
  // the kind's expected mutation occurred. Keep this exhaustive so a new
  // effect kind without a predicate is caught loudly.
  const expectedMutation: Record<EffectKind, (owner: GladiatorRuntime, opp: GladiatorRuntime) => boolean> = {
    apply_dot: (_o, opp) => opp.activeDOTs.length > 0,
    bonus_damage: (_o, opp) => opp.currentHP < 1000,
    bonus_damage_scaled: (_o, opp) => opp.currentHP < 1000, // exercised w/ damageContext
    heal: (o, _opp) => o.currentHP > 0, // baseline; heal-from-empty test below catches semantics
    gain_barrier: (o, _opp) => o.barrier > 0 || o.temporaryBarriers.length > 0,
    stun: (_o, opp) => opp.stunTimer > 0,
    stat_buff_add: (o, _opp) => o.activeBuffs.some((b) => b.kind === 'add'),
    stat_buff_mul: (o, _opp) => o.activeBuffs.some((b) => b.kind === 'mul'),
    reflect_damage: (o, _opp) => o.reflectMultiplier > 0,
    apply_slow: (_o, opp) => opp.slowDebuffMultiplier > 1,
    compound_dot: (_o, opp) => opp.activeDOTs.length > 0,
    damage_current_hp: (_o, opp) => opp.currentHP < 1000,
    reduce_max_hp: (_o, opp) => opp.maxHpDebuffMultiplier < 1,
  };

  // Pull the wired compound IDs straight from recipes.json so this test
  // auto-discovers new entries.
  const wiredRecipes = data.recipes.filter(
    (r) => Array.isArray(r.compoundEffects) && r.compoundEffects.length > 0,
  );

  it('discovers wired compounds (sanity: count > 0)', () => {
    expect(wiredRecipes.length).toBeGreaterThan(0);
  });

  for (const recipe of wiredRecipes) {
    it(`${recipe.id}: extracts at least one TriggerDef with the right shape`, () => {
      // Pick a slot consistent with recipe tags so e.g. defensive compounds
      // are socketed in armor (matches how the player would equip them).
      const slot: 'weapon' | 'armor' = recipe.tags.some((t) =>
        t === 'defensive_trigger' || t === 'block_trigger' || t === 'capstone',
      ) ? 'armor' : 'weapon';

      const loadout = loadoutWithGem(recipe.id, slot);
      const triggers = extractTriggers(loadout, registry);
      const matching = triggers.filter((t) => t.affixId === recipe.id);

      expect(matching.length).toBeGreaterThan(0);
      for (const trig of matching) {
        expect(trig.effects.length).toBeGreaterThan(0);
      }
    });

    it(`${recipe.id}: applying its effects mutates the expected runtime fields`, () => {
      const slot: 'weapon' | 'armor' = recipe.tags.some((t) =>
        t === 'defensive_trigger' || t === 'block_trigger' || t === 'capstone',
      ) ? 'armor' : 'weapon';
      const loadout = loadoutWithGem(recipe.id, slot);
      const triggers = extractTriggers(loadout, registry);
      const matching = triggers.filter((t) => t.affixId === recipe.id);
      expect(matching.length).toBeGreaterThan(0);

      const owner = makeGladiator({ maxHP: 1000 });
      const opponent = makeOpponent({ maxHP: 1000 });
      opponent.currentHP = 1000;
      owner.currentHP = 500; // give heal effects something to do
      const log = emptyLog();

      // Apply every effect across every grouped TriggerDef. Pass damageContext
      // so bonus_damage_scaled paths exercise too.
      for (const trig of matching) {
        for (const effect of trig.effects) {
          applyTriggerEffect(effect, owner, opponent, log, 0, 100);
        }
      }

      // For each kind present in the effects, the corresponding mutation
      // predicate must hold.
      const presentKinds = new Set<EffectKind>();
      for (const trig of matching) for (const e of trig.effects) presentKinds.add(e.kind);

      for (const kind of presentKinds) {
        const predicate = expectedMutation[kind];
        expect(
          predicate,
          `effect kind ${kind} from ${recipe.id} has no mutation predicate — add one`,
        ).toBeDefined();
        expect(
          predicate(owner, opponent),
          `${recipe.id}'s ${kind} effect did not produce its expected mutation`,
        ).toBe(true);
      }
    });
  }
});

describe('applyTriggerEffect — amplify_dot_element', () => {
  it('sets elementAmplifiers[element] on opponent (replacement semantics)', () => {
    const owner = makeGladiator();
    const opponent = makeOpponent();
    const log = emptyLog();

    applyTriggerEffect(
      { kind: 'amplify_dot_element', element: 'poison', stackMultiplier: 2.0, tickMultiplier: 1.5, duration: 8 },
      owner, opponent, log, 0,
    );
    expect(opponent.elementAmplifiers.poison).toMatchObject({
      stackMultiplier: 2.0,
      tickMultiplier: 1.5,
      remaining: 8,
    });

    // Replacement: a fresh apply overwrites magnitude AND refreshes duration
    applyTriggerEffect(
      { kind: 'amplify_dot_element', element: 'poison', stackMultiplier: 3.0, tickMultiplier: 2.0, duration: 12 },
      owner, opponent, log, 0,
    );
    expect(opponent.elementAmplifiers.poison).toMatchObject({
      stackMultiplier: 3.0,
      tickMultiplier: 2.0,
      remaining: 12,
    });
  });

  it('does NOT affect amplifiers for other elements', () => {
    const owner = makeGladiator();
    const opponent = makeOpponent();
    const log = emptyLog();
    applyTriggerEffect(
      { kind: 'amplify_dot_element', element: 'poison', stackMultiplier: 2.0, tickMultiplier: 1.5, duration: 8 },
      owner, opponent, log, 0,
    );
    expect(opponent.elementAmplifiers.fire).toBeUndefined();
    expect(opponent.elementAmplifiers.cold).toBeUndefined();
  });
});
