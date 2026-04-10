import { describe, it, expect } from 'vitest';
import { validateLoadout } from '../src/forge/loadout-validator.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import type { GemInstance } from '../src/types/gem.js';
import { createGem } from '../src/types/gem.js';
import type { Loadout } from '../src/types/item.js';
import { createEmptyLoadout } from '../src/types/item.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);

function makeStockpile(): GemInstance[] {
  return [
    createGem('gem1', 'fire_damage', 1, 'common'),
    createGem('gem2', 'cold_damage', 1, 'common'),
    createGem('gem3', 'crit_chance', 2, 'common'),
    createGem('gem4', 'attack_speed', 1, 'common'),
  ];
}

function makeValidLoadout(): Loadout {
  const loadout = createEmptyLoadout('sword', 'chainmail');
  loadout.weapon.slots[0] = { gem: createGem('gem1', 'fire_damage', 1, 'common') };
  loadout.armor.slots[0] = { gem: createGem('gem2', 'cold_damage', 1, 'common') };
  return loadout;
}

describe('validateLoadout', () => {
  it('accepts a valid loadout', () => {
    const result = validateLoadout(makeValidLoadout(), makeStockpile(), registry);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects unknown affixId', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = { gem: createGem('gem1', 'totally_fake_affix', 1, 'common') };
    const result = validateLoadout(loadout, makeStockpile(), registry);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('Unknown affix'));
  });

  it('rejects duplicate UIDs', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = { gem: createGem('gem1', 'fire_damage', 1, 'common') };
    loadout.armor.slots[0] = { gem: createGem('gem1', 'fire_damage', 1, 'common') };
    const result = validateLoadout(loadout, makeStockpile(), registry);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('Duplicate gem UID'));
  });

  it('rejects gem not in stockpile', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = { gem: createGem('gem_unknown', 'fire_damage', 1, 'common') };
    const result = validateLoadout(loadout, makeStockpile(), registry);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('Gem not in stockpile'));
  });

  it('rejects empty loadout', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const result = validateLoadout(loadout, makeStockpile(), registry);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('empty'));
  });
});
