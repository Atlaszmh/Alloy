import { describe, it, expect } from 'vitest';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { resolveAbility, stepHeft } from '../src/arpg/abilities/resolve.js';
import type { AbilityBuild, AbilitySlot } from '../src/types/ability.js';
import type { ArpgEvent, ArpgInput, ArpgWorld, Vec } from '../src/types/arpg.js';
import { stepWorld } from '../src/arpg/step.js';
import { makeCtx } from '../src/arpg/combat.js';
import { pushTick, startPush } from '../src/arpg/action.js';
import { dist } from '../src/arpg/geometry.js';
import { spawnProjectile } from '../src/arpg/abilities/targeting.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import {
  arena,
  bal,
  damaged,
  DEFAULT_BUILDS,
  dodge,
  dummy,
  gear,
  press,
  pressOnly,
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
    const check = (id: string, combo: { power: number; time: number }[], melee: boolean) => {
      const power = combo.reduce((a, s) => a + s.power, 0);
      const time = combo.reduce((a, s) => a + s.time, 0);
      const today = melee ? 3.5 / 3 : 1;
      expect(Math.abs(power / time / today - 1), id).toBeLessThanOrEqual(0.1);
    };
    for (const w of weapons) check(w.id, w.combo!, w.attack!.kind === 'melee');
    check('default', bal.hero.defaultCombo, true);
  });

  it('the hero carries the weapon string, and the default one when unarmed', () => {
    const maul = computeHeroStats({ weapon: gear('fire', 'weapon', 'maul') }, registry);
    expect(maul.weapon.combo).toHaveLength(2);
    expect(maul.weapon.combo).toEqual(registry.getGearBase('maul').combo);
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
    expect(resolve('primary', { form: 'bolt' }).recovery).toBeCloseTo(0.16);
    expect(resolve('defensive', { form: 'ward' }).recovery).toBe(0);
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
    expect(resolve('primary', { form: 'bolt', weight: 1 }).heavyStagger).toBe(false);
    expect(resolve('ultimate', { form: 'nova', weight: 2, payment: 'charge' }).heft).toBeCloseTo(1);
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

  it('a tap in automatic mode is not recorded', () => {
    const w = arena([dummy(13, 34.6)]);
    stepWorld(registry, w, { move: { x: 0, y: 0 }, attackTap: true }, 0);
    expect(w.queuedAttack).toBeNull();
  });

  it('a lunge whose foe dies ends at once', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.6);
    const y0 = w.hero.y;
    run(w, 3 * STEP);
    expect(w.hero.push?.stopId).toBe(w.monsters[0].id);
    const y1 = w.hero.y;
    expect(y0 - y1).toBeGreaterThan(0);
    w.monsters[0].dead = true;
    until(w, () => w.hero.swing === null);
    expect(w.hero.y).toBe(y1);
    expect(w.hero.push).toBeNull();
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
  for (let i = 0; !done(); i++) {
    if (i >= max) throw new Error(`until: not done after ${max} steps`);
    events.push(...stepWorld(registry, w, input, STEP));
  }
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
    expect(y0 - w.hero.y).toBeCloseTo(s.move, 2);
  });

  it('the lunge stops short of the foe', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 0.25);
    const y0 = w.hero.y;
    until(w, () => w.hero.swing === null && w.t > 0.1);
    const m = w.monsters[0];
    const gap = dist(w.hero.x, w.hero.y, m.x, m.y) - m.radius - w.hero.radius;
    expect(gap).toBeCloseTo(bal.feel.contactGap, 3);
    expect(y0 - w.hero.y).toBeCloseTo(0.25 - bal.feel.contactGap, 3);
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
    // Past the strike: no recovery slow.
    const events = until(w, () => w.hero.swing === null, { move: { x: 1, y: 0 } });
    expect(basics(events)).toHaveLength(1);
    const x1 = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    expect(w.hero.x - x1).toBeCloseTo(w.hero.stats.moveSpeed * STEP, 4);
  });

  it("an automatic swing on the move keeps an ability's push and recovery", () => {
    const w = arena([dummy(13, 30)], { equipped: { weapon: gear('fire', 'weapon', 'wand') } });
    const y0 = w.hero.y;
    // The push outlasts the shot's startup, so both its start and its strike leave it alone.
    startPush(makeCtx(registry, w, []), { x: 0, y: 1 }, 0.3, 0.3);
    const recoverUntil = (w.hero.recoverUntil = w.t + 0.3);
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    expect(w.hero.swing?.committed).toBe(false);
    const events = run(w, 0.3, { x: 1, y: 0 });
    expect(basics(events)).toHaveLength(1);
    expect(w.hero.y - y0).toBeCloseTo(0.3, 5);
    expect(w.hero.recoverUntil).toBe(recoverUntil);
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

  it("the sword's thrust reaches a foe the first blow can't", () => {
    // The foe's edge is 3.6 units from the hero: past the first blow's range plus lunge, and
    // past the thrust's range plus lunge too, so only its extra reach gets there.
    const setup = (count: number) => {
      const w = arena([dummy(13, 0)]);
      place(w, 3.6 - w.hero.radius);
      w.hero.attackCount = count;
      w.hero.lastBasicAt = w.t;
      const m = w.monsters[0];
      const input = { move: still, attack: true, attackAim: { x: m.x, y: m.y } };
      return { w, m, input };
    };
    const [first, , thrust] = arena().hero.stats.weapon.combo;
    const range = arena().hero.stats.weapon.range;
    expect(range + (first.reach ?? 0) + first.move).toBeLessThan(3.6);
    expect(range + thrust.move).toBeLessThan(3.6);
    expect(range + (thrust.reach ?? 0) + thrust.move).toBeGreaterThan(3.6);

    const a = setup(0);
    until(a.w, () => a.w.hero.attackCount >= 1, a.input);
    expect(damaged(a.m)).toBe(false);

    const b = setup(2);
    until(b.w, () => b.w.hero.attackCount >= 3, b.input);
    expect(damaged(b.m)).toBe(true);
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
    // Out of reach for the pause (emptying the arena would clear the floor).
    w.monsters[0].y = 2;
    run(w, w.hero.stats.attackInterval + bal.hero.basicComboGrace + 0.1);
    place(w, 0.6);
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
    expect(w.hero.y - y0).toBeCloseTo(-w.hero.stats.weapon.combo[0].move, 2);

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

  it("the staff's great orb bursts at the end of its flight, hitting a foe beside it", () => {
    // Fired straight up; the foe stands beside where the flight ends, clear of the path.
    const w = arena([dummy(14.2, 0)], { equipped: { weapon: gear('fire', 'weapon', 'staff') } });
    const orb = w.hero.stats.weapon.combo[2];
    w.monsters[0].y = w.hero.y - 0.5 - (w.hero.stats.weapon.range + 1.5);
    w.hero.attackCount = 2;
    w.hero.lastBasicAt = w.t;
    const events = stepWorld(
      registry,
      w,
      { move: still, attack: true, attackAim: { x: w.hero.x, y: 0 } },
      STEP,
    );
    events.push(
      ...until(w, () => w.hero.attackCount >= 3 && w.projectiles.length === 0, {
        move: still,
        attack: false,
      }),
    );
    const burst = events.find((e) => e.kind === 'explode');
    expect(burst).toMatchObject({ radius: orb.explode });
    expect(damaged(w.monsters[0])).toBe(true);
  });

  it('a basic burst always hits the foe its shot struck', () => {
    // A burst smaller than the shot: the struck foe is outside it, yet still hit.
    const w = arena([dummy(13, 30)], { noBasic: true });
    spawnProjectile(makeCtx(registry, w, []), {
      owner: 'hero',
      form: null,
      ability: null,
      homingId: null,
      x: 13,
      y: 35,
      vx: 0,
      vy: -13,
      radius: 0.5,
      damage: 10,
      element: 'fire',
      pierce: false,
      maxDist: 10,
      explodeRadius: 0.01,
      applies: [],
      knockback: 0,
    });
    const events = until(w, () => w.projectiles.length === 0);
    expect(events.some((e) => e.kind === 'explode')).toBe(true);
    expect(damaged(w.monsters[0])).toBe(true);
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
    expect(basics(events)).toHaveLength(2);
  });
});

describe('presses held by a dash', () => {
  it('a Q pressed on the same frame as a dodge fires after the dash', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    const events = stepWorld(
      registry,
      w,
      { move: { x: 1, y: 0 }, dodge: true, cast: { slot: 0 } },
      STEP,
    );
    // The dash, then the wind-up (a tick for the dodge to start, one of float drift, a spare).
    events.push(...run(w, bal.dodge.duration + w.hero.abilities[0].castTime + 4 * STEP));
    expect(events.some((e) => e.kind === 'cast' && e.slot === 0)).toBe(true);
  });

  it('a tap on the same frame as a dodge swings after the dash', () => {
    const w = arena([dummy(13, 34.6)]);
    const events = stepWorld(
      registry,
      w,
      { move: still, attack: false, attackTap: true, dodge: true },
      STEP,
    );
    const s = w.hero.stats.weapon.combo[0];
    const startup = w.hero.stats.attackInterval * s.time * s.startup;
    // The dash, then the startup (a tick for the dodge to start, one of float drift, one to
    // reach the strike, a spare).
    const end = bal.dodge.duration + startup + 4 * STEP;
    events.push(...until(w, () => w.t >= end, { move: still, attack: false }));
    expect(basics(events)).toHaveLength(1);
  });

  it('a tap left when the input turns automatic is dropped', () => {
    // Automatic swings at a foe in reach would otherwise hold it forever.
    const w = arena([dummy(13, 34.6)]);
    stepWorld(registry, w, { move: still, attack: false, attackTap: true }, 0);
    expect(w.queuedAttack).not.toBeNull();
    const events = run(w, 1);
    expect(basics(events).length).toBeGreaterThan(0);
    expect(w.queuedAttack).toBeNull();
  });
});

describe('casting: conjure, motion, recovery', () => {
  it('every ability winds up for its conjure; cast payment adds its channel', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    pressOnly(w, 0);
    const wu = w.hero.windup!;
    expect(wu.until - wu.start).toBeCloseTo(w.hero.abilities[0].conjure, 5);
    const c = arena([dummy(13, 30)], { noBasic: true, primary: { payment: 'cast' } });
    pressOnly(c, 0);
    const ab = c.hero.abilities[0];
    expect(c.hero.windup!.until - c.hero.windup!.start).toBeCloseTo(ab.conjure + ab.channel, 5);
  });

  it('a held Balanced primary keeps its cadence (the conjure overlaps the cooldown)', () => {
    const w = arena([dummy(13, 30, { hp: 1e9, maxHp: 1e9 })], { noBasic: true });
    w.hero.mana = w.hero.manaMax = 1e6;
    let casts = 0;
    for (let i = 0; i < Math.round(2 / STEP); i++)
      casts += stepWorld(registry, w, { move: still, cast: { slot: 0 } }, STEP).filter(
        (e) => e.kind === 'cast',
      ).length;
    expect(casts).toBe(Math.floor(2 / w.hero.abilities[0].cooldown));
  });

  it('the press-combo step is chosen at the press', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    w.hero.mana = w.hero.manaMax = 1e6;
    press(w, 0);
    run(w, w.hero.abilities[0].cooldown);
    pressOnly(w, 0);
    expect(w.hero.windup!.step).toBe(1);
  });

  it('a bolt recoils the hero after its release', () => {
    const w = arena([dummy(13, 28)], { noBasic: true });
    const y0 = w.hero.y;
    press(w, 0);
    run(w, bal.feel.recoilSeconds + STEP);
    const bolt = w.hero.abilities[0];
    expect(w.hero.y - y0).toBeCloseTo(-bolt.motion * bolt.combo[0], 2);
  });

  it('with basics on, the shot that follows a bolt keeps its recoil and recovery (guard test)', () => {
    // The wand's committed shot starts on the landing tick: it leaves the recoil alone, and its
    // root and its own recovery hold the hero at least as long as the bolt's recovery.
    const w = arena([dummy(13, 30)], { equipped: { weapon: gear('fire', 'weapon', 'wand') } });
    const y0 = w.hero.y;
    const bolt = w.hero.abilities[0];
    press(w, 0);
    const landed = w.t;
    expect(w.hero.swing?.committed).toBe(true);
    until(w, () => w.t >= landed + bal.feel.recoilSeconds);
    expect(w.hero.y - y0).toBeCloseTo(-bolt.motion * bolt.combo[0], 2);
    expect(w.hero.recoverUntil).toBeGreaterThanOrEqual(landed + bolt.recovery - 1e-9);
  });

  it('a strike steps in over its conjure and hits from there', () => {
    const w = arena([dummy(13, 0)], { noBasic: true, primary: { form: 'strike' } });
    const ab = w.hero.abilities[0];
    place(w, ab.radius - w.hero.radius + 0.3);
    const y0 = w.hero.y;
    press(w, 0, { x: 13, y: 20 });
    expect(y0 - w.hero.y).toBeGreaterThan(0.3);
    expect(damaged(w.monsters[0])).toBe(true);
  });

  it('recovery follows an ability, except the Defensive', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    press(w, 0);
    expect(w.hero.recoverUntil).toBeGreaterThan(w.t);
    const d = arena([dummy(13, 30)], { noBasic: true });
    press(d, 1);
    expect(d.hero.recoverUntil).toBeLessThanOrEqual(d.t);
  });

  it('a press cancels a swing startup only when the cast goes ahead', () => {
    const w = arena([dummy(13, 0)], { primary: { form: 'strike' } });
    place(w, 1.0);
    run(w, STEP);
    expect(w.hero.swing).not.toBeNull();
    w.hero.cooldowns[0] = w.t + 5;
    pressOnly(w, 0);
    expect(w.hero.swing).not.toBeNull();
    w.hero.cooldowns[0] = 0;
    pressOnly(w, 0, { x: 13, y: 20 });
    expect(w.hero.swing).toBeNull();
    expect(w.hero.windup).not.toBeNull();
    // Its own step-in survives the cancel.
    expect(w.hero.push).not.toBeNull();
  });

  it('a dodge out of a wind-up refunds charge; mana stays spent', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    const ult = w.hero.abilities[2];
    w.hero.charge[2] = ult.chargeNeed;
    pressOnly(w, 2);
    expect(w.hero.charge[2]).toBe(0);
    dodge(w, { x: 1, y: 0 });
    expect(w.hero.charge[2]).toBeCloseTo(ult.chargeNeed);
    const m = arena([dummy(13, 30)], { noBasic: true });
    const mana = m.hero.mana;
    pressOnly(m, 0);
    dodge(m, { x: 1, y: 0 });
    expect(m.hero.mana).toBeLessThan(mana - m.hero.abilities[0].cost + 1);
  });

  it('a press during a wind-up fires when it lands; a stale press is dropped', () => {
    const w = arena([dummy(13, 30)], { noBasic: true, ultimate: { payment: 'cast' } });
    pressOnly(w, 2);
    stepWorld(registry, w, { move: still, cast: { slot: 0 } }, STEP);
    const events = run(w, w.hero.abilities[2].castTime + 0.3);
    expect(events.some((e) => e.kind === 'cast' && e.slot === 0)).toBe(true);
    const s = arena([dummy(13, 30)], { noBasic: true });
    s.queuedCast = { slot: 0 };
    s.queuedCastUntil = s.t - 1;
    expect(run(s, 0.5).some((e) => e.kind === 'cast')).toBe(false);
  });
});
