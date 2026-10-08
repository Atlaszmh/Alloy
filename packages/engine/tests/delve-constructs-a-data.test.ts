import { describe, it, expect } from 'vitest';
import { ArpgDataSchema, DelveDataSchema, KnobsSchema } from '../src/data/schemas.js';
import arpgData from '../src/data/arpg.json';
import delveData from '../src/data/delve.json';
import { NEUTRAL, mergeKnobs } from '../src/arpg/abilities/resolve.js';
import { SLOT_FORMS } from '../src/delve/profile-schema.js';
import { stepWorld } from '../src/arpg/step.js';
import { fillCharge } from '../src/arpg/sandbox.js';
import type { FormId } from '../src/types/ability.js';
import type { WeaponClass } from '../src/types/ability.js';
import { STEP, arena, dummy, press, registry } from './fixtures/arena.js';

// See the constructs spec, §2 (forms and weapon classes), §2.3 (Detonate's knob) and §4.1 (the
// cast styles' data): in Phase A every class, style and new form is data the sim doesn't read.

const ok = (schema: { safeParse: (x: unknown) => { success: boolean } }, x: unknown) =>
  schema.safeParse(x).success;

describe('forms by class', () => {
  it('holds 15 forms, each with its class: the melee-only, the ranged-only and the shared', () => {
    const forms = registry.getArpgData().forms;
    expect(forms).toHaveLength(15);
    const byClass = (cls: string) => forms.filter((f) => f.class === cls).map((f) => f.id);
    expect(byClass('melee')).toEqual(['strike', 'whirl', 'armor', 'onslaught']);
    expect(byClass('ranged')).toEqual(['bolt', 'volley', 'repel', 'barrage']);
    expect(byClass('both')).toEqual(['lance', 'burst', 'ward', 'surge', 'blink', 'nova', 'maelstrom']);
  });

  it('the three new rows carry their first numbers and sit in their slots', () => {
    expect(registry.getForm('whirl')).toMatchObject({
      slot: 'primary',
      class: 'melee',
      defaultChain: ['medium', 'medium', 'heavy'],
      power: 1.1,
      radius: 2.4,
      duration: 1.5,
      tick: 0.5,
    });
    expect(registry.getForm('repel')).toMatchObject({
      slot: 'defensive',
      class: 'ranged',
      defaultChain: ['medium'],
      power: 0.6,
      effect: 0.5,
      radius: 3,
    });
    expect(registry.getForm('onslaught')).toMatchObject({
      slot: 'ultimate',
      class: 'melee',
      defaultChain: ['medium'],
      power: 1.2,
      range: 6,
      radius: 3,
      count: 5,
      duration: 1.2,
    });
    for (const slot of ['primary', 'defensive', 'ultimate'] as const)
      expect(SLOT_FORMS[slot].sort()).toEqual(
        registry
          .getArpgData()
          .forms.filter((f) => f.slot === slot)
          .map((f) => f.id)
          .sort(),
      );
  });

  it('the schema requires a class on every form and exactly 15 rows', () => {
    expect(ok(ArpgDataSchema, arpgData)).toBe(true);
    const forms = arpgData.forms.map((f, i) => (i === 0 ? { ...f, class: undefined } : f));
    expect(ok(ArpgDataSchema, { ...arpgData, forms })).toBe(false);
    expect(ok(ArpgDataSchema, { ...arpgData, forms: arpgData.forms.slice(0, 14) })).toBe(false);
    const hybrid = arpgData.forms.map((f, i) => (i === 0 ? { ...f, class: 'hybrid' } : f));
    expect(ok(ArpgDataSchema, { ...arpgData, forms: hybrid })).toBe(false);
  });
});

describe('weapon classes and cast styles (inert)', () => {
  const STYLES: Record<string, [WeaponClass, string, string]> = {
    dagger: ['melee', 'Quick', 'blade'],
    sword: ['melee', 'Balanced', 'crescent'],
    axe: ['melee', 'Sweeping', 'hatchet'],
    maul: ['melee', 'Heavy', 'stone'],
    staff: ['ranged', 'Channeled', 'orb'],
    wand: ['ranged', 'Seeking', 'spark'],
    bow: ['ranged', 'Marksman', 'arrow'],
  };
  /** Each style's one line of text (the spec §2.2), carried on the row for the client. */
  const STYLE_TEXT: Record<string, string> = {
    Quick: 'Casts gain 15% crit chance',
    Balanced: 'Each chain step hits a little harder',
    Sweeping: 'Single-target hits cleave a small arc behind the first foe',
    Heavy: 'Heavy and hold moves stagger',
    Channeled: 'Impacts leave a brief small zone',
    Seeking: 'Shots home slightly',
    Marksman: 'Shots pierce one foe',
  };

  it('every weapon base has its class and a style of every factor 1, no motion, no trait', () => {
    const weapons = registry.getGearBasesForSlot('weapon');
    expect(weapons.map((w) => w.id).sort()).toEqual(Object.keys(STYLES).sort());
    for (const w of weapons) {
      const [cls, name, look] = STYLES[w.id];
      expect(w.class, w.id).toBe(cls);
      expect(w.style, w.id).toEqual({
        name,
        text: STYLE_TEXT[name],
        numbers: { windup: 1, cooldown: 1, power: 1, range: 1, radius: 1, speed: 1, duration: 1 },
        motion: 'none',
        trait: {},
        look,
      });
    }
    for (const b of registry.getDelveData().bases)
      if (b.slot !== 'weapon') expect([b.class, b.style]).toEqual([undefined, undefined]);
  });

  it('the schema requires both on a weapon base and refuses them elsewhere', () => {
    expect(ok(DelveDataSchema, delveData)).toBe(true);
    const bases = delveData.bases;
    const sword = bases.findIndex((b) => b.id === 'sword');
    const helm = bases.findIndex((b) => b.slot !== 'weapon');
    const with_ = (i: number, patch: object) => ({
      ...delveData,
      bases: bases.map((b, j) => (j === i ? { ...b, ...patch } : b)),
    });
    expect(ok(DelveDataSchema, with_(sword, { class: undefined }))).toBe(false);
    expect(ok(DelveDataSchema, with_(sword, { style: undefined }))).toBe(false);
    expect(ok(DelveDataSchema, with_(sword, { class: 'magic' }))).toBe(false);
    expect(ok(DelveDataSchema, with_(helm, { class: 'melee' }))).toBe(false);
    expect(ok(DelveDataSchema, with_(helm, { style: bases[sword].style }))).toBe(false);
    const style = bases[sword].style!;
    expect(ok(DelveDataSchema, with_(sword, { style: { ...style, motion: 'leap' } }))).toBe(false);
    expect(ok(DelveDataSchema, with_(sword, { style: { ...style, look: 'fist' } }))).toBe(false);
    expect(ok(DelveDataSchema, with_(sword, { style: { ...style, trait: { haste: 1 } } }))).toBe(
      false,
    );
    expect(
      ok(DelveDataSchema, with_(sword, { style: { ...style, numbers: { ...style.numbers, power: 0 } } })),
    ).toBe(false);
  });
});

describe('the new knobs: detonate, critBonus, cleave, homing', () => {
  it('are neutral at 0, add on merge, and parse', () => {
    expect(NEUTRAL).toMatchObject({ detonate: 0, critBonus: 0, cleave: 0, homing: 0 });
    const k = mergeKnobs({ detonate: 0.25, critBonus: 0.15 }, { detonate: 0.3, cleave: 1, homing: 2 });
    expect(k).toMatchObject({ detonate: 0.55, critBonus: 0.15, cleave: 1, homing: 2 });
    expect(ok(KnobsSchema, { detonate: 0.25, critBonus: 0.15, cleave: 1, homing: 2 })).toBe(true);
    expect(ok(KnobsSchema, { detonate: -1 })).toBe(false);
    expect(ok(KnobsSchema, { critBonus: 2 })).toBe(false);
  });
});

describe('the runes fit the new forms as their kin', () => {
  it('whirl where strike, repel where ward, onslaught where nova', () => {
    for (const r of registry.getRunes()) {
      const f = r.fits.forms;
      // Detonate (the switch task's row) fits the forms the constructs spec names: Strike, Whirl, Volley, Lance and Onslaught.
      if (r.id === 'detonate') {
        expect(f).toEqual(['strike', 'whirl', 'volley', 'lance', 'onslaught']);
        continue;
      }
      expect(f.includes('whirl'), `${r.id} whirl`).toBe(f.includes('strike'));
      expect(f.includes('repel'), `${r.id} repel`).toBe(f.includes('ward'));
      expect(f.includes('onslaught'), `${r.id} onslaught`).toBe(f.includes('nova'));
    }
  });
});

describe('the placeholder behaviours (B1 replaces)', () => {
  const chainOf = (form: FormId, slot: 'primary' | 'defensive' | 'ultimate') =>
    ({
      [slot]: {
        moves: [{ kind: 'medium', form, elements: ['fire'] }],
        payment: slot === 'ultimate' ? 'charge' : 'mana',
      },
    }) as const;

  it('a Whirl plays as a Strike: a slash', () => {
    const w = arena([dummy(11.5, 10)], { chains: { ...chainOf('whirl', 'primary') } as never });
    const events = press(w, 0);
    expect(events.some((e) => e.kind === 'slash')).toBe(true);
  });

  it('a Repel plays as a Ward, an Onslaught as a Nova', () => {
    const w = arena([dummy(11.5, 10)], {
      chains: { ...chainOf('repel', 'defensive'), ...chainOf('onslaught', 'ultimate') } as never,
    });
    const buffs = press(w, 1).filter((e) => e.kind === 'buff');
    expect(buffs).toEqual([expect.objectContaining({ kind: 'buff', form: 'ward' })]);
    fillCharge(w);
    // The dummy beside the hero: a Nova's blast reaches it.
    Object.assign(w.monsters[0], { x: w.hero.x + 1.5, y: w.hero.y });
    const before = w.monsters[0].hp;
    press(w, 2);
    for (let i = 0; i < 30; i++) stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP);
    expect(w.monsters[0].hp).toBeLessThan(before);
  });
});
