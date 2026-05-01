import { describe, it, expect } from 'vitest';
import { generateOpponentBuild } from '../../src/balance/synthetic-opponent-build.js';
import { loadAndValidateData } from '../../src/data/loader.js';
import { DataRegistry } from '../../src/data/registry.js';

describe('generateOpponentBuild', () => {
  const data = loadAndValidateData();
  const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance, data.recipes);

  it('produces a fully-forged loadout scaled to the round number', () => {
    const build = generateOpponentBuild({
      seed: 42,
      round: 5,
      tier: 4,
      baseWeaponId: 'sword',
      baseArmorId: 'chainmail',
    }, registry);

    expect(build.loadout.weapon.slots.some(s => s !== null)).toBe(true);
    expect(build.loadout.armor.slots.some(s => s !== null)).toBe(true);
    // Round 5 build should have more sockets than round 1
    const r1 = generateOpponentBuild({ seed: 42, round: 1, tier: 4, baseWeaponId: 'sword', baseArmorId: 'chainmail' }, registry);
    const r1Sockets = r1.loadout.weapon.slots.filter(s => s !== null).length + r1.loadout.armor.slots.filter(s => s !== null).length;
    const r5Sockets = build.loadout.weapon.slots.filter(s => s !== null).length + build.loadout.armor.slots.filter(s => s !== null).length;
    expect(r5Sockets).toBeGreaterThanOrEqual(r1Sockets);
  });

  it('is deterministic for the same seed/round', () => {
    const a = generateOpponentBuild({ seed: 7, round: 3, tier: 3, baseWeaponId: 'sword', baseArmorId: 'chainmail' }, registry);
    const b = generateOpponentBuild({ seed: 7, round: 3, tier: 3, baseWeaponId: 'sword', baseArmorId: 'chainmail' }, registry);
    expect(JSON.stringify(a.loadout)).toBe(JSON.stringify(b.loadout));
  });
});
