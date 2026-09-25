import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { createDelveProfile, parseDelveProfile, setAbility } from '../src/delve/profile.js';

const registry = createDefaultRegistry();

describe('profile abilities (save v3)', () => {
  it('a new profile starts with default builds on its weapon element', () => {
    const p = createDelveProfile(registry, 1);
    expect(p.version).toBe(3);
    expect(p.abilities.primary).toEqual({
      form: 'bolt',
      elements: ['fire'],
      weight: 0,
      payment: 'mana',
    });
    expect(p.abilities.defensive.form).toBe('ward');
    expect(p.abilities.ultimate).toEqual({
      form: 'nova',
      elements: ['fire'],
      weight: 0,
      payment: 'charge',
    });
  });

  it('setAbility accepts valid builds', () => {
    const p = setAbility(registry, createDelveProfile(registry, 1), 'primary', {
      form: 'burst',
      elements: ['fire', 'nature'],
      weight: 2,
      payment: 'cast',
    });
    expect(p.abilities.primary.form).toBe('burst');
    expect(parseDelveProfile(JSON.parse(JSON.stringify(p)))?.abilities.primary.elements).toEqual([
      'fire',
      'nature',
    ]);
  });

  it('setAbility rejects a form from another slot, 3 elements, repeats and bad numbers', () => {
    const p = createDelveProfile(registry, 1);
    const ok = { form: 'bolt', elements: ['fire'], weight: 0, payment: 'mana' } as const;
    expect(() => setAbility(registry, p, 'primary', { ...ok, form: 'nova' })).toThrow();
    expect(() =>
      setAbility(registry, p, 'primary', { ...ok, elements: ['fire', 'frost', 'storm'] }),
    ).toThrow();
    expect(() =>
      setAbility(registry, p, 'primary', { ...ok, elements: ['fire', 'fire'] }),
    ).toThrow();
    expect(() => setAbility(registry, p, 'primary', { ...ok, elements: [] })).toThrow();
    expect(() => setAbility(registry, p, 'primary', { ...ok, weight: 3 as never })).toThrow();
    expect(() => setAbility(registry, p, 'primary', { ...ok, payment: 'gold' as never })).toThrow();
  });

  it('migrates a version 2 save, keeping gear and scrap', () => {
    const v3 = createDelveProfile(registry, 7);
    const { abilities: _abilities, ...rest } = v3;
    const frost = { ...v3.equipped.weapon!, mana: 'frost' as const };
    const v2 = {
      ...rest,
      version: 2,
      scrap: 321,
      equipped: { ...v3.equipped, weapon: frost },
      skillSlots: ['fireball', null, null],
      reactionsSeen: ['melt'],
    };
    const p = parseDelveProfile(JSON.parse(JSON.stringify(v2)));
    expect(p).not.toBeNull();
    expect(p!.version).toBe(3);
    expect(p!.scrap).toBe(321);
    expect(p!.equipped.weapon!.uid).toBe(v3.equipped.weapon!.uid);
    expect(p!.abilities.primary.elements).toEqual(['frost']);
    expect('skillSlots' in p!).toBe(false);
  });

  it('remembers the new reactions', () => {
    const p = { ...createDelveProfile(registry, 1), reactionsSeen: ['combust', 'blight'] };
    expect(parseDelveProfile(JSON.parse(JSON.stringify(p)))?.reactionsSeen).toEqual([
      'combust',
      'blight',
    ]);
  });
});
