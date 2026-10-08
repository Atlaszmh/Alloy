import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { generateItem } from '../src/loot/item-generator.js';
import { UNARMED, defaultMoveset, moveAllPreview, slotRange } from '../src/loot/moveset.js';
import { OPEN_SKILL_TEXT } from '../src/delve/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { CHAIN_SKILLS } from '../src/types/ability.js';
import { RARITY_ORDER, type Rarity } from '../src/types/gear.js';

// See the constructs spec §3.2: the slot table replaces carries by rarity; a weapon holds the
// skills its rarity starts with, and Open a skill gives a skill at 0 its first slot.

const registry = createDefaultRegistry();
const slots = registry.getDelveBalance().movesets.slots;
const sword = (rarity: Rarity, uid = `w-${rarity}`) =>
  generateItem(
    registry,
    { uid, ilvl: 5, rarity, slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(7).fork(uid),
  );

describe('the slot table', () => {
  it('starts each rarity at its row: a common with the Basic and a Primary, every skill from rare', () => {
    const skills = (r: Rarity) =>
      Object.keys(defaultMoveset(registry, { baseId: 'sword', rarity: r }, 'fire').chains);
    expect(skills('common')).toEqual(['basic', 'primary']);
    expect(skills('uncommon')).toEqual(['basic', 'primary', 'defensive']);
    expect(skills('magic')).toEqual(['basic', 'primary', 'defensive']);
    expect(skills('rare')).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
    expect(skills('epic')).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
    expect(skills('legendary')).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
    for (const r of RARITY_ORDER)
      for (const s of CHAIN_SKILLS) {
        const [start, ceiling] = slotRange(registry, sword(r), s);
        if (s === 'basic') expect([start, ceiling]).toEqual([3, Math.max(3, slots[r].basic[1])]);
        else expect([start, ceiling]).toEqual(slots[r][s]);
      }
  });

  it('unarmed (UNARMED) holds the basic chain alone, every other skill at [0, 0]', () => {
    expect(Object.keys(defaultMoveset(registry, UNARMED, 'fire').chains)).toEqual(['basic']);
    for (const s of ['primary', 'defensive', 'ultimate'] as const)
      expect(slotRange(registry, UNARMED, s)).toEqual([0, 0]);
  });

  it('a skill with no slot says where it opens', () => {
    expect(OPEN_SKILL_TEXT).toBe('Open this skill on the Temper bench');
  });

  it("Move all onto a weapon without a skill's slots sends that chain's constructs to the bag", () => {
    const epic = sword('epic');
    const common = sword('common', 'c2');
    const onto = moveAllPreview(registry, epic, common);
    expect(Object.keys(onto.moveset.chains)).toEqual(['basic', 'primary']);
    const ultimates = onto.toBag.filter(
      (c) => 'form' in c && registry.getForm(c.form).slot === 'ultimate',
    );
    expect(ultimates.length).toBe(epic.moveset!.chains.ultimate!.moves.length);
  });
});
