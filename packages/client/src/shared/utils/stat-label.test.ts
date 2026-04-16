import { describe, it, expect } from 'vitest';
import { getStatAbbreviation, getStatLabel } from './stat-label';
import type { AffixDef, GemInstance } from '@alloy/engine';

describe('getStatAbbreviation', () => {
  it.each([
    ['physicalDamage', 'Phys Dmg'],
    ['coldDamage', 'Cold Dmg'],
    ['poisonDamage', 'Psn Dmg'],
    ['chaosDamage', 'Chaos Dmg'],
    ['attackSpeed', 'Atk Spd'],
    ['critChance', 'Crit'],
    ['maxHP', 'HP'],
    ['coldResistance', 'Cold Res'],
    ['firePenetration', 'Fire Pen'],
    ['dodgeChance', 'Dodge'],
    ['hpRegen', 'Regen'],
    ['barrier', 'Barrier'],
    ['armor', 'Armor'],
    ['blockChance', 'Block'],
    ['fireDamage', 'Fire Dmg'],
    ['lightningDamage', 'Ltng Dmg'],
    ['shadowDamage', 'Shadow Dmg'],
    ['thornsDamage', 'Thorns'],
    ['stunChance', 'Stun'],
    ['allElementalDamage', 'All Elem'],
    ['allResistances', 'All Res'],
  ])('abbreviates %s to %s', (stat, expected) => {
    expect(getStatAbbreviation(stat)).toBe(expected);
  });

  it('returns the stat key as-is for unknown stats', () => {
    expect(getStatAbbreviation('unknownStat')).toBe('unknownStat');
  });
});

const mockAffix: AffixDef = {
  id: 'fire_damage',
  name: 'Fire Damage',
  description: 'test',
  weaponFlavorText: '',
  armorFlavorText: '',
  category: 'offensive',
  tags: ['fire'],
  tiers: {
    1: { weaponEffect: [{ stat: 'elementalDamage.fire', op: 'flat', value: 3 }], armorEffect: [{ stat: 'resistances.fire', op: 'flat', value: 8 }], valueRange: [0, 0] },
    2: { weaponEffect: [{ stat: 'elementalDamage.fire', op: 'flat', value: 5 }], armorEffect: [{ stat: 'resistances.fire', op: 'flat', value: 14 }], valueRange: [0, 0] },
    3: { weaponEffect: [{ stat: 'elementalDamage.fire', op: 'flat', value: 7 }], armorEffect: [{ stat: 'resistances.fire', op: 'flat', value: 20 }], valueRange: [0, 0] },
    4: { weaponEffect: [{ stat: 'elementalDamage.fire', op: 'flat', value: 9 }], armorEffect: [{ stat: 'resistances.fire', op: 'flat', value: 26 }], valueRange: [0, 0] },
  },
};

const mockPercentAffix: AffixDef = {
  id: 'crit_chance',
  name: 'Critical Strike Chance',
  description: 'test',
  weaponFlavorText: '',
  armorFlavorText: '',
  category: 'offensive',
  tags: ['crit'],
  tiers: {
    1: { weaponEffect: [{ stat: 'critChance', op: 'percent', value: 0.03 }], armorEffect: [], valueRange: [0, 0] },
    2: { weaponEffect: [{ stat: 'critChance', op: 'percent', value: 0.05 }], armorEffect: [], valueRange: [0, 0] },
    3: { weaponEffect: [{ stat: 'critChance', op: 'percent', value: 0.07 }], armorEffect: [], valueRange: [0, 0] },
    4: { weaponEffect: [{ stat: 'critChance', op: 'percent', value: 0.09 }], armorEffect: [], valueRange: [0, 0] },
  },
};

function makeGem(tier: 1 | 2 | 3 | 4, rarity: 'common' | 'uncommon' | 'magic' | 'rare' | 'epic' | 'legendary'): GemInstance {
  return { uid: 'test', affixId: 'fire_damage', tier, rarity, recipeDepth: 0, combinable: true, tags: [] };
}

describe('getStatLabel', () => {
  it('returns effective value for common rarity (1x, integer)', () => {
    expect(getStatLabel(mockAffix, makeGem(2, 'common'))).toBe('+5');
  });

  it('returns effective value for magic rarity (1.25x, fractional)', () => {
    expect(getStatLabel(mockAffix, makeGem(2, 'magic'))).toBe('+6.3');
  });

  it('returns effective value for rare rarity (1.5x)', () => {
    expect(getStatLabel(mockAffix, makeGem(2, 'rare'))).toBe('+7.5');
  });

  it('returns effective value for epic rarity (2x, integer)', () => {
    expect(getStatLabel(mockAffix, makeGem(2, 'epic'))).toBe('+10');
  });

  it('returns effective value for legendary rarity (3x, integer)', () => {
    expect(getStatLabel(mockAffix, makeGem(2, 'legendary'))).toBe('+15');
  });

  it('formats percent stats with rarity applied', () => {
    expect(getStatLabel(mockPercentAffix, makeGem(2, 'rare'), 'weapon')).toBe('8%');
  });

  it('returns armor stat when target is armor', () => {
    expect(getStatLabel(mockAffix, makeGem(2, 'common'), 'armor')).toBe('+14');
  });

  it('returns empty string when no effects exist', () => {
    expect(getStatLabel(mockPercentAffix, makeGem(2, 'common'), 'armor')).toBe('');
  });
});
