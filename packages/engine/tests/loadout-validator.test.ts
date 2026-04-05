import { describe, it, expect } from 'vitest';
import { validateLoadout } from '../src/forge/loadout-validator.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import type { OrbInstance } from '../src/types/orb.js';
import type { Loadout } from '../src/types/item.js';
import { createEmptyLoadout } from '../src/types/item.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);

function makeStockpile(): OrbInstance[] {
  return [
    { uid: 'orb1', affixId: 'fire_damage', tier: 1 },
    { uid: 'orb2', affixId: 'cold_damage', tier: 1 },
    { uid: 'orb3', affixId: 'crit_chance', tier: 2 },
    { uid: 'orb4', affixId: 'attack_speed', tier: 1 },
  ];
}

function makeValidLoadout(): Loadout {
  const loadout = createEmptyLoadout('sword', 'chainmail');
  loadout.weapon.slots[0] = { kind: 'single', orb: { uid: 'orb1', affixId: 'fire_damage', tier: 1 }, socketedRound: 1 };
  loadout.armor.slots[0] = { kind: 'single', orb: { uid: 'orb2', affixId: 'cold_damage', tier: 1 }, socketedRound: 1 };
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
    loadout.weapon.slots[0] = {
      kind: 'single',
      orb: { uid: 'orb1', affixId: 'totally_fake_affix', tier: 1 },
      socketedRound: 1,
    };
    const result = validateLoadout(loadout, makeStockpile(), registry);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('Unknown affix'));
  });

  it('rejects duplicate UIDs', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = { kind: 'single', orb: { uid: 'orb1', affixId: 'fire_damage', tier: 1 }, socketedRound: 1 };
    loadout.armor.slots[0] = { kind: 'single', orb: { uid: 'orb1', affixId: 'fire_damage', tier: 1 }, socketedRound: 1 };
    const result = validateLoadout(loadout, makeStockpile(), registry);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('Duplicate orb UID'));
  });

  it('rejects orb not in stockpile', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = {
      kind: 'single',
      orb: { uid: 'orb_unknown', affixId: 'fire_damage', tier: 1 },
      socketedRound: 1,
    };
    const result = validateLoadout(loadout, makeStockpile(), registry);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('Orb not in stockpile'));
  });

  it('rejects empty loadout', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const result = validateLoadout(loadout, makeStockpile(), registry);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('empty'));
  });
});
