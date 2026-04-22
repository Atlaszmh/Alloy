import { describe, it, expect } from 'vitest';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { createEmptyLoadout } from '../src/types/item.js';
import { calculateStats } from '../src/forge/stat-calculator.js';
import type { EquippedSlot } from '../src/types/item.js';
import { createGem } from '../src/types/gem.js';

const data = loadAndValidateData();
const registry = new DataRegistry(
  data.affixes,
  data.combinations,
  data.synergies,
  data.baseItems,
  data.balance,
);

describe('synergies with transplanted affixes (tags[])', () => {
  it('fires when synergy affix exists only as a secondary in tags[]', () => {
    // Synergy: poison_damage + attack_speed → "plague_bearer"
    // Strategy: Create a weapon gem with poison_damage as primary,
    // and attack_speed as a transplanted secondary (in tags[]).
    // This simulates the result of attaching a secondary via transplant.
    const loadout = createEmptyLoadout('sword', 'chainmail');

    // Main gem: poison_damage T1 common, but with attack_speed in tags (simulating transplant)
    const hostGem = createGem(
      'gem-poison-with-speed',
      'poison_damage',
      1,
      'common',
      {
        // Tags include both the primary affix and the secondary affix
        tags: ['poison_damage', 'attack_speed'],
      },
    );
    loadout.weapon.slots[0] = { gem: hostGem };

    const { stats, activeSynergies } = calculateStats(loadout, registry);

    // The plague_bearer synergy requires ['poison_damage', 'attack_speed']
    const plagueBearer = activeSynergies.find(
      (s) => s.synergyId === 'plague_bearer',
    );
    expect(plagueBearer).toBeDefined();
    expect(plagueBearer!.isActive).toBe(true);
  });

  it('does not fire when tags[] is missing a required synergy affix', () => {
    // Control: if the gem's tags[] lacks attack_speed, the synergy should NOT fire.
    const loadout = createEmptyLoadout('sword', 'chainmail');

    // Gem with only poison_damage in tags (no attack_speed)
    const hostGem = createGem(
      'gem-poison-only',
      'poison_damage',
      1,
      'common',
      {
        tags: ['poison_damage'], // Missing attack_speed
      },
    );
    loadout.weapon.slots[0] = { gem: hostGem };

    const { activeSynergies } = calculateStats(loadout, registry);

    const plagueBearer = activeSynergies.find(
      (s) => s.synergyId === 'plague_bearer',
    );
    expect(plagueBearer).toBeDefined();
    expect(plagueBearer!.isActive).toBe(false);
  });

  it('collects affixes from multiple gems via tags[]', () => {
    // Multi-gem scenario: weapon has one gem with tags [fire_damage, poison_damage],
    // and another gem with tags [cold_damage, attack_speed].
    // This tests deduplication and aggregation across the loadout.
    const loadout = createEmptyLoadout('sword', 'chainmail');

    const gem1 = createGem('gem-1', 'fire_damage', 1, 'common', {
      tags: ['fire_damage', 'poison_damage'],
    });
    const gem2 = createGem('gem-2', 'cold_damage', 1, 'common', {
      tags: ['cold_damage', 'attack_speed'],
    });

    loadout.weapon.slots[0] = { gem: gem1 };
    loadout.weapon.slots[1] = { gem: gem2 };

    const { activeSynergies } = calculateStats(loadout, registry);

    // plague_bearer requires [poison_damage, attack_speed]
    const plagueBearer = activeSynergies.find(
      (s) => s.synergyId === 'plague_bearer',
    );
    expect(plagueBearer).toBeDefined();
    expect(plagueBearer!.isActive).toBe(true);
  });

  it('deduplicates tags when the same affix appears multiple times', () => {
    // If a gem's tags include the same affix ID twice (should not happen in practice,
    // but defensive testing), synergy check should still work.
    const loadout = createEmptyLoadout('sword', 'chainmail');

    // Simulated edge case: tags with duplicates
    const gem = createGem('gem-dup', 'poison_damage', 1, 'common', {
      tags: ['poison_damage', 'poison_damage', 'attack_speed'],
    });
    loadout.weapon.slots[0] = { gem };

    const { activeSynergies } = calculateStats(loadout, registry);

    const plagueBearer = activeSynergies.find(
      (s) => s.synergyId === 'plague_bearer',
    );
    expect(plagueBearer).toBeDefined();
    expect(plagueBearer!.isActive).toBe(true);
  });

  it('works with armor-slot gems too', () => {
    // Synergy detection should work regardless of whether the gem is on weapon or armor.
    // Use thorns + flat_hp → vengeance synergy.
    const loadout = createEmptyLoadout('sword', 'chainmail');

    // Armor gem: thorns T1 with flat_hp in tags (simulating transplant)
    const armorGem = createGem('gem-armor-thorns', 'thorns', 1, 'common', {
      tags: ['thorns', 'flat_hp'],
    });
    loadout.armor.slots[0] = { gem: armorGem };

    const { activeSynergies } = calculateStats(loadout, registry);

    // vengeance synergy requires ['thorns', 'flat_hp']
    const vengeance = activeSynergies.find((s) => s.synergyId === 'vengeance');
    expect(vengeance).toBeDefined();
    expect(vengeance!.isActive).toBe(true);
  });

  it('activates synergy with tags on weapon and armor combined', () => {
    // Scenario: synergy requires affixes on both weapon and armor.
    // Weapon gem has part of it in tags, armor gem has the rest.
    // Use a multi-affix synergy: "glass_cannon" requires crit_chance, crit_damage, attack_speed.
    const loadout = createEmptyLoadout('sword', 'chainmail');

    // Weapon: crit_chance in tags (+ something else as primary)
    const weaponGem = createGem('gem-weapon-crit', 'fire_damage', 1, 'common', {
      tags: ['fire_damage', 'crit_chance'],
    });

    // Armor: crit_damage and attack_speed in tags
    const armorGem = createGem(
      'gem-armor-crit-speed',
      'flat_hp',
      1,
      'common',
      {
        tags: ['flat_hp', 'crit_damage', 'attack_speed'],
      },
    );

    loadout.weapon.slots[0] = { gem: weaponGem };
    loadout.armor.slots[0] = { gem: armorGem };

    const { stats, activeSynergies } = calculateStats(loadout, registry);

    // glass_cannon requires [crit_chance, crit_damage, attack_speed]
    const glassCannon = activeSynergies.find(
      (s) => s.synergyId === 'glass_cannon',
    );
    expect(glassCannon).toBeDefined();
    expect(glassCannon!.isActive).toBe(true);

    // Verify synergy is active by checking the effect:
    // glass_cannon applies maxHp flat -25.
    // armor gem contributes flat_hp T1 weaponEffect (+45).
    // Total: 200 (base) + 20 (chainmail) + 45 (flat_hp T1) - 25 (synergy) = 240
    // This is actually higher than just the base+chainmail (220), but confirms synergy fired.
    // The negative effect shows the synergy detected properly.
    expect(stats.maxHP).toBe(200 + 20 + 45 - 25);
  });
});
