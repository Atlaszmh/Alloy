import { describe, it, expect } from 'vitest';
import { applyStatus, freeze, hurtHero, makeCtx } from '../src/arpg/combat.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import { arena, damaged, dummy, gear, press, registry, run } from './fixtures/arena.js';

// The hero starts at (13, 36), facing up (-y).

describe('primary forms', () => {
  it('Bolt flies to the nearest foe and bursts', () => {
    const w = arena([dummy(13, 30), dummy(13, 20)], { noBasic: true });
    press(w, 0);
    run(w, 1);
    expect(damaged(w.monsters[0])).toBe(true);
    expect(damaged(w.monsters[1])).toBe(false);
  });

  it('Bolt combos go small, small, medium, large, then reset after the window', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    const ab = w.hero.abilities[0];
    const sizes: number[] = [];
    for (let i = 0; i < 5; i++) {
      press(w, 0);
      sizes.push(w.projectiles.at(-1)!.explodeRadius / ab.radius);
      run(w, ab.cooldown + 0.05);
    }
    expect(sizes.map((s) => +s.toFixed(2))).toEqual([0.8, 0.8, 1, 1.5, 0.8]);
    run(w, registry.getDelveBalance().abilities.comboWindow + 0.1);
    press(w, 0);
    expect(w.hero.comboStep[0]).toBe(0);
  });

  it('Volley darts home in on different foes', () => {
    const w = arena([dummy(9, 30), dummy(13, 29), dummy(17, 30)], { noBasic: true, primary: { form: 'volley' } });
    press(w, 0);
    run(w, 1.5);
    expect(w.monsters.every(damaged)).toBe(true);
  });

  it('Lance hits every foe on its line at once', () => {
    const w = arena([dummy(13, 33), dummy(13, 31), dummy(13, 29.5), dummy(18, 31)], { noBasic: true, primary: { form: 'lance' } });
    const events = press(w, 0);
    expect(w.monsters.slice(0, 3).every(damaged)).toBe(true);
    expect(damaged(w.monsters[3])).toBe(false);
    expect(events.some((e) => e.kind === 'beam')).toBe(true);
  });

  it('Burst lands where it is aimed', () => {
    const w = arena([dummy(13, 29), dummy(13, 34.6)], { noBasic: true, primary: { form: 'burst' } });
    press(w, 0, { x: 13, y: 29 });
    expect(damaged(w.monsters[0])).toBe(true);
    expect(damaged(w.monsters[1])).toBe(false);
  });

  it("Strike's fourth press slams everything around the hero", () => {
    const w = arena([dummy(13, 34.4), dummy(13, 37.8)], { noBasic: true, primary: { form: 'strike' } });
    const behind = w.monsters[1];
    for (let i = 0; i < 3; i++) {
      press(w, 0);
      run(w, w.hero.abilities[0].cooldown + 0.05);
    }
    expect(damaged(behind)).toBe(false);
    press(w, 0);
    expect(damaged(behind)).toBe(true);
  });
});

describe('defensive forms', () => {
  it('Ward absorbs damage, then bursts when it breaks', () => {
    const w = arena([dummy(14, 36)], { noBasic: true });
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    press(w, 1);
    expect(w.hero.ward).not.toBeNull();
    const hp = w.hero.hp;
    hurtHero(ctx, 5, null, null, { unavoidable: true });
    expect(w.hero.hp).toBe(hp);
    hurtHero(ctx, 1e4, null, null, { unavoidable: true });
    expect(events.some((e) => e.kind === 'wardBreak')).toBe(true);
    expect(damaged(w.monsters[0])).toBe(true);
    expect(w.hero.ward).toBeNull();
  });

  it('Armor cuts damage taken and strikes melee attackers', () => {
    const plain = arena([dummy(14, 36)], { noBasic: true, defensive: { form: 'armor' } });
    const armored = arena([dummy(14, 36)], { noBasic: true, defensive: { form: 'armor' } });
    press(armored, 1);
    for (const w of [plain, armored]) hurtHero(makeCtx(registry, w, []), 50, null, w.monsters[0], { melee: true });
    const lost = (w: typeof plain) => w.hero.stats.maxHp - w.hero.hp;
    expect(lost(armored)).toBeLessThan(lost(plain) * 0.7);
    expect(damaged(armored.monsters[0])).toBe(true);
    expect(damaged(plain.monsters[0])).toBe(false);
  });

  it('Surge speeds up basic attacks', () => {
    const count = (surge: boolean) => {
      const w = arena([dummy(13, 32)], { defensive: { form: 'surge' }, equipped: { weapon: gear('fire', 'weapon', 'staff') } });
      const events = [...(surge ? press(w, 1) : []), ...run(w, 4)];
      return events.filter((e) => e.kind === 'basic').length;
    };
    expect(count(true)).toBeGreaterThan(count(false));
  });

  it('Blink dashes toward the aim point and makes the hero untouchable', () => {
    const w = arena([dummy(13, 20)], { noBasic: true, defensive: { form: 'blink' } });
    const events = press(w, 1, { x: 13, y: 20 });
    expect(w.hero.y).toBeLessThan(36 - 4);
    expect(w.hero.invulnUntil).toBeGreaterThan(w.t);
    expect(events.some((e) => e.kind === 'dash')).toBe(true);
  });
});

describe('ultimate forms', () => {
  it('Nova blasts everything around the hero', () => {
    const w = arena([dummy(10, 36), dummy(16, 34), dummy(13, 26)], { noBasic: true, ultimate: { payment: 'mana' } });
    press(w, 2);
    expect(damaged(w.monsters[0])).toBe(true);
    expect(damaged(w.monsters[1])).toBe(true);
    expect(damaged(w.monsters[2])).toBe(false);
  });

  it('Barrage rains its impacts over the target area', () => {
    const w = arena([dummy(13, 28)], { noBasic: true, ultimate: { form: 'barrage', payment: 'mana' } });
    press(w, 2);
    const events = run(w, 2);
    const count = registry.getForm('barrage').count!;
    expect(events.filter((e) => e.kind === 'explode').length).toBe(count);
    expect(damaged(w.monsters[0])).toBe(true);
  });

  it('Maelstrom leaves a zone that keeps hitting', () => {
    const w = arena([dummy(13, 28)], { noBasic: true, ultimate: { form: 'maelstrom', payment: 'mana' } });
    press(w, 2);
    const events = run(w, 2);
    expect(events.filter((e) => e.kind === 'hit' && e.id === w.monsters[0].id).length).toBeGreaterThanOrEqual(3);
  });
});

describe('knobs', () => {
  it('chain: Storm hits jump to another foe', () => {
    const w = arena([dummy(13, 30), dummy(16, 30)], { noBasic: true, primary: { elements: ['storm'] } });
    press(w, 0);
    const events = run(w, 1);
    expect(events.some((e) => e.kind === 'chain')).toBe(true);
    expect(w.monsters.every(damaged)).toBe(true);
  });

  it('pull: Magnetism drags foes toward the impact', () => {
    const w = arena([dummy(13, 28), dummy(16, 28)], { noBasic: true, primary: { form: 'burst', elements: ['storm', 'earth'] } });
    press(w, 0, { x: 13, y: 28 });
    expect(w.monsters[1].x).toBeLessThan(16);
  });

  it('execute: Soulfrost shatters frozen foes at low life', () => {
    const w = arena([dummy(13, 29, { hp: 1000, maxHp: 1e6 })], { noBasic: true, primary: { form: 'burst', elements: ['frost', 'shadow'] } });
    freeze(makeCtx(registry, w, []), w.monsters[0], 5);
    press(w, 0, { x: 13, y: 29 });
    expect(w.monsters).toHaveLength(0);
  });

  it('spread: Plague passes hex on when a foe dies', () => {
    const w = arena([dummy(13, 29, { hp: 1, maxHp: 1e6 }), dummy(14.5, 29)], {
      noBasic: true,
      primary: { form: 'lance', elements: ['shadow', 'nature'] },
    });
    const ctx = makeCtx(registry, w, []);
    applyStatus(ctx, w.monsters[0], 'hex', 0);
    press(w, 0, { x: 13, y: 29 });
    expect(w.monsters).toHaveLength(1);
    expect(w.monsters[0].status.hexUntil).toBeGreaterThan(w.t);
  });

  it('scatter: Wildfire lands off the aim point', () => {
    const w = arena([dummy(13, 28)], { noBasic: true, primary: { form: 'burst', elements: ['fire', 'nature'] } });
    const events = press(w, 0, { x: 13, y: 28 });
    const blast = events.find((e) => e.kind === 'explode')!;
    expect(blast.kind === 'explode' && Math.hypot(blast.x - 13, blast.y - 28)).toBeGreaterThan(0.01);
  });
});
