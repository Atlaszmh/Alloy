import { describe, it, expect, beforeAll } from 'vitest';
import { selectAIItems } from '../src/ai/item-selection.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';

describe('selectAIItems', () => {
  let registry: DataRegistry;
  beforeAll(() => {
    const data = loadAndValidateData();
    registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
  });

  it('easy tier returns valid items', () => {
    const result = selectAIItems(1, [], registry, new SeededRNG(42));
    expect(result.weapon.type).toBe('weapon');
    expect(result.armor.type).toBe('armor');
  });

  it('hard tier picks highest allResistances armor against elemental gems', () => {
    const fireGems = [{ tags: ['fire'] }, { tags: ['fire'] }, { tags: ['fire'] }];
    const result = selectAIItems(5, fireGems, registry, new SeededRNG(42));
    const allArmors = registry.getBaseItemsByType('armor');
    // Effective resistance = per-element + allResistances
    const maxResist = Math.max(
      ...allArmors.map(a => (a.baseStats.fireResistance ?? 0) + (a.baseStats.allResistances ?? 0)),
    );
    const actualResist =
      (result.armor.baseStats.fireResistance ?? 0) + (result.armor.baseStats.allResistances ?? 0);
    expect(actualResist).toBe(maxResist);
  });

  it('hard tier picks highest physical damage weapon', () => {
    const result = selectAIItems(4, [], registry, new SeededRNG(42));
    const allWeapons = registry.getBaseItemsByType('weapon');
    const maxPhys = Math.max(...allWeapons.map(w => w.baseStats.physicalDamage ?? 0));
    expect(result.weapon.baseStats.physicalDamage ?? 0).toBe(maxPhys);
  });

  it('medium tier returns valid items', () => {
    const result = selectAIItems(3, [], registry, new SeededRNG(42));
    expect(result.weapon.type).toBe('weapon');
    expect(result.armor.type).toBe('armor');
  });

  it('deterministic with same seed', () => {
    const r1 = selectAIItems(1, [], registry, new SeededRNG(99));
    const r2 = selectAIItems(1, [], registry, new SeededRNG(99));
    expect(r1.weapon.id).toBe(r2.weapon.id);
    expect(r1.armor.id).toBe(r2.armor.id);
  });
});
