import { describe, it, expect } from 'vitest';
import { stepWorld } from '../src/arpg/step.js';
import { applyStatus, hitMonster, hurtHero, makeCtx } from '../src/arpg/combat.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import { arena, bal, dodge, dummy, pressOnly, registry, run, STEP } from './fixtures/arena.js';

// The hero starts at (13, 36), facing up (-y).
const D = bal.dodge;
const kinds = (events: ArpgEvent[]) => events.map((e) => e.kind);
const perfects = (events: ArpgEvent[]) => events.filter((e) => e.kind === 'perfectDodge').length;

function ctxOf(w: ArpgWorld) {
  const events: ArpgEvent[] = [];
  return { ctx: makeCtx(registry, w, events), events };
}

describe('the dodge', () => {
  it('spends a charge and dashes about 3 units along the move direction', () => {
    const w = arena([], { noBasic: true });
    const events = dodge(w, { x: 1, y: 0 });
    expect(kinds(events)).toContain('dodge');
    expect(w.hero.dodgeCharges).toBe(D.charges - 1);
    run(w, D.duration + 0.1);
    expect(w.hero.x).toBeCloseTo(13 + D.distance, 1);
    expect(w.hero.y).toBeCloseTo(36, 5);
  });

  it('standing still, it runs from the nearest foe, or along the facing with nobody near', () => {
    const w = arena([dummy(13, 33)], { noBasic: true });
    dodge(w);
    run(w, D.duration + 0.1);
    expect(w.hero.y).toBeGreaterThan(38);
    const alone = arena([], { noBasic: true });
    dodge(alone);
    run(alone, D.duration + 0.1);
    expect(alone.hero.y).toBeCloseTo(36 - D.distance, 1);
  });

  it('needs a charge, and a press mid-dash waits for the dash to end', () => {
    const empty = arena([], { noBasic: true });
    empty.hero.dodgeCharges = 0;
    expect(kinds(dodge(empty))).not.toContain('dodge');

    const w = arena([], { noBasic: true });
    dodge(w, { x: 1, y: 0 });
    expect(kinds(dodge(w, { x: 1, y: 0 }))).not.toContain('dodge');
    expect(kinds(run(w, D.duration + 0.1))).toContain('dodge');
    expect(w.hero.dodgeCharges).toBe(D.charges - 2);
  });

  it('charges refill one at a time', () => {
    const w = arena([], { noBasic: true });
    dodge(w);
    run(w, D.duration + 0.05);
    dodge(w);
    expect(w.hero.dodgeCharges).toBe(0);
    run(w, D.recharge - D.duration);
    expect(w.hero.dodgeCharges).toBe(1);
    run(w, D.recharge);
    expect(w.hero.dodgeCharges).toBe(2);
    expect(w.hero.dodgeRechargeAt).toBe(0);
  });

  it('i-frames block hits', () => {
    const w = arena([], { noBasic: true });
    dodge(w);
    run(w, 0.2);
    const hp = w.hero.hp;
    hurtHero(ctxOf(w).ctx, 50, null, null);
    expect(w.hero.hp).toBe(hp);
  });

  it('cancels a cast wind-up: the mana stays spent, the cooldown resets', () => {
    const w = arena([dummy(11, 36)], { noBasic: true, ultimate: { payment: 'cast' } });
    const mana = w.hero.mana;
    pressOnly(w, 2);
    expect(w.hero.windup).not.toBeNull();
    dodge(w, { x: 1, y: 0 });
    expect(w.hero.windup).toBeNull();
    expect(w.hero.cooldowns[2]).toBeLessThanOrEqual(w.t);
    expect(w.hero.mana).toBeLessThan(mana - 1);
  });

  it('holds a cast pressed mid-dash until the dash ends', () => {
    const w = arena([dummy(13, 28)], { noBasic: true });
    dodge(w, { x: 1, y: 0 });
    expect(kinds(pressOnly(w, 0))).not.toContain('windup');
    const end = w.hero.dodge!.until;
    for (let i = 0; i < 60 && !w.hero.windup; i++)
      stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP);
    expect(w.hero.windup!.start).toBeGreaterThanOrEqual(end - 1e-9);
  });

  it('a dodge tap between frames is not lost', () => {
    const w = arena([], { noBasic: true });
    stepWorld(registry, w, { move: { x: 0, y: 0 }, dodge: true }, STEP / 4);
    expect(kinds(stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP))).toContain('dodge');
  });
});

describe('perfect dodge', () => {
  it('a hit blocked early in the dodge is a PERFECT: charge back, riposte armed', () => {
    const w = arena([], { noBasic: true });
    dodge(w);
    const { ctx, events } = ctxOf(w);
    hurtHero(ctx, 50, null, null);
    expect(perfects(events)).toBe(1);
    expect(w.hero.dodgeCharges).toBe(D.charges);
    expect(w.hero.dodgeRechargeAt).toBe(0);
    expect(w.hero.riposteUntil).toBeGreaterThan(w.t);
    hurtHero(ctx, 50, null, null);
    expect(perfects(events)).toBe(1);
  });

  it('a hit after the window is only blocked', () => {
    const w = arena([], { noBasic: true });
    dodge(w);
    run(w, D.perfectWindow + 0.03);
    const { ctx, events } = ctxOf(w);
    const hp = w.hero.hp;
    hurtHero(ctx, 50, null, null);
    expect(w.hero.hp).toBe(hp);
    expect(perfects(events)).toBe(0);
    expect(w.hero.dodgeCharges).toBe(D.charges - 1);
  });

  it('dashing away from a melee swing that then misses is still a PERFECT', () => {
    // In reach (gap 1.0) when the dodge starts, out of reach when the swing lands.
    const w = arena([{ x: 13, y: 20, hp: 1e6, maxHp: 1e6, aggro: true, damage: 20 }], {
      noBasic: true,
    });
    const m = w.monsters[0];
    m.y = 36 - (1.0 + m.radius + w.hero.radius);
    for (let i = 0; i < 200 && !(m.windupUntil > 0 && m.windupUntil - w.t <= 0.1); i++) {
      stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP);
    }
    const hp = w.hero.hp;
    const events = [...dodge(w, { x: 0, y: 1 }), ...run(w, 0.25)];
    expect(perfects(events)).toBe(1);
    expect(w.hero.hp).toBe(hp);
    expect(w.hero.y - 36).toBeGreaterThan(1.4);
  });

  it('leaving a boss slam as it lands is a PERFECT', () => {
    const w = arena([], { noBasic: true });
    w.zones.push({
      id: 1,
      owner: 'monster',
      source: null,
      ability: null,
      x: 13,
      y: 36,
      // Small enough that the hero has left it when it lands (only where it began is inside).
      radius: 0.9,
      born: w.t,
      until: w.t + 1,
      tick: 0,
      nextTick: 0,
      damage: 50,
      element: 'fire',
      applies: [],
      detonateAt: w.t + 0.13,
      dead: false,
    });
    const hp = w.hero.hp;
    const events = [...dodge(w, { x: 1, y: 0 }), ...run(w, 0.3)];
    expect(perfects(events)).toBe(1);
    expect(w.hero.hp).toBe(hp);
  });

  it('a projectile crossing where the dodge began counts, and keeps flying', () => {
    const w = arena([], { noBasic: true });
    w.projectiles.push({
      id: 900,
      owner: 'monster',
      form: null,
      ability: null,
      homingId: null,
      x: 13,
      y: 34.5,
      vx: 0,
      vy: 8,
      radius: 0.3,
      damage: 20,
      element: 'fire',
      pierce: false,
      hitIds: [],
      maxDist: 20,
      traveled: 0,
      explodeRadius: 0,
      applies: [],
      knockback: 0,
      dead: false,
    });
    const events = [...dodge(w, { x: 1, y: 0 }), ...run(w, 0.1)];
    expect(perfects(events)).toBe(1);
    expect(w.projectiles.some((p) => p.id === 900)).toBe(true);
  });

  it('a second PERFECT while the riposte is armed gives no charge back', () => {
    const w = arena([], { noBasic: true });
    dodge(w);
    hurtHero(ctxOf(w).ctx, 50, null, null);
    run(w, D.duration + 0.05);
    dodge(w);
    const { ctx, events } = ctxOf(w);
    hurtHero(ctx, 50, null, null);
    expect(perfects(events)).toBe(1);
    expect(w.hero.dodgeCharges).toBe(D.charges - 1);
  });

  it('the riposte makes the next real hit crit and stagger, and a burn tick does not spend it', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    dodge(w);
    hurtHero(ctxOf(w).ctx, 50, null, null);
    const { ctx, events } = ctxOf(w);
    const m = w.monsters[0];
    applyStatus(ctx, m, 'burn', 10);
    hitMonster(ctx, m, 5, 'fire', { source: 'dot', noReact: true });
    expect(w.hero.riposteUntil).toBeGreaterThan(w.t);
    hitMonster(ctx, m, 10, null, { source: 'basic', crit: false });
    const hit = events.filter((e) => e.kind === 'hit').at(-1);
    expect(hit && hit.kind === 'hit' && hit.crit).toBe(true);
    expect(m.status.staggerUntil).toBeGreaterThan(w.t);
    expect(w.hero.riposteUntil).toBe(0);
  });
});
