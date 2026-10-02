import { describe, it, expect } from 'vitest';
import { holdFull, moveBeat, resolveChain } from '../src/arpg/abilities/resolve.js';
import {
  chainCycle,
  computeHeroStats,
  damagePerUse,
  expectedHit,
  useInterval,
} from '../src/delve/hero-stats.js';
import * as engine from '../src/index.js';
import type { Chain, Move } from '../src/types/ability.js';
import { bal, gear, registry } from './fixtures/arena.js';

/**
 * The Skills tab's chain stats and rhythm strip (Delve UI v1, Phase 2B): one full cycle of an
 * ability chain as Power values it, from the engine's own pieces.
 */

const hero = computeHeroStats({ weapon: gear('fire') }, registry, {
  pair: { primary: 'fire', secondary: null },
});
const bolt = (over: Partial<Move> = {}): Move => ({
  kind: 'medium',
  form: 'bolt',
  elements: ['fire'],
  ...over,
});
const resolved = (chain: Chain) => resolveChain(registry, hero, 'primary', chain);

describe('expectedHit', () => {
  it('is weapon damage × damage multiplier × the crit factor', () => {
    const crit = 1 + hero.critChance * (hero.critMultiplier - 1);
    expect(expectedHit(hero)).toBeCloseTo(hero.weaponDamage * hero.damageMult * crit, 9);
  });
});

describe('chainCycle', () => {
  it("is one full cycle's damage, seconds and mana, from damagePerUse and useInterval", () => {
    const chain = resolved({ payment: 'mana', moves: [bolt({ kind: 'light' }), bolt()] });
    const cycle = chainCycle(registry, hero, chain);
    expect(cycle.damage).toBeCloseTo(damagePerUse(chain, expectedHit(hero), hero, bal) * 2, 9);
    expect(cycle.seconds).toBeCloseTo(
      useInterval(bal, chain, hero.tempo, Infinity, Infinity) * 2,
      9,
    );
    expect(cycle.mana).toBeCloseTo(chain.moves[0].cost + chain.moves[1].cost, 9);
    expect(cycle.restart).toBe(bal.abilities.comboWindow);
    expect(cycle.steps).toEqual(
      chain.moves.map((ab) => ({
        cast: ab.castTime,
        beat: moveBeat(bal, ab, hero.tempo),
        kind: ab.kind,
        elements: ['fire'],
        hold: false,
        echo: false,
      })),
    );
  });

  it('a light then medium Fire Bolt: 0.8775 s and 13.6 mana a cycle, worked out by hand', () => {
    // balance.json → delve: the Primary slot costs 8 mana, cools down 0.45 s; weight.cost 0.3,
    // weight.cooldown 0.25; kindWeight light −1, medium 0; feel.conjure [.04, .08, .14, .24, .38]
    // at weight + 2, conjureSlot.primary 1; chains.beat light 0.25, medium 0.4, beatSlot.primary 1.
    // The common sword: tempo 1, no cooldown affix, and Fire's knobs leave the timings alone.
    //   light:  cost 8 × (1 − 0.3) = 5.6; cooldown 0.45 × (1 − 0.25) = 0.3375;
    //           cadence 0.08 + 0.25 = 0.33 → its interval max(0.3375, 0.33) = 0.3375
    //   medium: cost 8; cooldown 0.45; cadence 0.14 + 0.4 = 0.54 → max(0.45, 0.54) = 0.54
    // With no mana limit, a cycle is (0.3375 + 0.54) / 2 × 2 = 0.8775 s and 5.6 + 8 = 13.6 mana.
    expect([hero.tempo, hero.cooldownMult]).toEqual([1, 1]);
    const cycle = chainCycle(
      registry,
      hero,
      resolved({ payment: 'mana', moves: [bolt({ kind: 'light' }), bolt()] }),
    );
    expect(cycle.seconds).toBeCloseTo(0.8775, 9);
    expect(cycle.mana).toBeCloseTo(13.6, 9);
  });

  it('values a hold at full charge: its charge time, its full beat and its full cost', () => {
    const chain = resolved({ payment: 'mana', moves: [bolt({ kind: 'hold' })] });
    const full = chain.hold[0]![2];
    const [step] = chainCycle(registry, hero, chain).steps;
    expect(step).toMatchObject({ kind: 'hold', hold: true });
    expect(step.cast).toBe(Math.max(holdFull(bal, hero.tempo), full.castTime));
    expect(step.beat).toBe(moveBeat(bal, full, hero.tempo));
    expect(chainCycle(registry, hero, chain).mana).toBeCloseTo(full.cost, 9);
  });

  it('spends no mana paid with charge, and marks a move its runes repeat', () => {
    const echo = bolt({ runes: [{ id: 'echo', tier: 3 }] });
    const charged = chainCycle(registry, hero, resolved({ payment: 'charge', moves: [echo] }));
    expect(charged.mana).toBe(0);
    expect(charged.steps[0].echo).toBe(true);
    expect(charged.damage).toBeGreaterThan(0);
  });

  it("counts a cast chain's mana: its half cost, and the channel in its cast time", () => {
    const chain = resolved({ payment: 'cast', moves: [bolt()] });
    const cycle = chainCycle(registry, hero, chain);
    expect(cycle.mana).toBeCloseTo(chain.moves[0].cost, 9);
    expect(cycle.mana).toBeGreaterThan(0);
    expect(cycle.steps[0].cast).toBe(chain.moves[0].conjure + chain.moves[0].channel);
  });

  it('is exported from the engine', () => {
    expect(engine.chainCycle).toBeTypeOf('function');
    expect(engine.chainCycle).toBe(chainCycle);
    expect(engine.expectedHit).toBe(expectedHit);
  });
});
