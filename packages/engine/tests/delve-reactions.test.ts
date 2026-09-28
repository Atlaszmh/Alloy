import { describe, it, expect } from 'vitest';
import arpgJson from '../src/data/arpg.json';
import { ArpgDataSchema } from '../src/data/schemas.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { MANA_TYPES } from '../src/types/mana.js';
import { registry } from './fixtures/arena.js';

describe('the reaction table', () => {
  it('has one reaction per pair of elements, found in either order', () => {
    expect(registry.getArpgData().reactions).toHaveLength(15);
    for (const a of MANA_TYPES)
      for (const b of MANA_TYPES) {
        if (a === b) continue;
        const r = registry.getReactionFor(a, b);
        expect([...r.elements].sort()).toEqual([a, b].sort());
        expect(registry.getReactionFor(b, a)).toBe(r);
      }
    expect(registry.getReactionFor('earth', 'storm').name).toBe('Lightning Rod');
  });

  it('Soulfire and Blight keep their mark; the five buff reactions have a cooldown', () => {
    const reactions = registry.getArpgData().reactions;
    expect(reactions.filter((r) => r.consumes === false).map((r) => r.id)).toEqual([
      'soulfire',
      'blight',
    ]);
    expect(reactions.filter((r) => r.cooldown).map((r) => r.id)).toEqual([
      'obsidian',
      'lightning_rod',
      'seedling',
      'siphon',
      'galvanize',
    ]);
  });

  it('refuses a reaction set that misses or repeats a pair', () => {
    expect(ArpgDataSchema.safeParse(arpgJson).success).toBe(true);
    const repeat = arpgJson.reactions.map((r) =>
      r.id === 'galvanize' ? { ...r, elements: ['fire', 'frost'] } : r,
    );
    expect(ArpgDataSchema.safeParse({ ...arpgJson, reactions: repeat }).success).toBe(false);
    const missing = arpgJson.reactions.filter((r) => r.id !== 'galvanize');
    expect(ArpgDataSchema.safeParse({ ...arpgJson, reactions: missing }).success).toBe(false);
  });
});

describe('saves remember every reaction', () => {
  it('a version 4 save that has seen a new reaction parses', () => {
    const p = {
      ...createDelveProfile(registry, 1),
      reactionsSeen: ['melt', 'sunder', 'lightning_rod'],
    };
    expect(
      parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))?.profile.reactionsSeen,
    ).toEqual(['melt', 'sunder', 'lightning_rod']);
  });

  it('a version 3 save with the seven still migrates', () => {
    const fresh = createDelveProfile(registry, 1, { primary: 'fire' });
    const { pair: _pair, manaDust: _dust, ...rest } = fresh;
    const v3 = { ...rest, version: 3, reactionsSeen: ['melt', 'blight'] };
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(v3)))?.profile).toMatchObject({
      version: 4,
      reactionsSeen: ['melt', 'blight'],
    });
  });
});
