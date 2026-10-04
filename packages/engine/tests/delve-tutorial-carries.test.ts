import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { generateItem } from '../src/loot/item-generator.js';
import {
  UNARMED,
  carriedByText,
  carriedSkills,
  defaultMoveset,
  movesetTransfer,
} from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { RARITY_ORDER, type Rarity } from '../src/types/gear.js';

// See the tutorial spec's carries: common the basic chain alone; uncommon and magic add the
// Primary; rare the Defensive, and the Ultimate once awakened; epic and legendary all four;
// unarmed the basic chain alone.

const registry = createDefaultRegistry();
const carries = registry.getDelveBalance().movesets.carries;
const sword = (rarity: Rarity, uid = `w-${rarity}`) =>
  generateItem(
    registry,
    { uid, ilvl: 5, rarity, slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(7).fork(uid),
  );

describe('carriedSkills(item)', () => {
  it('reads the carries table by rarity: the basic chain alone on a common, all four from epic', () => {
    expect(carries).toEqual({
      common: ['basic'],
      uncommon: ['basic', 'primary'],
      magic: ['basic', 'primary'],
      rare: ['basic', 'primary', 'defensive'],
      epic: ['basic', 'primary', 'defensive', 'ultimate'],
      legendary: ['basic', 'primary', 'defensive', 'ultimate'],
    });
    for (const r of RARITY_ORDER) {
      expect(carriedSkills(registry, sword(r))).toEqual(carries[r]);
      expect(carriedSkills(registry, { rarity: r })).toEqual(carries[r]);
    }
  });

  it('an awakened rare carries the Ultimate too; awakening adds nothing to a weapon that has it', () => {
    expect(carriedSkills(registry, { ...sword('rare'), awakened: true })).toEqual([
      'basic',
      'primary',
      'defensive',
      'ultimate',
    ]);
    expect(carriedSkills(registry, { rarity: 'epic', awakened: true })).toEqual(carries.epic);
  });

  it('unarmed (null, or UNARMED) carries the basic chain alone', () => {
    expect(carriedSkills(registry, null)).toEqual(['basic']);
    expect(carriedSkills(registry, UNARMED)).toEqual(['basic']);
    expect(Object.keys(defaultMoveset(registry, UNARMED, 'fire').chains)).toEqual(['basic']);
  });

  it('names where each skill comes from: the Ultimate from an epic, or an awakened rare', () => {
    expect(carriedByText(registry, 'primary')).toBe('Carried by uncommon weapons and better');
    expect(carriedByText(registry, 'defensive')).toBe('Carried by rare weapons and better');
    expect(carriedByText(registry, 'ultimate')).toBe(
      'Carried by epic weapons and better, or an awakened rare',
    );
  });

  it("threads through a moveset's owner and a transfer's target: an awakened rare keeps an Ultimate", () => {
    expect(Object.keys(defaultMoveset(registry, sword('magic'), 'fire').chains)).toEqual(
      carries.magic,
    );
    const awakened = { ...sword('rare', 'r2'), awakened: true };
    expect(Object.keys(defaultMoveset(registry, awakened, 'fire').chains)).toEqual(carries.epic);
    const onto = movesetTransfer(registry, sword('epic'), awakened);
    expect(Object.keys(onto.moveset.chains)).toEqual(carries.epic);
    const plain = movesetTransfer(registry, sword('epic'), sword('rare', 'r3'));
    expect(Object.keys(plain.moveset.chains)).toEqual(carries.rare);
  });
});
