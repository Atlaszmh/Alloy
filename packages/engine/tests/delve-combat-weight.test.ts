import { describe, it, expect } from 'vitest';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { resolveAbility, stepHeft } from '../src/arpg/abilities/resolve.js';
import type { AbilityBuild, AbilitySlot } from '../src/types/ability.js';
import type { ArpgEvent, ArpgInput, ArpgWorld, Vec } from '../src/types/arpg.js';
import { stepWorld } from '../src/arpg/step.js';
import { makeCtx } from '../src/arpg/combat.js';
import { pushTick, startPush } from '../src/arpg/action.js';
import { dist } from '../src/arpg/geometry.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import {
  arena,
  bal,
  damaged,
  DEFAULT_BUILDS,
  dodge,
  dummy,
  gear,
  registry,
  run,
  STEP,
} from './fixtures/arena.js';

const weapons = registry.getDelveData().bases.filter((b) => b.slot === 'weapon');

describe('combat weight data', () => {
  it('every weapon swings a combo string, and the feel block loads', () => {
    expect(weapons.length).toBeGreaterThan(0);
    for (const w of weapons) {
      expect(w.combo?.length, w.id).toBeGreaterThan(0);
      for (const s of w.combo!) {
        expect(s.startup).toBeGreaterThan(0);
        expect(s.startup).toBeLessThan(1);
      }
    }
    expect(bal.hero.defaultCombo.length).toBeGreaterThan(0);
    expect(bal.feel.conjure).toHaveLength(5);
    expect(registry.getForm('bolt').motion).toBeLessThan(0);
    expect(registry.getForm('strike').motion).toBeGreaterThan(0);
  });

  it("keeps each string's damage per interval within 10% of today's", () => {
    for (const w of weapons) {
      const power = w.combo!.reduce((a, s) => a + s.power, 0);
      const time = w.combo!.reduce((a, s) => a + s.time, 0);
      const today = w.attack!.kind === 'melee' ? 3.5 / 3 : 1;
      expect(Math.abs(power / time / today - 1), w.id).toBeLessThanOrEqual(0.1);
    }
  });

  it('the hero carries the weapon string, and the default one when unarmed', () => {
    const maul = computeHeroStats({ weapon: gear('fire', 'weapon', 'maul') }, registry);
    expect(maul.weapon.combo).toHaveLength(2);
    expect(computeHeroStats({}, registry).weapon.combo).toEqual(bal.hero.defaultCombo);
  });
});

const stats = computeHeroStats({ weapon: gear('fire') }, registry);
const resolve = (slot: AbilitySlot, b: Partial<AbilityBuild> & Pick<AbilityBuild, 'form'>) =>
  resolveAbility(registry, slot, { elements: ['fire'], weight: 0, payment: 'mana', ...b }, stats);

describe('ability timing from weight', () => {
  it('conjure grows with weight and by slot; cast payment adds its channel', () => {
    expect(resolve('primary', { form: 'bolt', weight: -2 }).conjure).toBeCloseTo(0.04);
    const crushing = resolve('primary', { form: 'bolt', weight: 2 });
    expect(crushing.conjure).toBeCloseTo(0.38);
    expect(crushing.channel).toBe(0);
    expect(resolve('defensive', { form: 'ward' }).conjure).toBeCloseTo(0.07);
    expect(resolve('ultimate', { form: 'nova', payment: 'charge' }).conjure).toBeCloseTo(0.224);
    const cast = resolve('primary', { form: 'bolt', payment: 'cast' });
    expect(cast.channel).toBeCloseTo(bal.abilities.slots.primary.castTime);
  });

  it('heft and the heavy payoff come from weight', () => {
    const swift = resolve('primary', { form: 'bolt', weight: -2 });
    const crushing = resolve('primary', { form: 'bolt', weight: 2 });
    expect(swift.heft).toBeCloseTo(0.15);
    expect(swift.heavyKnockback).toBe(0);
    expect(swift.heavyStagger).toBe(false);
    expect(crushing.heft).toBeCloseTo(1);
    expect(crushing.heavyKnockback).toBeCloseTo(0.5);
    expect(crushing.heavyStagger).toBe(true);
    const bolt = resolve('primary', { form: 'bolt' });
    expect(stepHeft(bolt, 0)).toBeCloseTo(0.45);
    expect(stepHeft(bolt, bolt.combo.length - 1)).toBeCloseTo(0.65);
    // One-press forms get no last-press bonus; ultimates +0.2.
    expect(stepHeft(resolve('ultimate', { form: 'nova', payment: 'charge' }), 0)).toBeCloseTo(0.65);
  });

  it('motion scales with weight', () => {
    expect(resolve('primary', { form: 'bolt' }).motion).toBeCloseTo(-0.15);
    expect(resolve('primary', { form: 'bolt', weight: 2 }).motion).toBeCloseTo(-0.24);
    expect(resolve('primary', { form: 'strike' }).motion).toBeCloseTo(0.5);
    expect(resolve('defensive', { form: 'ward' }).motion).toBe(0);
  });
});

describe('pushes and buffered input', () => {
  it('a push places the hero by progress and covers its distance even inside one tick', () => {
    const w = arena([], { noBasic: true });
    const ctx = makeCtx(registry, w, []);
    const y0 = w.hero.y;
    startPush(ctx, { x: 0, y: -1 }, 0.3, STEP / 2);
    w.t += STEP;
    expect(pushTick(ctx)).toBe(true);
    expect(y0 - w.hero.y).toBeCloseTo(0.3, 5);
    expect(w.hero.push).toBeNull();
  });

  it('a push toward a foe stops exactly at the contact gap', () => {
    const w = arena([dummy(13, 0)], { noBasic: true });
    const m = w.monsters[0];
    m.y = w.hero.y - w.hero.radius - m.radius - 1;
    const y0 = w.hero.y;
    const ctx = makeCtx(registry, w, []);
    startPush(ctx, { x: 0, y: -1 }, 2, 0.2, m.id);
    for (let i = 0; i < 10; i++) {
      w.t += STEP;
      pushTick(ctx);
    }
    const gap = Math.abs(w.hero.y - m.y) - m.radius - w.hero.radius;
    expect(gap).toBeCloseTo(bal.feel.contactGap, 4);
    expect(y0 - w.hero.y).toBeCloseTo(1 - bal.feel.contactGap, 4);
    expect(w.hero.push).toBeNull();
  });

  it('presses made while the display is frozen (dt 0) are kept', () => {
    const w = arena([dummy(13, 34.6)]);
    stepWorld(registry, w, { move: { x: 0, y: 0 }, attack: false, attackTap: true }, 0);
    stepWorld(registry, w, { move: { x: 0, y: 0 }, cast: { slot: 0 } }, 0);
    expect(w.queuedAttack).toMatchObject({ aim: null });
    expect(w.queuedCast).toEqual({ slot: 0 });
    expect(w.queuedCastUntil).toBeGreaterThan(w.t);
  });
});

/** Put the first foe `gap` units from the hero's edge along `dir` (default straight up). */
function place(w: ArpgWorld, gap: number, dir: Vec = { x: 0, y: -1 }, i = 0): void {
  const m = w.monsters[i];
  const d = w.hero.radius + m.radius + gap;
  m.x = w.hero.x + dir.x * d;
  m.y = w.hero.y + dir.y * d;
}
const basics = (events: ArpgEvent[]) => events.filter((e) => e.kind === 'basic');
const still = { x: 0, y: 0 };
function until(
  w: ArpgWorld,
  done: () => boolean,
  input: ArpgInput = { move: still },
  max = 300,
): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  for (let i = 0; i < max && !done(); i++) events.push(...stepWorld(registry, w, input, STEP));
  return events;
}

describe('basic attacks: startup, strike, recovery', () => {
  it('a committed melee swing lunges in, and the blow lands at the strike', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.6);
    const y0 = w.hero.y;
    const s = w.hero.stats.weapon.combo[0];
    run(w, STEP);
    const sw = w.hero.swing!;
    expect(sw.committed).toBe(true);
    run(w, (sw.strikeAt - w.t) * 0.5);
    expect(damaged(w.monsters[0])).toBe(false);
    const events = until(w, () => w.hero.swing === null);
    expect(basics(events)).toHaveLength(1);
    expect(damaged(w.monsters[0])).toBe(true);
    expect(y0 - w.hero.y).toBeCloseTo(s.step, 2);
  });

  it('the lunge stops short of the foe', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 0.25);
    const y0 = w.hero.y;
    until(w, () => w.hero.swing === null && w.t > 0.1);
    const m = w.monsters[0];
    expect(dist(w.hero.x, w.hero.y, m.x, m.y) - m.radius - w.hero.radius).toBeGreaterThan(0.1);
    expect(y0 - w.hero.y).toBeLessThan(0.15);
  });

  it('ignores movement through a committed startup, then slows it in recovery only', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.0);
    run(w, STEP);
    const x0 = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    expect(w.hero.x).toBe(x0);
    until(w, () => w.hero.swing === null);
    const x1 = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    const pace = w.hero.stats.moveSpeed * STEP;
    expect(w.hero.x - x1).toBeCloseTo(pace * bal.feel.recoveryMove, 4);
    until(w, () => w.t >= w.hero.recoverUntil);
    expect(w.t).toBeLessThan(w.hero.nextAttackAt);
    const x2 = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    expect(w.hero.x - x2).toBeCloseTo(pace, 4);
  });

  it('a committed shot roots the hero through its startup, with no push involved', () => {
    const w = arena([dummy(13, 30)], { equipped: { weapon: gear('fire', 'weapon', 'wand') } });
    stepWorld(registry, w, { move: still, attack: true }, STEP);
    expect(w.hero.swing?.committed).toBe(true);
    expect(w.hero.push).toBeNull();
    const x0 = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 }, attack: true }, STEP);
    expect(w.hero.x).toBe(x0);
  });

  it('automatic swings on the move neither root, lunge nor slow', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.0);
    const x0 = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    expect(w.hero.swing?.committed).toBe(false);
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    expect(w.hero.x - x0).toBeCloseTo(2 * w.hero.stats.moveSpeed * STEP, 4);
    expect(w.hero.push).toBeNull();
  });

  it('a dodge in the startup cancels the swing', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.0);
    run(w, STEP);
    expect(w.hero.swing).not.toBeNull();
    dodge(w, { x: 1, y: 0 });
    expect(w.hero.swing).toBeNull();
    expect(w.hero.nextAttackAt).toBeLessThanOrEqual(w.t);
    expect(w.hero.attackCount).toBe(0);
    expect(damaged(w.monsters[0])).toBe(false);
  });
});

describe('weapon strings', () => {
  it("the sword's third blow is the finisher thrust", () => {
    const w = arena([dummy(13, 0)]);
    place(w, 0.6);
    const all = until(w, () => w.hero.attackCount >= 3);
    const b = basics(all);
    expect(b.map((e) => e.kind === 'basic' && e.step)).toEqual([0, 1, 2]);
    expect(b.map((e) => e.kind === 'basic' && e.finisher)).toEqual([false, false, true]);
    const thrust = w.hero.stats.weapon.combo[2];
    expect(thrust.reach).toBeGreaterThan(0);
    expect(thrust.arc).toBeLessThan(w.hero.stats.weapon.arc);
  });

  it('only the thrust knocks the foe back', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 0.6);
    const m = w.monsters[0];
    until(w, () => w.hero.attackCount >= 2);
    expect(Math.hypot(m.kbx, m.kby)).toBe(0);
    until(w, () => w.hero.attackCount >= 3);
    expect(Math.hypot(m.kbx, m.kby)).toBeGreaterThan(0);
  });

  it("the maul's overhead misses what's behind; its slam hits all around and staggers", () => {
    const w = arena([dummy(13, 0), dummy(13, 0)], {
      equipped: { weapon: gear('fire', 'weapon', 'maul') },
    });
    place(w, 0.4, { x: 0, y: -1 }, 0);
    place(w, 1.0, { x: 0, y: 1 }, 1);
    until(w, () => w.hero.attackCount >= 1);
    expect(damaged(w.monsters[1])).toBe(false);
    until(w, () => w.hero.attackCount >= 2);
    expect(damaged(w.monsters[1])).toBe(true);
    expect(w.monsters[1].status.staggerUntil).toBeGreaterThan(w.t);
  });

  it('a string resets after a pause', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 0.6);
    until(w, () => w.hero.attackCount >= 1);
    const foe = { ...w.monsters[0] };
    w.monsters = [];
    run(w, w.hero.stats.attackInterval + bal.hero.basicComboGrace + 0.1);
    w.monsters = [foe];
    until(w, () => w.hero.swing !== null);
    expect(w.hero.swing!.step).toBe(0);
  });

  it('a new weapon starts its own string; other gear keeps the swing', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 0.6);
    until(w, () => w.hero.attackCount >= 1);
    until(w, () => w.hero.swing !== null);
    // Same weapon base (same string): the swing carries on.
    refreshWorldHero(
      registry,
      w,
      computeHeroStats({ weapon: gear('fire') }, registry),
      DEFAULT_BUILDS,
    );
    expect(w.hero.swing).not.toBeNull();
    expect(w.hero.attackCount).toBe(1);
    // A maul: the swing is dropped, the string restarts and the weapon is ready.
    refreshWorldHero(
      registry,
      w,
      computeHeroStats({ weapon: gear('fire', 'weapon', 'maul') }, registry),
      DEFAULT_BUILDS,
    );
    expect(w.hero.swing).toBeNull();
    expect(w.hero.attackCount).toBe(0);
    expect(w.hero.nextAttackAt).toBeLessThanOrEqual(w.t);
  });

  it('a committed shot recoils after the release; one on the move does not', () => {
    const wand = { weapon: gear('fire', 'weapon', 'wand') };
    const w = arena([dummy(13, 30)], { equipped: wand });
    const y0 = w.hero.y;
    until(w, () => w.hero.attackCount >= 1);
    run(w, bal.feel.recoilSeconds + STEP);
    expect(w.hero.y - y0).toBeCloseTo(-w.hero.stats.weapon.combo[0].step, 2);

    const m = arena([dummy(13, 30)], { equipped: wand });
    const my0 = m.hero.y;
    until(m, () => m.hero.attackCount >= 1, { move: { x: 1, y: 0 } });
    run(m, bal.feel.recoilSeconds + STEP, { x: 1, y: 0 });
    expect(m.hero.y).toBeCloseTo(my0, 6);
  });

  it("the staff's great orb bursts over a crowd", () => {
    const w = arena([dummy(13, 30), dummy(13.7, 30), dummy(12.3, 30)], {
      equipped: { weapon: gear('fire', 'weapon', 'staff') },
    });
    w.hero.attackCount = 2;
    w.hero.lastBasicAt = 0;
    const events = until(w, () => w.monsters.every(damaged), { move: still }, 120);
    expect(events.some((e) => e.kind === 'explode')).toBe(true);
    expect(w.monsters.every(damaged)).toBe(true);
  });

  it("Twin Fang strikes again on the string's last blow, at today's value (melee ×1.5)", () => {
    const w = arena([dummy(13, 0)]);
    place(w, 0.6);
    w.hero.stats.legendaries.twin_fang = 100;
    const events = until(w, () => w.hero.attackCount >= 3);
    const blows = events.filter((e) => e.kind === 'hit' && e.heft > 0);
    expect(blows).toHaveLength(4);
    const [thrust, twin] = blows.slice(2) as Extract<ArpgEvent, { kind: 'hit' }>[];
    // Same swing, same crit roll and resistances: only the multipliers differ.
    expect(twin.amount / thrust.amount).toBeCloseTo(1.5 / w.hero.stats.weapon.combo[2].power, 2);
  });

  it('ranged Twin Fang fires a second shot at ×1.0, copying the size but never exploding', () => {
    // The staff's last blow is the exploding great orb: its twin must not burst.
    const w = arena([dummy(13, 33)], { equipped: { weapon: gear('fire', 'weapon', 'staff') } });
    w.hero.stats.legendaries.twin_fang = 100;
    w.hero.attackCount = 2;
    w.hero.lastBasicAt = 0;
    until(w, () => w.projectiles.length > 0);
    expect(w.projectiles).toHaveLength(2);
    expect(w.projectiles[1].radius).toBeCloseTo(w.projectiles[0].radius);
    expect(w.projectiles[1].explodeRadius).toBe(0);
    expect(w.projectiles[1].damage / w.projectiles[0].damage).toBeCloseTo(
      1 / w.hero.stats.weapon.combo[2].power,
      5,
    );
  });

  it('a tap during a swing is kept and starts the next blow', () => {
    const w = arena([dummy(13, 34.6)]);
    stepWorld(registry, w, { move: still, attack: true, attackTap: true }, STEP);
    expect(w.hero.swing).not.toBeNull();
    stepWorld(registry, w, { move: still, attack: false, attackTap: true }, STEP);
    const events = until(w, () => w.hero.attackCount >= 2, { move: still, attack: false });
    expect(basics(events).length).toBeGreaterThanOrEqual(2);
  });
});
