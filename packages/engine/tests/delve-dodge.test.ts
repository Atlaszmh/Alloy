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
  it('spends a charge and dashes its distance along the move direction', () => {
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
    w.hero.dodgeCharges = 2;
    dodge(w);
    run(w, D.duration + 0.05);
    dodge(w);
    expect(w.hero.dodgeCharges).toBe(0);
    for (let n = 1; n <= D.charges; n++) {
      run(w, n === 1 ? D.recharge - D.duration : D.recharge);
      expect(w.hero.dodgeCharges).toBe(n);
    }
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
    expect(w.hero.cooldowns[2][0]).toBeLessThanOrEqual(w.t);
    expect(w.hero.mana).toBeLessThan(mana - 1);
  });

  it('holds a cast pressed in the burst until it ends, then casts as the slide carries on', () => {
    const w = arena([dummy(13, 28)], { noBasic: true });
    dodge(w, { x: 1, y: 0 });
    expect(kinds(pressOnly(w, 0))).not.toContain('windup');
    const { start, until } = w.hero.dodge!;
    for (let i = 0; i < 60 && !w.hero.windup; i++)
      stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP);
    expect(w.hero.windup!.start).toBeGreaterThanOrEqual(start + D.cancelAfter - 1e-9);
    expect(w.hero.windup!.start).toBeLessThan(start + D.cancelAfter + STEP + 1e-9);
    // The slide isn't cut: it runs on to its end, carrying the hero as it winds up.
    expect(w.hero.dodge!.until).toBe(until);
    const x = w.hero.x;
    stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP);
    expect(w.hero.x).toBeGreaterThan(x + 0.01);
  });

  it('a manual attack held through a slide swings once the burst is over, the slide going on', () => {
    const w = arena([dummy(19, 33)]);
    stepWorld(
      registry,
      w,
      { move: { x: 1, y: 0 }, dodge: true, dodgeHeld: true, attack: false },
      STEP,
    );
    const { start } = w.hero.dodge!;
    let swungAt = -1;
    for (let i = 0; i < 40 && swungAt < 0; i++) {
      stepWorld(registry, w, { move: { x: 1, y: 0 }, dodgeHeld: true, attack: true }, STEP);
      if (w.hero.swing) swungAt = w.t;
    }
    expect(swungAt).toBeGreaterThanOrEqual(start + D.cancelAfter - 1e-9);
    expect(swungAt).toBeLessThan(w.hero.dodge!.until + 1e-9);
    expect(w.t).toBeLessThan(w.hero.dodge!.until);
  });

  it('a second dodge pressed mid-dash chains once the commit passes', () => {
    const w = arena([], { noBasic: true });
    dodge(w, { x: 1, y: 0 });
    const first = w.hero.dodge!;
    const events = [...dodge(w, { x: 1, y: 0 })];
    for (let i = 0; i < 30 && w.hero.dodge === first; i++)
      events.push(...run(w, STEP, { x: 1, y: 0 }));
    expect(kinds(events)).toContain('dodge');
    expect(w.hero.dodge!.start).toBeLessThan(first.start + D.duration);
    expect(w.hero.dodge!.start).toBeGreaterThanOrEqual(first.start + D.cancelAfter - 1e-9);
  });
  it('a dodge tap between frames is not lost', () => {
    const w = arena([], { noBasic: true });
    stepWorld(registry, w, { move: { x: 0, y: 0 }, dodge: true }, STEP / 4);
    expect(kinds(stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP))).toContain('dodge');
  });
});

describe('steering the dodge', () => {
  it("the held glide loses speed tick by tick, from the dash's tail speed to nothing", () => {
    const w = arena([], { noBasic: true });
    stepWorld(registry, w, { move: { x: 1, y: 0 }, dodge: true, dodgeHeld: true }, STEP);
    const end = w.hero.dodge!.start + D.duration;
    const steps: number[] = [];
    while (w.t < end + D.glide - 1e-9) {
      const x = w.hero.x;
      stepWorld(registry, w, { move: { x: 0, y: 0 }, dodgeHeld: true }, STEP);
      if (w.t > end + 1e-9) steps.push(w.hero.x - x);
    }
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1] + 1e-9);
    const tail = ((1 - D.ease) * D.distance) / D.duration;
    expect(steps[0] / STEP).toBeGreaterThan(tail * 0.85);
    expect(steps.at(-1)! / STEP).toBeLessThan(tail * 0.15);
  });

  it('held, it glides on past its end, its speed draining to a stop over `glide`; let go, it stops at once', () => {
    const heldStep = (w: ArpgWorld, held: boolean) =>
      stepWorld(registry, w, { move: { x: 0, y: 0 }, dodgeHeld: held }, STEP);
    const tail = ((1 - D.ease) * D.distance) / D.duration;
    // Held throughout: the full dash, then the whole glide.
    const w = arena([], { noBasic: true });
    stepWorld(registry, w, { move: { x: 1, y: 0 }, dodge: true, dodgeHeld: true }, STEP);
    for (let i = 0; i < Math.round((D.duration + D.glide + 0.3) / STEP); i++) heldStep(w, true);
    expect(w.hero.x).toBeCloseTo(13 + D.distance + (tail * D.glide) / 2, 1);
    expect(w.hero.dodge!.until).toBeCloseTo(w.hero.dodge!.start + D.duration + D.glide, 9);
    // Let go a tenth of a second into the glide: it ends there.
    const v = arena([], { noBasic: true });
    stepWorld(registry, v, { move: { x: 1, y: 0 }, dodge: true, dodgeHeld: true }, STEP);
    for (let i = 0; i < Math.round((D.duration + 0.1) / STEP); i++) heldStep(v, true);
    expect(v.t).toBeLessThan(v.hero.dodge!.until);
    const x = v.hero.x;
    heldStep(v, false);
    expect(v.t).toBeGreaterThanOrEqual(v.hero.dodge!.until);
    run(v, 0.3);
    expect(v.hero.x).toBeCloseTo(x, 4);
    // A tap (let go before its end) dashes just its distance.
    const tap = arena([], { noBasic: true });
    stepWorld(registry, tap, { move: { x: 1, y: 0 }, dodge: true, dodgeHeld: true }, STEP);
    run(tap, D.duration + D.glide + 0.2);
    expect(tap.hero.x).toBeCloseTo(13 + D.distance, 1);
  });

  it('bursts out and glides: the first half of the time covers most of the distance', () => {
    const w = arena([], { noBasic: true });
    dodge(w, { x: 1, y: 0 });
    run(w, D.duration / 2, { x: 1, y: 0 });
    expect(w.hero.x - 13).toBeGreaterThan(D.distance * 0.6);
    run(w, D.duration);
    expect(w.hero.x).toBeCloseTo(13 + D.distance, 1);
  });

  it('the steering bends the dash into an arc, its length kept', () => {
    const w = arena([], { noBasic: true });
    dodge(w, { x: 1, y: 0 });
    const path: { x: number; y: number }[] = [{ x: w.hero.x, y: w.hero.y }];
    while (w.t < w.hero.dodge!.until) {
      run(w, STEP, { x: 0, y: -1 });
      path.push({ x: w.hero.x, y: w.hero.y });
    }
    // It went right, then curved up: an arc, not a straight line or a snap.
    expect(w.hero.x).toBeGreaterThan(13 + 1);
    expect(w.hero.y).toBeLessThan(36 - 1);
    let walked = 0;
    for (let i = 1; i < path.length; i++)
      walked += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    // Its last tick hands off to the walk, which adds that tick's step.
    expect(walked).toBeGreaterThan(D.distance - 0.05);
    expect(walked).toBeLessThan(D.distance + 0.2);
    expect(w.hero.facing.y).toBeLessThan(-0.9);
  });

  it('turns at most `steer` radians a second', () => {
    const w = arena([], { noBasic: true });
    dodge(w, { x: 1, y: 0 });
    run(w, STEP, { x: -1, y: 0 });
    const d = w.hero.dodge!.dir;
    expect(Math.abs(Math.atan2(d.y, d.x))).toBeCloseTo(D.steer * STEP, 5);
  });

  it('a half-tilted stick turns it half as fast', () => {
    const w = arena([], { noBasic: true });
    dodge(w, { x: 1, y: 0 });
    run(w, STEP, { x: 0, y: -0.5 });
    const d = w.hero.dodge!.dir;
    expect(Math.abs(Math.atan2(d.y, d.x))).toBeCloseTo(D.steer * STEP * 0.5, 5);
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
