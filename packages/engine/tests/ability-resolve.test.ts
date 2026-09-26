import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { mergeKnobs, resolveAbility } from '../src/arpg/abilities/resolve.js';
import type { AbilityBuild } from '../src/types/ability.js';
import type { HeroStats } from '../src/types/delve.js';

const registry = createDefaultRegistry();
const ab = registry.getDelveBalance().abilities;
const bare = computeHeroStats({}, registry);

function build(over: Partial<AbilityBuild> = {}): AbilityBuild {
  return { form: 'bolt', elements: ['fire'], weight: 0, payment: 'mana', ...over };
}

function withStats(over: Partial<HeroStats>): HeroStats {
  return { ...bare, ...over };
}

describe('resolveAbility', () => {
  it('resolves a Balanced mana Fire Bolt from the slot numbers and the form', () => {
    const bolt = registry.getForm('bolt');
    const r = resolveAbility(registry, 'primary', build(), bare);
    expect(r.name).toBe('Fire Bolt');
    expect(r.cost).toBeCloseTo(ab.slots.primary.cost);
    expect(r.cooldown).toBeCloseTo(ab.slots.primary.cooldown);
    expect(r.channel).toBe(0);
    expect(r.chargeNeed).toBe(0);
    expect(r.power).toBeCloseTo(bolt.power);
    expect(r.knobs.area).toBeCloseTo(1.3);
    expect(r.radius).toBeCloseTo(bolt.radius! * 1.3);
    expect(r.knobs.applies).toEqual(['burn']);
    expect(r.combo).toEqual(bolt.combo);
  });

  it('weight trades power and size for cost, cooldown and speed', () => {
    const base = resolveAbility(registry, 'primary', build(), bare);
    const heavy = resolveAbility(registry, 'primary', build({ weight: 2 }), bare);
    expect(heavy.power / base.power).toBeCloseTo(1 + 2 * ab.weight.power);
    expect(heavy.cost / base.cost).toBeCloseTo(1 + 2 * ab.weight.cost);
    expect(heavy.cooldown / base.cooldown).toBeCloseTo(1 + 2 * ab.weight.cooldown);
    expect(heavy.speed / base.speed).toBeCloseTo(1 - 2 * ab.weight.speed);
    expect(heavy.radius / base.radius).toBeCloseTo(1 + 2 * ab.weight.size);
    const swift = resolveAbility(registry, 'primary', build({ weight: -2 }), bare);
    expect(swift.power).toBeLessThan(base.power);
    expect(swift.cost).toBeLessThan(base.cost);
  });

  it('cast payment halves the cost, adds power and a wind-up', () => {
    const base = resolveAbility(
      registry,
      'ultimate',
      build({ form: 'nova', payment: 'mana' }),
      bare,
    );
    const cast = resolveAbility(
      registry,
      'ultimate',
      build({ form: 'nova', payment: 'cast', weight: 1 }),
      bare,
    );
    const heavyMana = resolveAbility(
      registry,
      'ultimate',
      build({ form: 'nova', payment: 'mana', weight: 1 }),
      bare,
    );
    expect(cast.cost).toBeCloseTo(heavyMana.cost * ab.castManaMult);
    expect(cast.power).toBeCloseTo(heavyMana.power * ab.castPowerMult);
    expect(cast.channel).toBeCloseTo(ab.slots.ultimate.castTime * (1 + ab.weight.castTime));
    expect(base.channel).toBe(0);
  });

  it('charge payment costs no mana and needs a charge meter instead of a cooldown', () => {
    const r = resolveAbility(
      registry,
      'ultimate',
      build({ form: 'nova', payment: 'charge' }),
      bare,
    );
    expect(r.cost).toBe(0);
    expect(r.chargeNeed).toBeCloseTo(ab.slots.ultimate.cost * ab.chargeRatio);
    expect(r.cooldown).toBeCloseTo(ab.chargeLockout);
  });

  it('Fire + Nature is Wildfire: bigger, harsher, scattered, leaves burning ground', () => {
    const r = resolveAbility(
      registry,
      'primary',
      build({ form: 'burst', elements: ['fire', 'nature'] }),
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
    const r = resolveAbility(registry, 'primary', build({ elements: ['nature', 'fire'] }), bare);
    expect(r.element).toBe('nature');
    expect(r.name).toBe('Wildfire Bolt');
    expect(r.knobs.applies).toEqual(['poison', 'burn']);
  });

  it('attunement in the ability elements powers it, averaged', () => {
    const per = registry.getDelveBalance().mana.powerPerAttune;
    const stats = withStats({ attunement: { ...bare.attunement, fire: 4 } });
    const fire = resolveAbility(registry, 'primary', build(), stats);
    const fusion = resolveAbility(
      registry,
      'primary',
      build({ elements: ['fire', 'storm'] }),
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
      build(),
      withStats({ legendaries: { manaweaver: 30 }, cooldownMult: 0.8 }),
    );
    expect(r.cost).toBeCloseTo(ab.slots.primary.cost * 0.7);
    expect(r.cooldown).toBeCloseTo(ab.slots.primary.cooldown * 0.8);
  });

  it('Stormcaller adds chains to Storm abilities; Bedrock grows and staggers Earth ones', () => {
    const storm = resolveAbility(
      registry,
      'primary',
      build({ elements: ['storm'] }),
      withStats({ legendaries: { stormcaller: 3 } }),
    );
    expect(storm.knobs.chain).toBe(4);
    const earth = resolveAbility(
      registry,
      'primary',
      build({ form: 'burst', elements: ['frost', 'earth'] }),
      withStats({ legendaries: { bedrock: 30 } }),
    );
    const plain = resolveAbility(
      registry,
      'primary',
      build({ form: 'burst', elements: ['frost', 'earth'] }),
      bare,
    );
    expect(earth.radius / plain.radius).toBeCloseTo(1.4);
  });

  it('defensive forms scale their effect with weight', () => {
    const ward = resolveAbility(
      registry,
      'defensive',
      build({ form: 'ward', elements: ['frost'] }),
      bare,
    );
    const heavy = resolveAbility(
      registry,
      'defensive',
      build({ form: 'ward', elements: ['frost'], weight: 2 }),
      bare,
    );
    expect(ward.effect).toBeCloseTo(registry.getForm('ward').effect!);
    expect(heavy.effect / ward.effect).toBeCloseTo(1 + 2 * ab.weight.power);
  });

  it('rejects a form from another slot', () => {
    expect(() => resolveAbility(registry, 'primary', build({ form: 'nova' }), bare)).toThrow();
  });
});

describe('mergeKnobs', () => {
  it('multiplies, adds, ORs, unions and keeps the longer zone', () => {
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
    expect(k.pierce).toBe(true);
    expect(k.pull).toBe(false);
    expect(k.applies).toEqual(['burn', 'poison']);
    expect(k.zone).toEqual({ seconds: 3, tickPower: 0.1 });
  });

  it('defaults to neutral knobs', () => {
    expect(mergeKnobs()).toEqual({
      power: 1,
      area: 1,
      applies: [],
      chain: 0,
      pierce: false,
      knockback: 0,
      lifesteal: 0,
      zone: null,
      pull: false,
      execute: 0,
      scatter: 0,
      spread: false,
    });
  });
});
