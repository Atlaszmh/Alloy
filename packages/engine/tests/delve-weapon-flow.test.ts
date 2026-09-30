import { describe, it, expect } from 'vitest';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { startPush } from '../src/arpg/action.js';
import { makeCtx } from '../src/arpg/combat.js';
import { dirTo, dist } from '../src/arpg/geometry.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { MOVE_KINDS, type FormId, type MoveKind } from '../src/types/ability.js';
import type { ArpgEvent, ArpgInput, ArpgWorld, Vec } from '../src/types/arpg.js';
import type { EquippedGear } from '../src/types/gear.js';
import {
  arena,
  bal,
  chainsWith,
  damaged,
  dodge,
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
    expect(bal.feel.minLeap).toBe(0.25);
  });

  it("each weapon's moves, side steps, hops and sway", () => {
    expect(byKind('move')).toEqual({
      dagger: [0.25, 0.3, 0.7, 0.9],
      sword: [0.4, 0.8, 1.2, 1.6],
      axe: [0.3, 0.4, 0.9, 1.2],
      maul: [0.15, 0.3, 1.6, 2.0],
      staff: NONE,
      wand: NONE,
      bow: [-0.4, -0.6, -0.9, -1.2],
    });
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

  /** A sword swing's lunge at a foe up ahead, with a blow's step running beside it. */
  const lungeAndStep = () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.0);
    run(w, STEP);
    startPush(makeCtx(registry, w, []), 'step', { x: 1, y: 0 }, 0.5, 0.5);
    expect(kinds(w)).toEqual(['lunge', 'step']);
    return w;
  };

  it("a weapon swap drops the swing's lunge and keeps a running step", () => {
    const w = lungeAndStep();
    const dagger = computeHeroStats({ weapon: gear('fire', 'weapon', 'dagger') }, registry);
    refreshWorldHero(registry, w, dagger, chainsWith());
    expect(w.hero.swing).toBeNull();
    expect(kinds(w)).toEqual(['step']);
  });

  it('a dodge clears every push', () => {
    const w = lungeAndStep();
    dodge(w);
    expect(w.hero.pushes).toEqual([]);
  });

  it("a wind-up's landing finishes its step-in unprojected: steering against it doesn't shorten it", () => {
    const w = arena([dummy(13, 20)], { noBasic: true, primary: { form: 'strike' } });
    pressOnly(w, 0, { x: 13, y: 20 });
    const stepIn = w.hero.pushes.find((p) => p.kind === 'stepIn')!;
    const back = { x: 0, y: 1 };
    let before = { done: 0, movedY: 0 };
    for (let i = 0; i < 60 && w.hero.windup; i++) {
      before = { done: stepIn.done, movedY: stepIn.movedY };
      stepWorld(registry, w, { move: back }, STEP);
    }
    expect(w.hero.windup).toBeNull();
    // Steered against, its slices moved nothing; the landing takes the rest in full.
    expect(before.done).toBeLessThan(1);
    expect(stepIn.movedY - before.movedY).toBeCloseTo(stepIn.dy * (1 - before.done), 9);
    expect(stepIn.movedY).toBeLessThan(0);
  });

  it('the contact cut never cuts the steering', () => {
    // A swing's lunge at a foe just outside the contact gap; the hero steers into the gap.
    const w = arena([dummy(13, 0)]);
    place(w, bal.feel.contactGap + 0.05);
    run(w, STEP);
    expect(kinds(w)).toEqual(['lunge']);
    const y0 = w.hero.y;
    stepWorld(registry, w, { move: { x: 0, y: -1 } }, STEP);
    expect(w.hero.pushes).toEqual([]);
    expect(y0 - w.hero.y).toBeCloseTo(w.hero.stats.moveSpeed * STEP * bal.feel.actionMove, 9);
  });

  it('a push into the arena edge is clamped while another covers its distance', () => {
    const w = arena([], { noBasic: true });
    const ctx = makeCtx(registry, w, []);
    w.hero.x = w.hero.radius + 0.1;
    const y0 = w.hero.y;
    startPush(ctx, 'step', { x: -1, y: 0 }, 1, 4 * STEP);
    startPush(ctx, 'step', { x: 0, y: -1 }, 0.4, 4 * STEP);
    const [wall, up] = w.hero.pushes;
    run(w, 4 * STEP);
    expect(w.hero.x).toBe(w.hero.radius);
    expect(wall.movedX).toBeCloseTo(-0.1, 9);
    expect(y0 - w.hero.y).toBeCloseTo(0.4, 9);
    expect(up.movedY).toBeCloseTo(-0.4, 9);
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

  it('a directional hold walked past its aim while charging fires along the way it began', () => {
    // Let go during its conjure (a wind-up follows) and at full charge (it fires at once).
    for (const ticks of [1, Math.round(bal.chains.holdTime / STEP)]) {
      const w = arena([dummy(13, 34), dummy(1, 1)], { noBasic: true, primary: { kind: 'hold' } });
      stepWorld(registry, w, { move: still, holding: 0 }, STEP);
      expect(w.hero.hold!.aim).not.toBeNull();
      // Its foe dies (nothing to re-aim at: it fires at the hold's aim), and the hero is past it.
      w.monsters[0].dead = true;
      w.hero.y = 30;
      for (let i = 1; i < ticks; i++) stepWorld(registry, w, { move: still, holding: 0 }, STEP);
      for (let i = 0; i < 30 && w.projectiles.length === 0; i++)
        stepWorld(registry, w, { move: still }, STEP);
      expect(w.projectiles[0].vy, `${ticks}`).toBeLessThan(0);
      expect(w.projectiles[0].vx).toBeCloseTo(0, 9);
    }
  });

  it('a hold released with a fresh manual aim fires at it, from where it was let go', () => {
    // The aim is behind the hero but ahead of where the hold began: it still fires back at it.
    for (const ticks of [1, Math.round(bal.chains.holdTime / STEP)]) {
      const w = arena([dummy(13, 20), dummy(1, 1)], { noBasic: true, primary: { kind: 'hold' } });
      for (let i = 0; i < ticks; i++) stepWorld(registry, w, { move: still, holding: 0 }, STEP);
      w.hero.y = 30;
      stepWorld(registry, w, { move: still, cast: { slot: 0, aim: { x: 13, y: 33 } } }, STEP);
      for (let i = 0; i < 30 && w.projectiles.length === 0; i++)
        stepWorld(registry, w, { move: still }, STEP);
      expect(w.projectiles[0].vy, `${ticks}`).toBeGreaterThan(0);
      expect(w.projectiles[0].vx).toBeCloseTo(0, 9);
    }
  });

  it('a self-centred hold let go early while walking keeps the facing through its wind-up', () => {
    const w = arena([dummy(1, 1)], { noBasic: true, ultimate: { kind: 'hold', payment: 'mana' } });
    stepWorld(registry, w, { move: still, holding: 2 }, STEP);
    // It walked on while it charged.
    w.hero.y = 34;
    const up = { x: 0, y: -1 };
    w.hero.facing = up;
    stepWorld(registry, w, { move: up, cast: { slot: 2, aim: null } }, STEP);
    expect(w.hero.windup).not.toBeNull();
    for (let i = 0; i < 60 && w.hero.windup; i++) {
      expect(w.hero.facing).toEqual(up);
      stepWorld(registry, w, { move: up }, STEP);
    }
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

describe('weapon styles', () => {
  /** A `baseId` hero whose basic chain is `kinds`, one sturdy foe `gap` from its edge straight up. */
  const fighter = (baseId: string, kinds: MoveKind[], gap: number) => {
    const w = strikeWorld(
      { weapon: gear('fire', 'weapon', baseId) },
      { basic: kinds.map((kind) => ({ kind, element: 'fire' as const })) },
      false,
      dummy(13, 0),
    );
    place(w, gap);
    return w;
  };
  /** Step until the next blow lands and its step (if any) has run out. */
  const blowAndStep = (w: ArpgWorld, move: Vec = still) => {
    let struck = false;
    for (let i = 0; i < 300 && !struck; i++)
      struck = stepWorld(registry, w, { move }, STEP).some((e) => e.kind === 'basic');
    run(w, bal.feel.stepSeconds + STEP, move);
  };

  it("a melee blow lunges its kind's move, stopping at contact", () => {
    for (const baseId of ['dagger', 'sword', 'axe', 'maul'])
      for (const kind of ['light', 'medium', 'heavy'] as const) {
        const { move, hop = 0 } = registry.getGearBase(baseId).feel![kind];
        // In reach once the lunge is done, but short of contact (a dagger's heavy then hops back).
        const w = fighter(baseId, [kind], move + 0.3);
        const y0 = w.hero.y;
        blowAndStep(w);
        expect(y0 - w.hero.y, `${baseId} ${kind}`).toBeCloseTo(move - hop, 5);
      }
    // A maul's slam leaps 1.6, but only to its foe's contact gap.
    const w = fighter('maul', ['heavy'], 1);
    const y0 = w.hero.y;
    blowAndStep(w);
    expect(y0 - w.hero.y).toBeCloseTo(1 - bal.feel.contactGap, 5);
  });

  it("a bow steps back its kind's move after the release", () => {
    for (const kind of ['light', 'medium', 'heavy'] as const) {
      const w = fighter('bow', [kind], 5);
      const y0 = w.hero.y;
      blowAndStep(w);
      expect(w.hero.y - y0, kind).toBeCloseTo(-w.hero.stats.weapon.feel[kind].move, 5);
    }
  });

  it("a blow's step survives the chain's next cast", () => {
    const w = fighter('bow', ['light'], 5);
    for (let i = 0; i < 60 && w.hero.pushes.length === 0; i++)
      stepWorld(registry, w, { move: still }, STEP);
    const [step] = w.hero.pushes;
    expect(step.kind).toBe('step');
    pressOnly(w, 0);
    expect(w.hero.windup).not.toBeNull();
    expect(w.hero.pushes).toContain(step);
    run(w, bal.feel.stepSeconds + STEP);
    expect(step.movedY).toBeCloseTo(-w.hero.stats.weapon.feel.light.move, 5);
  });

  it('a dagger hops back after its heavy blow; steering at the foe drops the hop', () => {
    const hop = (move: Vec) => {
      const w = fighter('dagger', ['heavy'], 1);
      for (let i = 0; i < 60 && !w.hero.pushes.some((p) => p.kind === 'step'); i++)
        stepWorld(registry, w, { move }, STEP);
      const step = w.hero.pushes.find((p) => p.kind === 'step')!;
      run(w, bal.feel.stepSeconds + STEP, move);
      return step.movedY;
    };
    expect(hop(still)).toBeCloseTo(registry.getGearBase('dagger').feel!.heavy.hop!, 5);
    expect(hop({ x: 0, y: -1 })).toBeCloseTo(0, 9);
  });

  it('a staff alternates its side step; a wand keeps its side, circling', () => {
    const sides = (baseId: string) => {
      const w = fighter(baseId, ['light'], 4);
      const out: number[] = [];
      for (let i = 0; i < 3; i++) {
        const x = w.hero.x;
        blowAndStep(w);
        out.push(Math.sign(w.hero.x - x));
        expect(w.hero.swaySide).toBe(out[i]);
      }
      return out;
    };
    // Facing up, side 1 is to the right (+x).
    expect(sides('staff')).toEqual([-1, 1, -1]);
    expect(sides('wand')).toEqual([1, 1, 1]);
  });

  it("the steering's part square to the blow picks the side from sideSteer up, and is recorded", () => {
    /** A first light blow's side step, aimed straight up, the hero then steering at the foe, part sideways. */
    const side = (baseId: string, lateral: number) => {
      const w = fighter(baseId, ['light'], 4);
      stepWorld(registry, w, { move: still }, STEP);
      const move = { x: lateral, y: -Math.sqrt(1 - lateral * lateral) };
      for (let i = 0; i < 60 && !w.hero.pushes.some((p) => p.kind === 'step'); i++)
        stepWorld(registry, w, { move }, STEP);
      const step = w.hero.pushes.find((p) => p.kind === 'step')!;
      run(w, bal.feel.stepSeconds + STEP, move);
      return { swaySide: w.hero.swaySide, moved: step.movedX };
    };
    // Facing up, side 1 is to the right. By its sway a staff's first step goes left, a wand's right.
    expect(side('staff', 0.25).swaySide).toBe(-1);
    expect(side('staff', bal.feel.sideSteer)).toMatchObject({ swaySide: 1 });
    expect(side('staff', 0.5).moved).toBeCloseTo(
      registry.getGearBase('staff').feel!.light.side!,
      5,
    );
    expect(side('wand', -0.25).swaySide).toBe(1);
    expect(side('wand', -0.5)).toMatchObject({ swaySide: -1 });
  });

  it('an automatic swing started on the move lunges and acquires at reach plus its lunge', () => {
    const w = fighter('sword', ['light'], 0);
    const { range } = w.hero.stats.weapon;
    const { move } = w.hero.stats.weapon.feel.light;
    // Its edge past the weapon's range from the hero's centre, inside range plus the lunge.
    place(w, range + move / 2 - w.hero.radius);
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    expect(w.hero.swing).toMatchObject({ committed: false, targetId: w.monsters[0].id });
    expect(kinds(w)).toEqual(['lunge']);
  });
});

describe("a hold blow's leap", () => {
  const MAUL = { weapon: gear('fire', 'weapon', 'maul') };
  const DAGGER = { weapon: gear('fire', 'weapon', 'dagger') };
  const letGo = { move: still, attack: false };
  const struck = (events: ArpgEvent[]) => events.find((e) => e.kind === 'basic');
  /**
   * A manual hold blow held to full charge at a sturdy foe `gap` from the hero's edge,
   * straight up (a second foe far off keeps the floor from clearing).
   */
  const charged = (equipped: EquippedGear, gap: number) => {
    const w = strikeWorld(equipped, { basic: [{ kind: 'hold', element: 'fire' }] }, false);
    w.monsters.push({ ...arena([dummy(3, 5)]).monsters[0], id: 2000 });
    place(w, gap);
    const attack = { move: still, attack: true };
    for (let i = 0; i < 60 && w.hero.swing?.held == null; i++) stepWorld(registry, w, attack, STEP);
    const full = bal.chains.holdTime * w.hero.stats.tempo;
    for (let i = 0; i < Math.round(full / STEP); i++) stepWorld(registry, w, attack, STEP);
    return w;
  };
  /** `charged`, then let go: it leaps. */
  const released = (equipped: EquippedGear, gap: number) => {
    const w = charged(equipped, gap);
    const y0 = w.hero.y;
    expect(struck(stepWorld(registry, w, letGo, STEP))).toBeUndefined();
    expect(w.hero.swing).toMatchObject({ released: 2 });
    return { w, y0, t0: w.t };
  };
  /** Step with `input` until the blow lands; the tick it lands. */
  const land = (w: ArpgWorld, input: Partial<ArpgInput> = letGo, each = () => {}) => {
    for (let i = 0; i < 30; i++) {
      if (struck(stepWorld(registry, w, { move: still, ...input }, STEP))) return w.t;
      each();
    }
    return Infinity;
  };

  it('a charged maul leaps to its foe as it is let go, never shoving it, then strikes', () => {
    const { w, y0, t0 } = released(MAUL, 1.5);
    const m = w.monsters[0];
    const gap = dist(w.hero.x, y0, m.x, m.y) - m.radius - w.hero.radius;
    const my = m.y;
    const at = land(w, letGo, () => expect(m.y).toBe(my));
    expect(at - t0).toBeGreaterThanOrEqual(bal.feel.stepSeconds - 1e-9);
    expect(at - t0).toBeLessThan(bal.feel.stepSeconds + STEP);
    expect(y0 - w.hero.y).toBeCloseTo(gap - bal.feel.contactGap, 5);
  });

  it("a charged dagger leaps, strikes, then its hold row's hop follows", () => {
    const { w, y0 } = released(DAGGER, 1.8);
    const { medium, hold } = w.hero.stats.weapon.feel;
    land(w);
    const y1 = w.hero.y;
    expect(y0 - y1).toBeCloseTo(hold.move - medium.move, 5);
    // The attack stays let go (manual), so no new swing starts meanwhile.
    for (let i = 0; i < Math.round((bal.feel.stepSeconds + STEP) / STEP); i++)
      stepWorld(registry, w, letGo, STEP);
    expect(w.hero.y - y1).toBeCloseTo(hold.hop!, 5);
  });

  it('a leap shorter than minLeap is skipped: an unarmed blow strikes as it is let go', () => {
    const { medium, hold } = bal.hero.feel;
    expect(hold.move - medium.move).toBeGreaterThan(0);
    expect(hold.move - medium.move).toBeLessThan(bal.feel.minLeap);
    const w = charged({}, 0.3);
    const y0 = w.hero.y;
    expect(struck(stepWorld(registry, w, letGo, STEP))).toBeDefined();
    expect(w.hero.y).toBe(y0);
    // Every weapon's leap is at least minLeap.
    for (const b of weapons) {
      const leap = b.feel!.hold.move - b.feel!.medium.move;
      if (leap > 0) expect(leap, b.id).toBeGreaterThanOrEqual(bal.feel.minLeap);
    }
  });

  it('a charged blow let go already at contact strikes as it is let go; one 2 away still leaps', () => {
    const w = charged(MAUL, bal.feel.contactGap);
    const y0 = w.hero.y;
    expect(struck(stepWorld(registry, w, letGo, STEP))).toBeDefined();
    expect(w.hero.y).toBe(y0);
    released(MAUL, 2);
  });

  it('a press, a repeat press and a held hold move wait for it to land', () => {
    for (const input of [
      { cast: { slot: 0 } },
      { cast: { slot: 0, repeat: true } },
      { holding: 0 },
    ] as Partial<ArpgInput>[]) {
      const { w } = released(MAUL, 1.5);
      if (input.holding !== undefined)
        w.hero.chains = arena([], { primary: { kind: 'hold' } }).hero.chains;
      const order: string[] = [];
      for (let i = 0; i < 30 && !w.hero.windup && !w.hero.hold; i++)
        for (const e of stepWorld(
          registry,
          w,
          { ...letGo, ...(i === 0 ? input : { holding: input.holding }) },
          STEP,
        ))
          if (e.kind === 'basic' || e.kind === 'windup') order.push(e.kind);
      expect(order[0]).toBe('basic');
      expect(w.hero.windup ?? w.hero.hold).not.toBeNull();
    }
  });

  it('a foe that dies mid-leap ends the leap; the blow still lands on time', () => {
    const { w, t0 } = released(MAUL, 1.5);
    stepWorld(registry, w, letGo, STEP);
    w.monsters[0].dead = true;
    stepWorld(registry, w, letGo, STEP);
    expect(w.hero.pushes).toEqual([]);
    const y = w.hero.y;
    const at = land(w);
    expect(at - t0).toBeGreaterThanOrEqual(bal.feel.stepSeconds - 1e-9);
    expect(at - t0).toBeLessThan(bal.feel.stepSeconds + STEP);
    expect(w.hero.y).toBe(y);
  });

  it('pressing the attack again or turning automatic mid-leap changes nothing; a dodge cancels it', () => {
    const plain = released(MAUL, 1.5);
    const at = land(plain.w) - plain.t0;
    for (const input of [{ attack: true }, { attack: undefined }]) {
      const { w, t0 } = released(MAUL, 1.5);
      expect(land(w, input) - t0).toBeCloseTo(at, 9);
      expect(w.hero.y).toBeCloseTo(plain.w.hero.y, 9);
    }
    const { w } = released(MAUL, 1.5);
    dodge(w);
    expect(w.hero.swing).toBeNull();
    expect(land(w)).toBe(Infinity);
  });

  it('turning automatic mid-leap while steering lands as the manual blow does, its target killed or not', () => {
    const right = { x: 1, y: 0 };
    for (const kill of [false, true]) {
      const after = (attack: boolean | undefined) => {
        const { w, t0 } = released(MAUL, 1.5);
        if (kill) w.monsters[0].dead = true;
        const at = land(w, { move: right, attack });
        return { at: at - t0, recover: w.hero.recoverUntil - t0 };
      };
      const manual = after(false);
      expect(manual.at, `${kill}`).toBeGreaterThanOrEqual(bal.feel.stepSeconds - 1e-9);
      expect(manual.at, `${kill}`).toBeLessThan(bal.feel.stepSeconds + STEP);
      const auto = after(undefined);
      expect(auto.at, `${kill}`).toBeCloseTo(manual.at, 9);
      expect(auto.recover, `${kill}`).toBeCloseTo(manual.recover, 9);
    }
  });
});

describe('determinism', () => {
  it('steps, side steps, leaps and casts on the move are the same at 30, 60 and 120 frames a second', () => {
    const fight = (frames: number) => {
      const out: unknown[] = [];
      let leaping = 0;
      for (const baseId of ['staff', 'bow', 'maul']) {
        const w = strikeWorld(
          { weapon: gear('fire', 'weapon', baseId) },
          {
            basic: [
              { kind: 'light', element: 'fire' },
              { kind: 'hold', element: 'fire' },
            ],
          },
          false,
          dummy(13, 30),
        );
        w.monsters.push(
          ...arena([dummy(10, 28), dummy(16, 31)]).monsters.map((m, i) => ({ ...m, id: 2000 + i })),
        );
        for (let k = 0; k < Math.round(6 / STEP); k++) {
          const move = k % 60 < 30 ? { x: 1, y: 0 } : { x: -0.6, y: 0.6 };
          const attack = k % 50 < 40;
          const input = { move, attack, cast: k % 50 === 46 ? { slot: 0 } : null };
          // The presses go on a tick's first frame; movement and the attack on every frame.
          for (let f = 0; f < frames; f++)
            out.push(...stepWorld(registry, w, f === 0 ? input : { move, attack }, STEP / frames));
          if (w.hero.swing?.released != null) leaping++;
        }
        out.push([w.hero.x, w.hero.y, w.hero.swaySide]);
      }
      return { out, leaping };
    };
    const at30 = fight(1);
    const count = (kind: string) => at30.out.filter((e) => (e as ArpgEvent).kind === kind).length;
    expect(count('basic')).toBeGreaterThan(5);
    expect(count('cast')).toBeGreaterThan(5);
    expect(at30.leaping).toBeGreaterThan(0);
    expect(fight(2).out).toEqual(at30.out);
    expect(fight(4).out).toEqual(at30.out);
  });
});
