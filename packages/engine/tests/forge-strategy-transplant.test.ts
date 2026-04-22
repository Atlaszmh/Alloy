import { describe, it, expect } from 'vitest';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { createGem } from '../src/types/gem.js';
import type { SecondarySlot } from '../src/types/gem.js';
import { createEmptyLoadout } from '../src/types/item.js';
import {
  Tier4ForgeStrategy,
  Tier5ForgeStrategy,
} from '../src/ai/strategies/forge-strategy.js';

const data = loadAndValidateData();
const registry = new DataRegistry(
  data.affixes,
  data.combinations,
  data.synergies,
  data.baseItems,
  data.balance,
  data.recipes,
);

// unlockThreshold = 6
// hasSecondarySlot(gem, 6) = gem.tier + rarityIndex(gem.rarity) >= 6
// T5 + rare(3) = 8 >= 6 → has slot
// T3 + magic(2) = 5 < 6 → no slot
// T5 + common(0) = 5 < 6 → no slot

describe('AI forge strategy — transplant', () => {
  it('considers transplant when owning a host with open empty slot + a source', () => {
    // Host: T5 rare — hasSecondarySlot(host, 6) = 5+3 = 8 >= 6, secondary=undefined (open)
    // Donor: T3 magic — no secondary slot of its own; serves as source
    const host = createGem('host1', 'flat_physical', 5, 'rare');
    const donor = createGem('donor1', 'flat_hp', 3, 'magic');
    const stockpile = [host, donor];
    const loadout = createEmptyLoadout('iron_sword', 'iron_armor');
    const rng = new SeededRNG(42);
    const strategy = new Tier4ForgeStrategy();

    const actions = strategy.plan(stockpile, loadout, 10, 1, [], registry, rng);

    const transplantActions = actions.filter(a => a.kind === 'transplant_gem');
    expect(transplantActions.length).toBeGreaterThan(0);

    // The planned transplant should reference the correct gems
    const t = transplantActions[0];
    if (t.kind === 'transplant_gem') {
      expect(t.targetGemUid).toBe('host1');
      expect(t.sourceGemUid).toBe('donor1');
    }
  });

  it('does not transplant when no gem has an open secondary slot', () => {
    // All T3 common gems: tier(3) + rarityIndex(common=0) = 3 < 6 → no secondary slot
    const stockpile = [
      createGem('g1', 'flat_physical', 3, 'common'),
      createGem('g2', 'flat_hp', 3, 'common'),
      createGem('g3', 'armor_rating', 2, 'common'),
    ];
    const loadout = createEmptyLoadout('iron_sword', 'iron_armor');
    const rng = new SeededRNG(42);
    const strategy = new Tier4ForgeStrategy();

    const actions = strategy.plan(stockpile, loadout, 10, 1, [], registry, rng);

    const transplantActions = actions.filter(a => a.kind === 'transplant_gem');
    expect(transplantActions.length).toBe(0);
  });

  it('does not transplant when host has a filled secondary', () => {
    // Host has an open slot shape but secondary is already filled
    const filledSecondary: SecondarySlot = {
      affixId: 'armor_rating',
      tier: 2,
      rarity: 'magic',
      sourceGemUid: 'some_old_donor',
    };
    const host = {
      ...createGem('host2', 'flat_physical', 5, 'rare'),
      secondary: filledSecondary,
    };
    const donor = createGem('donor2', 'flat_hp', 3, 'magic');
    const stockpile = [host, donor];
    const loadout = createEmptyLoadout('iron_sword', 'iron_armor');
    const rng = new SeededRNG(42);
    const strategy = new Tier4ForgeStrategy();

    const actions = strategy.plan(stockpile, loadout, 10, 1, [], registry, rng);

    const transplantActions = actions.filter(a => a.kind === 'transplant_gem');
    expect(transplantActions.length).toBe(0);
  });

  it('skips signature/category combine candidates when either input has filled secondary', () => {
    // chance_on_hit + fire_damage → ignite (signature combine)
    // Give one of them a filled secondary so the combine would be rejected
    const filledSecondary: SecondarySlot = {
      affixId: 'flat_hp',
      tier: 2,
      rarity: 'magic',
      sourceGemUid: 'some_donor',
    };
    // T5 rare so it has a secondary slot, then fill it
    const gemA = {
      ...createGem('combo_a', 'chance_on_hit', 5, 'rare'),
      secondary: filledSecondary,
    };
    const gemB = createGem('combo_b', 'fire_damage', 3, 'common');
    const stockpile = [gemA, gemB];
    const loadout = createEmptyLoadout('iron_sword', 'iron_armor');
    const rng = new SeededRNG(42);
    const strategy = new Tier5ForgeStrategy();

    const actions = strategy.plan(stockpile, loadout, 10, 1, [], registry, rng);

    // The SIGNATURE combine (no keepGemUid) of combo_a + combo_b must NOT be emitted.
    // A generic combine (keepGemUid set) between these gems is allowed.
    const signatureCombines = actions.filter(
      a =>
        a.kind === 'combine' &&
        !a.keepGemUid &&
        ((a.gemUid1 === 'combo_a' && a.gemUid2 === 'combo_b') ||
          (a.gemUid1 === 'combo_b' && a.gemUid2 === 'combo_a')),
    );
    expect(signatureCombines.length).toBe(0);
  });

  it('still allows generic-upgrade combines when one gem has filled secondary', () => {
    // Two same-affix gems — generic upgrade. One has filled secondary.
    // The generic path (keepGemUid) should still be permitted.
    const filledSecondary: SecondarySlot = {
      affixId: 'flat_hp',
      tier: 2,
      rarity: 'magic',
      sourceGemUid: 'some_donor',
    };
    const gemA = {
      ...createGem('upgrade_a', 'flat_physical', 3, 'common'),
      secondary: filledSecondary,
    };
    const gemB = createGem('upgrade_b', 'flat_physical', 2, 'common');
    const stockpile = [gemA, gemB];
    const loadout = createEmptyLoadout('iron_sword', 'iron_armor');
    const rng = new SeededRNG(42);
    const strategy = new Tier4ForgeStrategy();

    const actions = strategy.plan(stockpile, loadout, 10, 1, [], registry, rng);

    // Should still emit a combine with keepGemUid (generic upgrade)
    const genericCombines = actions.filter(
      a => a.kind === 'combine' && a.keepGemUid !== undefined,
    );
    expect(genericCombines.length).toBeGreaterThanOrEqual(1);
  });
});
