import { describe, it, expect } from 'vitest';
import { stepWorld } from '../src/arpg/step.js';
import { abilityReady } from '../src/arpg/abilities/cast.js';
import { makeCtx } from '../src/arpg/combat.js';
import { arena, bal, damaged, dummy, gear, press, registry, run, STEP } from './fixtures/arena.js';

const ab = bal.abilities;

describe('mana payment', () => {
  it('spends mana and starts the cooldown', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    const mana = w.hero.mana;
    const cost = w.hero.abilities[0].cost;
    const events = press(w, 0);
    expect(events.some((e) => e.kind === 'cast' && e.slot === 0 && e.name === 'Fire Bolt')).toBe(
      true,
    );
    expect(w.hero.mana).toBeCloseTo(mana - cost, 0);
    expect(press(w, 0).some((e) => e.kind === 'cast')).toBe(false);
    run(w, w.hero.abilities[0].cooldown);
    expect(press(w, 0).some((e) => e.kind === 'cast')).toBe(true);
  });

  it('without enough mana it warns and spends nothing', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    w.hero.mana = 1;
    w.hero.manaRegen = 0;
    const events = press(w, 0);
    expect(events.some((e) => e.kind === 'noMana' && e.slot === 0)).toBe(true);
    expect(w.hero.mana).toBeCloseTo(1);
  });

  it('with nothing to aim at it fails for free', () => {
    const w = arena([], { noBasic: true });
    const mana = w.hero.mana;
    expect(press(w, 0).some((e) => e.kind === 'cast')).toBe(false);
    expect(w.hero.mana).toBeCloseTo(mana, 0);
  });
});

describe('cast payment', () => {
  it('roots the hero through the wind-up, lands after it and blocks other casts', () => {
    const w = arena([dummy(11, 36), dummy(13, 30)], {
      noBasic: true,
      ultimate: { payment: 'cast' },
    });
    const castTime = w.hero.abilities[2].castTime;
    expect(castTime).toBeGreaterThan(0);
    const events = press(w, 2);
    expect(events.some((e) => e.kind === 'windup')).toBe(true);
    expect(damaged(w.monsters[0])).toBe(false);
    const y = w.hero.y;
    stepWorld(registry, w, { move: { x: 0, y: -1 }, cast: { slot: 0 } }, STEP);
    expect(w.hero.y).toBe(y);
    expect(w.projectiles).toHaveLength(0);
    run(w, castTime);
    expect(damaged(w.monsters[0])).toBe(true);
    expect(w.hero.windup).toBeNull();
  });
});

describe('charge payment', () => {
  it('fills from damage dealt and in lulls, fires only when full, then empties', () => {
    const w = arena([dummy(13, 34.4)], { noBasic: false });
    const need = w.hero.abilities[2].chargeNeed;
    expect(w.hero.charge[2]).toBe(0);
    expect(press(w, 2).some((e) => e.kind === 'cast')).toBe(false);
    run(w, 3);
    expect(w.hero.charge[2]).toBeGreaterThan(0);
    w.hero.charge[2] = need;
    expect(abilityReady(makeCtx(registry, w, []), 2)).toBe(true);
    expect(press(w, 2).some((e) => e.kind === 'cast')).toBe(true);
    expect(w.hero.charge[2]).toBe(0);

    const lull = arena([], { noBasic: true });
    run(lull, 2);
    expect(lull.hero.charge[2]).toBeCloseTo(2 * ab.lullCharge, 0);
  });
});

describe('basic attacks', () => {
  it('each basic hit adds mana', () => {
    const w = arena([dummy(13, 34.4)]);
    w.hero.mana = 0;
    w.hero.manaRegen = 0;
    const basics = run(w, 2).filter((e) => e.kind === 'basic').length;
    expect(basics).toBeGreaterThan(0);
    expect(w.hero.mana).toBeCloseTo(basics * bal.mana.basicAttackGain, 5);
  });

  it('every third melee swing is a wider, harder finisher', () => {
    const w = arena([dummy(13, 34.4)], { equipped: { weapon: gear('frost') } });
    const hits = run(w, 3.5)
      .filter((e) => e.kind === 'hit' && !e.crit)
      .map((e) => (e.kind === 'hit' ? e.amount : 0));
    expect(Math.max(...hits) / Math.min(...hits)).toBeCloseTo(1.5, 1);
  });
});
