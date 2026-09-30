import { describe, it, expect } from 'vitest';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { startPush } from '../src/arpg/action.js';
import { makeCtx } from '../src/arpg/combat.js';
import { dirTo } from '../src/arpg/geometry.js';
import { stepWorld } from '../src/arpg/step.js';
import { MOVE_KINDS, type FormId } from '../src/types/ability.js';
import type { ArpgInput, ArpgWorld, Vec } from '../src/types/arpg.js';
import {
  arena,
  bal,
  damaged,
  dummy,
  gear,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
  STEP,
  strikeWorld,
} from './fixtures/arena.js';

// See the weapon flow spec. The fixture arena's hero stands at (13, 36) facing up (−y);
// `dummy(x, y)` is a sturdy Fire foe that doesn't fight back.

const weapons = registry.getGearBasesForSlot('weapon');
/** Each weapon's `key` by kind (light, medium, heavy, hold), 0 where a row leaves it out. */
const byKind = (key: 'move' | 'side' | 'hop') =>
  Object.fromEntries(weapons.map((b) => [b.id, MOVE_KINDS.map((k) => b.feel![k][key] ?? 0)]));
const NONE = [0, 0, 0, 0];

describe('data: weapon styles', () => {
  it('loads the feel numbers', () => {
    expect(bal.feel.stepSeconds).toBe(0.15);
    expect(bal.feel.actionMove).toBe(0.6);
    expect(bal.feel.sideSteer).toBe(0.3);
  });

  it("each weapon's side steps, hops and sway", () => {
    expect(byKind('side')).toEqual({
      dagger: NONE,
      sword: NONE,
      axe: NONE,
      maul: NONE,
      staff: [0.5, 0.7, 1.0, 1.3],
      wand: [0.35, 0.45, 0.6, 0.8],
      bow: NONE,
    });
    expect(byKind('hop')).toEqual({
      dagger: [0, 0, 0.8, 0.8],
      sword: NONE,
      axe: NONE,
      maul: NONE,
      staff: NONE,
      wand: NONE,
      bow: NONE,
    });
    expect(Object.fromEntries(weapons.map((b) => [b.id, b.sway ?? 'alternate']))).toEqual({
      dagger: 'alternate',
      sword: 'alternate',
      axe: 'alternate',
      maul: 'alternate',
      staff: 'alternate',
      wand: 'orbit',
      bow: 'alternate',
    });
    // Unarmed keeps its small lunge, and has no step.
    for (const k of MOVE_KINDS) {
      expect(bal.hero.feel[k].side ?? 0).toBe(0);
      expect(bal.hero.feel[k].hop ?? 0).toBe(0);
    }
  });

  it("the hero's weapon carries its sway", () => {
    const sway = (baseId: string) =>
      computeHeroStats({ weapon: gear('fire', 'weapon', baseId) }, registry).weapon.sway;
    expect(sway('wand')).toBe('orbit');
    expect(sway('staff')).toBe('alternate');
    expect(computeHeroStats({}, registry).weapon.sway).toBe('alternate');
  });
});

/** Put the first foe `gap` units from the hero's edge along `dir` (default straight up). */
function place(w: ArpgWorld, gap: number, dir: Vec = { x: 0, y: -1 }, i = 0): void {
  const m = w.monsters[i];
  const d = w.hero.radius + m.radius + gap;
  m.x = w.hero.x + dir.x * d;
  m.y = w.hero.y + dir.y * d;
}
const kinds = (w: ArpgWorld) => w.hero.pushes.map((p) => p.kind);
const still = { x: 0, y: 0 };

describe('pushes', () => {
  it('the next cast keeps a running step; a cancelled swing takes only its own lunge', () => {
    const w = arena([dummy(13, 0)], { primary: { form: 'strike' } });
    place(w, 1.0);
    run(w, STEP);
    expect(kinds(w)).toEqual(['lunge']);
    startPush(makeCtx(registry, w, []), 'step', { x: 1, y: 0 }, 0.5, 0.5);
    pressOnly(w, 0, { x: 13, y: 20 });
    expect(w.hero.swing).toBeNull();
    expect(kinds(w)).toEqual(['step', 'stepIn']);
  });

  it('pushes add up, each by its own progress', () => {
    const w = arena([], { noBasic: true });
    const ctx = makeCtx(registry, w, []);
    const { x: x0, y: y0 } = w.hero;
    startPush(ctx, 'step', { x: 1, y: 0 }, 0.4, 4 * STEP);
    startPush(ctx, 'step', { x: 0, y: -1 }, 0.2, 2 * STEP);
    run(w, 2 * STEP);
    expect(w.hero.x - x0).toBeCloseTo(0.2, 5);
    expect(y0 - w.hero.y).toBeCloseTo(0.2, 5);
    expect(w.hero.pushes).toHaveLength(1);
    run(w, 2 * STEP);
    expect(w.hero.x - x0).toBeCloseTo(0.4, 5);
    expect(w.hero.pushes).toEqual([]);
  });
});

describe('blending', () => {
  const down = { x: 0, y: 1 };

  it('a lunge steered away from moves the hero only along the steering', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.6);
    run(w, STEP);
    const [lunge] = w.hero.pushes;
    expect(lunge.kind).toBe('lunge');
    const { x: x0, y: y0 } = w.hero;
    let n = 0;
    for (; w.hero.swing && n < 60; n++) stepWorld(registry, w, { move: down }, STEP);
    expect(w.hero.x).toBe(x0);
    expect(w.hero.y - y0).toBeCloseTo(n * w.hero.stats.moveSpeed * STEP * bal.feel.actionMove, 5);
    expect(lunge.movedY).toBeCloseTo(0, 9);
  });

  it('a sideways part survives; exactly against the steering, a push expires', () => {
    const w = arena([], { noBasic: true });
    const ctx = makeCtx(registry, w, []);
    const { x: x0, y: y0 } = w.hero;
    startPush(ctx, 'step', { x: -0.6, y: -0.8 }, 1, 4 * STEP);
    startPush(ctx, 'step', { x: 0, y: -1 }, 1, 4 * STEP);
    run(w, 4 * STEP, down);
    expect(x0 - w.hero.x).toBeCloseTo(0.6, 5);
    expect(w.hero.y - y0).toBeCloseTo(4 * w.hero.stats.moveSpeed * STEP, 5);
    expect(w.hero.pushes).toEqual([]);
  });

  it("a form's step-in and recoil blend with the steering", () => {
    // A Strike aimed straight up steps in over its conjure, square to the hero strafing right.
    const s = arena([dummy(13, 20)], { noBasic: true, primary: { form: 'strike' } });
    const { x: x0, y: y0 } = s.hero;
    pressOnly(s, 0, { x: 13, y: 20 });
    for (let i = 0; i < 60 && s.hero.windup; i++)
      stepWorld(registry, s, { move: { x: 1, y: 0 } }, STEP);
    expect(y0 - s.hero.y).toBeCloseTo(moveOf(s, 0).motion, 5);
    expect(s.hero.x).toBeGreaterThan(x0);
    // A Bolt fired up recoils down, against a hero steering up: none of it applies.
    const b = arena([dummy(13, 30)], { noBasic: true });
    press(b, 0);
    const recoil = b.hero.pushes.find((p) => p.kind === 'step')!;
    const y1 = b.hero.y;
    run(b, 4 * STEP, { x: 0, y: -1 });
    expect(recoil.movedY).toBeCloseTo(0, 9);
    expect(y1 - b.hero.y).toBeCloseTo(4 * b.hero.stats.moveSpeed * STEP * bal.feel.recoveryMove, 5);
    expect(b.hero.pushes).toEqual([]);
  });
});

describe('no rooting', () => {
  const sword = { weapon: gear('fire') };
  /** How far one step steering right moves the hero, as a share of its full pace. */
  const stepRight = (w: ArpgWorld, input: Partial<ArpgInput> = {}) => {
    const x = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 }, ...input }, STEP);
    return (w.hero.x - x) / (w.hero.stats.moveSpeed * STEP);
  };

  it('a swing, a charging hold blow, a wind-up and a charging hold each slow the hero to actionMove', () => {
    const swing = arena([dummy(13, 34.4)]);
    run(swing, STEP);
    expect(swing.hero.swing).not.toBeNull();
    expect(stepRight(swing)).toBeCloseTo(bal.feel.actionMove, 5);

    const blow = strikeWorld(sword, { basic: [{ kind: 'hold', element: 'fire' }] });
    const held = { attack: true };
    for (let i = 0; i < 60 && blow.hero.swing?.held == null; i++)
      stepWorld(registry, blow, { move: still, ...held }, STEP);
    expect(blow.hero.swing!.held).not.toBeNull();
    expect(stepRight(blow, held)).toBeCloseTo(bal.feel.actionMove, 5);

    const cast = arena([dummy(13, 30)], { noBasic: true, primary: { payment: 'cast' } });
    pressOnly(cast, 0);
    expect(cast.hero.windup).not.toBeNull();
    expect(stepRight(cast)).toBeCloseTo(bal.feel.actionMove, 5);

    const hold = arena([dummy(13, 30)], { noBasic: true, primary: { kind: 'hold' } });
    stepWorld(registry, hold, { move: still, holding: 0 }, STEP);
    expect(hold.hero.hold).not.toBeNull();
    expect(stepRight(hold, { holding: 0 })).toBeCloseTo(bal.feel.actionMove, 5);
  });

  it("a recovery's slower pace wins", () => {
    const w = arena([dummy(13, 34.4)]);
    run(w, STEP);
    expect(w.hero.swing).not.toBeNull();
    w.hero.recoverUntil = w.t + 1;
    expect(stepRight(w)).toBeCloseTo(bal.feel.recoveryMove, 5);
  });

  it('the hero faces its action while strafing, then its steering again', () => {
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { payment: 'cast' } });
    pressOnly(w, 0);
    const at = w.hero.windup!.at;
    stepRight(w);
    expect(w.hero.facing).toEqual(dirTo(w.hero.x, w.hero.y, at.x, at.y));
    for (let i = 0; i < 60 && w.hero.windup; i++) stepRight(w);
    stepRight(w);
    expect(w.hero.facing).toEqual({ x: 1, y: 0 });

    // A hold with nothing to aim at keeps the facing it started with.
    const h = arena([], { noBasic: true, primary: { kind: 'hold' } });
    stepWorld(registry, h, { move: still, holding: 0 }, STEP);
    expect(h.hero.hold).toMatchObject({ aim: null });
    stepRight(h, { holding: 0 });
    expect(h.hero.facing).toEqual({ x: 0, y: -1 });
  });
});

describe('past the aim point', () => {
  /** A `form` Primary aimed 0.2 ahead, the hero steering on up through its wind-up. */
  const walkPast = (form: FormId) => {
    const w = arena([dummy(13, 20)], { noBasic: true, primary: { form } });
    pressOnly(w, 0, { x: 13, y: 35.8 });
    for (let i = 0; i < 60 && w.hero.windup; i++)
      stepWorld(registry, w, { move: { x: 0, y: -1 } }, STEP);
    expect(w.hero.y).toBeLessThan(35.8);
    return w;
  };

  it("a directional form fires along the press's way once the hero has walked past its aim", () => {
    const [bolt] = walkPast('bolt').projectiles;
    expect(bolt.vy).toBeLessThan(0);
    expect(bolt.vx).toBeCloseTo(0, 9);
  });

  it("so does one fired at the press's aim when auto-aim finds nothing at the landing", () => {
    // The foe it aimed at is gone by the landing (another, far off, keeps the floor going).
    const w = arena([dummy(13, 30), dummy(1, 1)], { noBasic: true });
    pressOnly(w, 0);
    w.monsters[0].dead = true;
    w.hero.y = 28;
    run(w, 0.3);
    expect(w.projectiles[0].vy).toBeLessThan(0);
  });

  it("past it, a directional wind-up faces along the press's way; a placed one turns to its aim", () => {
    const facing = (form: FormId) => {
      const w = arena([dummy(13, 20)], { noBasic: true, primary: { form } });
      pressOnly(w, 0, { x: 13, y: 35.8 });
      for (let i = 0; i < 60 && w.hero.windup && w.hero.y >= 35.8; i++)
        stepWorld(registry, w, { move: { x: 0, y: -1 } }, STEP);
      expect(w.hero.windup).not.toBeNull();
      return w.hero.facing;
    };
    expect(facing('bolt')).toEqual({ x: 0, y: -1 });
    expect(facing('burst')).toEqual({ x: 0, y: 1 });
  });

  it('a placed form still lands at its aim point', () => {
    const z = walkPast('burst').zones.find((q) => q.source === 'burst')!;
    expect(z.x).toBeCloseTo(13, 9);
    expect(z.y).toBeCloseTo(35.8, 9);
  });

  it('a successful auto-aim at the landing still turns toward the nearest foe', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    pressOnly(w, 0);
    // Past the foe it aimed at: the Bolt turns round and hits it.
    w.hero.y = 28;
    run(w, 0.3);
    expect(damaged(w.monsters[0])).toBe(true);
  });
});
