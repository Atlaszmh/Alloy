import { describe, it, expect } from 'vitest';
import { applyStyle, resolveAbility } from '../src/arpg/abilities/resolve.js';
import { executeForm } from '../src/arpg/abilities/forms.js';
import { SIGNATURES, signatureFor, withSignature } from '../src/arpg/abilities/signatures.js';
import { makeCtx } from '../src/arpg/combat.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { Move } from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { CastStyle } from '../src/types/arpg.js';
import { arena, dummy, gear, press, registry } from './fixtures/arena.js';

// See the constructs spec §4.2 (how a style applies) and §4.3 (the signature hook): in Phase A
// the pipeline is wired and inert (every factor 1, every trait empty) and the table is empty.

const bolt: Move = { kind: 'medium', form: 'bolt', elements: ['fire'] };
const stats = (baseId: string | null) =>
  computeHeroStats(
    baseId ? { weapon: { ...gear('fire'), baseId }, chest: gear('earth', 'chest') } : {},
    registry,
  );

describe('applyStyle', () => {
  it('with every factor 1, every form on every weapon comes back as it is, a melee weapon taking its melee block', () => {
    // The sword's style is the identity (B1 Task 8 gave the others their numbers).
    for (const base of registry.getGearBasesForSlot('weapon').filter((b) => b.id === 'sword'))
      for (const form of registry.getArpgData().forms) {
        const { text: _text, ...melee } = form.melee ?? {};
        const want = base.class === 'melee' ? { ...form, ...melee } : form;
        expect(applyStyle(form, base.class!, base.style!), `${base.id} ${form.id}`).toEqual(want);
      }
    expect(applyStyle(registry.getForm('bolt'), null, null)).toEqual(registry.getForm('bolt'));
  });

  it("scales the form's base by the style's numbers, after a melee weapon takes the melee block", () => {
    const style: CastStyle = {
      name: 'Heavy',
      numbers: {
        windup: 1.3,
        cooldown: 1.15,
        power: 1.25,
        range: 1,
        radius: 1.15,
        speed: 0.8,
        duration: 1,
      },
      motion: 'plant',
      trait: {},
      look: 'stone',
    };
    const lance = { ...registry.getForm('lance'), melee: { range: 5, motion: 0.8 } };
    const ranged = applyStyle(lance, 'ranged', style);
    expect([ranged.range, ranged.motion, ranged.power, ranged.radius]).toEqual([
      7.5,
      -0.3,
      1.55 * 1.25,
      0.55 * 1.15,
    ]);
    const melee = applyStyle(lance, 'melee', style);
    expect([melee.range, melee.motion, melee.power]).toEqual([5, 0.8, 1.55 * 1.25]);
    const bow = applyStyle(registry.getForm('bolt'), 'ranged', style);
    expect([bow.speed, bow.duration]).toEqual([13 * 0.8, undefined]);
    const ward = applyStyle(registry.getForm('ward'), 'ranged', style);
    expect([ward.duration, ward.radius]).toEqual([6, 2.6 * 1.15]);
  });
});

describe('the style pipeline in resolveAbility (inert in A)', () => {
  it('resolves a shared form to the same numbers on a sword and a staff, and names the look', () => {
    const sword = resolveAbility(registry, 'primary', bolt, 'mana', stats('sword'));
    const staffStats = stats('staff');
    const staff = resolveAbility(registry, 'primary', bolt, 'mana', staffStats);
    // Given the sword's style, the staff resolves the same numbers (the pipeline is the style alone).
    const swapped = resolveAbility(registry, 'primary', bolt, 'mana', {
      ...staffStats,
      weapon: { ...staffStats.weapon, style: stats('sword').weapon.style },
    });
    const { look: _s, ...a } = sword;
    const { look: _t, ...b } = swapped;
    expect(a).toEqual(b);
    expect([sword.look, staff.look]).toEqual(['crescent', 'orb']);
    expect(resolveAbility(registry, 'primary', bolt, 'mana', stats(null)).look).toBeNull();
  });

  it('computeHeroStats carries the weapon class and style; unarmed neither', () => {
    const bow = stats('bow').weapon;
    expect(bow.class).toBe('ranged');
    expect(bow.style).toEqual(registry.getGearBase('bow').style);
    const bare = stats(null).weapon;
    expect([bare.class, bare.style]).toEqual([null, null]);
  });

  it("a cast event carries the casting weapon's look", () => {
    const w = arena([dummy(14, 10)]);
    const cast = press(w, 0).find(
      (e): e is Extract<ArpgEvent, { kind: 'cast' }> => e.kind === 'cast',
    );
    expect(cast?.look).toBe('crescent');
  });
});

describe('the signature hook', () => {
  it('ships empty, and a bound entry replaces the form behaviour until restored', () => {
    expect(Object.keys(SIGNATURES)).toEqual([]);
    expect(signatureFor('sword', 'bolt')).toBeUndefined();
    expect(signatureFor(null, 'bolt')).toBeUndefined();
    const w = arena([dummy(14, 10)]);
    const ab = resolveAbility(registry, 'primary', bolt, 'mana', w.hero.stats);
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    const seen: string[] = [];
    const res = withSignature(
      'sword:bolt',
      (c, a, aim) => {
        seen.push(`${a.form.id}@${c.world.hero.stats.weapon.baseId}:${aim ? 'aimed' : 'auto'}`);
        return { ok: true, tx: 1, ty: 2 };
      },
      () => {
        expect(signatureFor('sword', 'bolt')).toBeDefined();
        expect(signatureFor('bow', 'bolt')).toBeUndefined();
        return executeForm(ctx, ab, null);
      },
    );
    expect(res).toEqual({ ok: true, tx: 1, ty: 2 });
    expect(seen).toEqual(['bolt@sword:auto']);
    expect(w.projectiles).toHaveLength(0);
    expect(signatureFor('sword', 'bolt')).toBeUndefined();
    expect(Object.keys(SIGNATURES)).toEqual([]);
    // Without it, a Bolt spawns its shot.
    executeForm(ctx, ab, null);
    expect(w.projectiles).toHaveLength(1);
  });
});
