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
