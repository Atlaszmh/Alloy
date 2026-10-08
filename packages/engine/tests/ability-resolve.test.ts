import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { mergeKnobs, resolveAbility } from '../src/arpg/abilities/resolve.js';
import type { Move } from '../src/types/ability.js';
import type { HeroStats } from '../src/types/delve.js';

const registry = createDefaultRegistry();
const ab = registry.getDelveBalance().abilities;
const bare = computeHeroStats({}, registry);

/** A medium Fire Bolt, with these parts changed. */
function move(over: Partial<Move> = {}): Move {
  return { kind: 'medium', form: 'bolt', elements: ['fire'], ...over };
}

function withStats(over: Partial<HeroStats>): HeroStats {
  return { ...bare, ...over };
}

describe('resolveAbility', () => {
  it('resolves a medium mana Fire Bolt from the slot numbers and the form', () => {
    const bolt = registry.getForm('bolt');
    const r = resolveAbility(registry, 'primary', move(), 'mana', bare);
    expect(r.name).toBe('Fire Bolt');
    expect(r.cost).toBeCloseTo(ab.slots.primary.cost);
    expect(r.cooldown).toBeCloseTo(ab.slots.primary.cooldown);
    expect(r.channel).toBe(0);
    expect(r.chargeNeed).toBe(0);
    expect(r.power).toBeCloseTo(bolt.power);
    expect(r.knobs.area).toBeCloseTo(1.3);
    expect(r.radius).toBeCloseTo(bolt.radius! * 1.3);
    expect(r.knobs.applies).toEqual(['burn']);
    expect(r).toMatchObject({ kind: 'medium', weight: 0, stage: 0, payment: 'mana', index: 0 });
    expect(r.last).toBe(false);
  });

  it("a kind's weight trades power and size for cost, cooldown and speed", () => {
    const base = resolveAbility(registry, 'primary', move(), 'mana', bare);
    const heavy = resolveAbility(registry, 'primary', move({ kind: 'heavy' }), 'mana', bare);
    expect(heavy.weight).toBe(1);
    expect(heavy.power / base.power).toBeCloseTo(1 + ab.weight.power);
    expect(heavy.cost / base.cost).toBeCloseTo(1 + ab.weight.cost);
    expect(heavy.cooldown / base.cooldown).toBeCloseTo(1 + ab.weight.cooldown);
    expect(heavy.speed / base.speed).toBeCloseTo(1 - ab.weight.speed);
    expect(heavy.radius / base.radius).toBeCloseTo(1 + ab.weight.size);
    const light = resolveAbility(registry, 'primary', move({ kind: 'light' }), 'mana', bare);
    expect(light.weight).toBe(-1);
    expect(light.power).toBeLessThan(base.power);
    expect(light.cost).toBeLessThan(base.cost);
  });

  it('cast payment halves the cost, adds power and a wind-up', () => {
    const nova = (kind: Move['kind'], payment: 'mana' | 'cast') =>
      resolveAbility(registry, 'ultimate', move({ form: 'nova', kind }), payment, bare);
    const base = nova('medium', 'mana');
    const cast = nova('heavy', 'cast');
    const heavyMana = nova('heavy', 'mana');
    expect(cast.cost).toBeCloseTo(heavyMana.cost * ab.castManaMult);
    expect(cast.power).toBeCloseTo(heavyMana.power * ab.castPowerMult);
    expect(cast.channel).toBeCloseTo(ab.slots.ultimate.castTime * (1 + ab.weight.castTime));
    expect(base.channel).toBe(0);
  });

  it('charge payment costs no mana and needs a charge meter instead of a cooldown', () => {
    const r = resolveAbility(registry, 'ultimate', move({ form: 'nova' }), 'charge', bare);
    expect(r.cost).toBe(0);
    expect(r.chargeNeed).toBeCloseTo(ab.slots.ultimate.cost * ab.chargeRatio);
    expect(r.cooldown).toBeCloseTo(ab.chargeLockout);
  });

  it('Fire + Nature is Wildfire: bigger, harsher, scattered, leaves burning ground', () => {
    const r = resolveAbility(
      registry,
      'primary',
      move({ form: 'burst', elements: ['fire', 'nature'] }),
      'mana',
      bare,
    );
    const burst = registry.getForm('burst');
    expect(r.name).toBe('Wildfire Burst');
    expect(r.fusion?.id).toBe('wildfire');
    expect(r.element).toBe('fire');
    expect(r.knobs.area).toBeCloseTo(1.3 * 1.4);
    expect(r.power).toBeCloseTo(burst.power * 1.15);
    expect(r.knobs.applies).toEqual(['burn', 'poison']);
    expect(r.knobs.scatter).toBeGreaterThan(0);
    expect(r.knobs.zone).not.toBeNull();
  });

  it('the first element is the damage element', () => {
    const r = resolveAbility(
      registry,
      'primary',
      move({ elements: ['nature', 'fire'] }),
      'mana',
      bare,
    );
    expect(r.element).toBe('nature');
    expect(r.name).toBe('Wildfire Bolt');
    expect(r.knobs.applies).toEqual(['poison', 'burn']);
  });

  it('attunement in the ability elements powers it, averaged', () => {
    const per = registry.getDelveBalance().mana.powerPerAttune;
    const stats = withStats({ attunement: { ...bare.attunement, fire: 4 } });
    const fire = resolveAbility(registry, 'primary', move(), 'mana', stats);
    const fusion = resolveAbility(
      registry,
      'primary',
      move({ elements: ['fire', 'storm'] }),
      'mana',
      stats,
    );
    const bolt = registry.getForm('bolt').power;
    expect(fire.power).toBeCloseTo(bolt * (1 + per * 4));
    expect(fusion.power).toBeCloseTo(bolt * (1 + per * 2));
  });

  it('Manaweaver cuts mana costs, and cooldown reduction cuts cooldowns', () => {
    const r = resolveAbility(
      registry,
      'primary',
      move(),
      'mana',
      withStats({ legendaries: { manaweaver: 30 }, cooldownMult: 0.8 }),
    );
    expect(r.cost).toBeCloseTo(ab.slots.primary.cost * 0.7);
    expect(r.cooldown).toBeCloseTo(ab.slots.primary.cooldown * 0.8);
  });

  it('Stormcaller adds chains to Storm abilities; Bedrock grows and staggers Earth ones', () => {
    const storm = resolveAbility(
      registry,
      'primary',
      move({ elements: ['storm'] }),
      'mana',
      withStats({ legendaries: { stormcaller: 3 } }),
    );
    expect(storm.knobs.chain).toBe(4);
    const earth = resolveAbility(
      registry,
      'primary',
      move({ form: 'burst', elements: ['frost', 'earth'] }),
      'mana',
      withStats({ legendaries: { bedrock: 30 } }),
    );
    const plain = resolveAbility(
      registry,
      'primary',
      move({ form: 'burst', elements: ['frost', 'earth'] }),
      'mana',
      bare,
    );
    expect(earth.radius / plain.radius).toBeCloseTo(1.4);
  });

  it("defensive forms scale their effect with the kind's weight", () => {
    const ward = (kind: Move['kind']) =>
      resolveAbility(
        registry,
        'defensive',
        move({ form: 'ward', elements: ['frost'], kind }),
        'mana',
        bare,
      );
    expect(ward('medium').effect).toBeCloseTo(registry.getForm('ward').effect!);
    expect(ward('heavy').effect / ward('medium').effect).toBeCloseTo(1 + ab.weight.power);
  });

  it('rejects a form from another slot', () => {
    expect(() =>
      resolveAbility(registry, 'primary', move({ form: 'nova' }), 'mana', bare),
    ).toThrow();
  });
});

describe('mergeKnobs', () => {
  it('multiplies, adds, ORs, unions and merges zones field by field', () => {
    const k = mergeKnobs(
      {
        power: 1.2,
        area: 1.5,
        chain: 1,
        lifesteal: 0.05,
        applies: ['burn'],
        zone: { seconds: 2, tickPower: 0.3 },
      },
      {
        power: 0.5,
        area: 2,
        chain: 2,
        lifesteal: 0.05,
        pierce: true,
        applies: ['burn', 'poison'],
        zone: { seconds: 3, tickPower: 0.1 },
      },
    );
    expect(k.power).toBeCloseTo(0.6);
    expect(k.area).toBeCloseTo(3);
    expect(k.chain).toBe(3);
    expect(k.lifesteal).toBeCloseTo(0.1);
    expect(k.pierce).toBe(Infinity);
    expect(k.pull).toBe(false);
    expect(k.applies).toEqual(['burn', 'poison']);
    expect(k.zone).toEqual({ seconds: 3, tickPower: 0.3 });
  });

  it('defaults to neutral knobs', () => {
    expect(mergeKnobs()).toEqual({
      power: 1,
      area: 1,
      applies: [],
      chain: 0,
      pierce: 0,
      knockback: 0,
      lifesteal: 0,
      zone: null,
      pull: false,
      execute: 0,
      scatter: 0,
      spread: false,
      split: null,
      extraShots: null,
      echo: 0,
      quick: { beat: 1, cooldown: 1, windup: 1 },
      stacksBonus: 0,
      catalyst: 0,
      manaOnHit: 0,
      guardOnLand: 0,
      stackTime: 0,
      detonate: 0,
      critBonus: 0,
      cleave: 0,
      homing: 0,
    });
  });
});
