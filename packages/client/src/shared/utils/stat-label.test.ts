import { describe, it, expect } from 'vitest';
import { getStatAbbreviation } from './stat-label';

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
