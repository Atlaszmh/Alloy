import { describe, it, expect } from 'vitest';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { resolveAbility, stepHeft } from '../src/arpg/abilities/resolve.js';
import type { AbilityBuild, AbilitySlot } from '../src/types/ability.js';
import { stepWorld } from '../src/arpg/step.js';
import { makeCtx } from '../src/arpg/combat.js';
import { pushTick, startPush } from '../src/arpg/action.js';
import { arena, bal, dummy, gear, registry, STEP } from './fixtures/arena.js';

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
