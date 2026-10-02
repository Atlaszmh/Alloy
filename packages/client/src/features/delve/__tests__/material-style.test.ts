import { describe, it, expect } from 'vitest';
import { addMaterial, emptyHaul, emptyMaterials, type MaterialRef } from '@alloy/engine';
import {
  AFFIX_FAMILY_COLOR,
  DUST_COLOR,
  METAL_COLOR,
  haulRows,
  materialColor,
  materialCount,
  materialLabel,
  runeCount,
} from '../materials/material-style';
import { RARITY_COLOR } from '../format';
import { getDelveRegistry } from '../registry';

const registry = getDelveRegistry();
const iron: MaterialRef = { kind: 'metal', metal: 'iron' };
const crit: MaterialRef = { kind: 'shard', stat: 'critChance', tier: 2 };
const fang: MaterialRef = { kind: 'essence', essence: 'twin_fang' };

describe('the materials as the client shows them', () => {
  it('names each kind from the data', () => {
    expect(materialLabel(registry, iron)).toBe('Iron bar');
    expect(materialLabel(registry, { kind: 'flux', grade: 'magic' })).toBe('Magic flux');
    expect(materialLabel(registry, crit)).toBe('Crit Chance II');
    // Two affixes share "Damage": the percent one's shard says so.
    expect(materialLabel(registry, { kind: 'shard', stat: 'damagePct', tier: 1 })).toBe(
      'Damage % I',
    );
    expect(materialLabel(registry, fang)).toBe('Twin Fang essence');
    expect(materialLabel(registry, { kind: 'dust' })).toBe('Mana Dust');
  });

  it('colours a bar by its metal, a flux by its grade, a shard by its family, an essence legendary', () => {
    expect(materialColor(registry, iron)).toBe(METAL_COLOR.iron);
    expect(materialColor(registry, { kind: 'flux', grade: 'rare' })).toBe(RARITY_COLOR.rare);
    expect(materialColor(registry, crit)).toBe(AFFIX_FAMILY_COLOR.offense);
    expect(materialColor(registry, fang)).toBe(RARITY_COLOR.legendary);
    expect(materialColor(registry, { kind: 'dust' })).toBe(DUST_COLOR);
  });

  it("lists a haul's entries above zero in order: materials, essences, runes, then the currencies", () => {
    let haul = addMaterial(emptyHaul(), { kind: 'dust' }, 4);
    haul = addMaterial(haul, fang);
    haul = addMaterial(haul, crit, 2);
    haul = addMaterial(haul, { kind: 'flux', grade: 'magic' });
    haul = addMaterial(haul, iron, 3);
    haul = { ...haul, scrap: 30, runes: { split: [0, 0, 1, 0, 0] } };
    expect(haulRows(registry, haul).map((r) => [r.group, r.name, r.count])).toEqual([
      ['material', 'Iron bar', 3],
      ['material', 'Magic flux', 1],
      ['material', 'Crit Chance II', 2],
      ['essence', 'Twin Fang essence', 1],
      ['rune', 'Split III', 1],
      ['currency', 'Scrap', 30],
      ['currency', 'Mana Dust', 4],
    ]);
    expect(haulRows(registry, emptyHaul())).toEqual([]);
    expect(materialCount(haul)).toBe(7);
    expect(runeCount({ split: [0, 0, 1, 0, 0], quick: [2, 1, 0, 0, 0] })).toBe(4);
    // A pouch lists the same way.
    expect(haulRows(registry, { ...emptyMaterials(), essences: { twin_fang: 2 } })).toHaveLength(1);
  });
});
