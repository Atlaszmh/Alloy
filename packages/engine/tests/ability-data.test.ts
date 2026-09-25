import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { MANA_TYPES } from '../src/types/mana.js';

const registry = createDefaultRegistry();
const data = registry.getArpgData();

describe('ability data', () => {
  it('has 5 Primary, 4 Defensive and 3 Ultimate forms', () => {
    const count = (slot: string) => data.forms.filter((f) => f.slot === slot).length;
    expect([count('primary'), count('defensive'), count('ultimate')]).toEqual([5, 4, 3]);
  });

  it('has one fusion for every pair of the six elements, in either order', () => {
    expect(MANA_TYPES).toHaveLength(6);
    const ids = new Set<string>();
    for (const a of MANA_TYPES) {
      for (const b of MANA_TYPES) {
        if (a === b) continue;
        const f = registry.getFusion(a, b);
        expect(f, `${a}+${b}`).toBeDefined();
        expect(registry.getFusion(b, a)).toBe(f);
        ids.add(f!.id);
      }
    }
    expect(ids.size).toBe(15);
    expect(registry.getFusion('fire', 'nature')!.name).toBe('Wildfire');
  });

  it('gives every element a trait, a mana entry and a mastery', () => {
    for (const m of MANA_TYPES) {
      expect(data.elementTraits[m].knobs.applies?.length).toBeGreaterThan(0);
      expect(data.mana[m].name).toBeTruthy();
      expect(data.masteries.some((x) => x.mana === m)).toBe(true);
    }
    expect(data.weakness.nature).toBe('fire');
  });

  it('adds Nature gear affixes and the bow', () => {
    const stats = registry.getDelveData().affixes.map((a) => a.stat);
    expect(stats).toContain('naturePower');
    expect(stats).toContain('natureAttune');
    expect(registry.getGearBase('bow').attack).toMatchObject({ kind: 'bolt', pierce: true });
  });

  it('looks up forms by id', () => {
    expect(registry.getForm('maelstrom').slot).toBe('ultimate');
    expect(() => registry.getForm('nope' as never)).toThrow();
  });
});
