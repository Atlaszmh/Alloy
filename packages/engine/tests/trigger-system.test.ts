import { describe, it, expect } from 'vitest';
import { extractTriggers } from '../src/duel/trigger-system.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { createGem } from '../src/types/gem.js';
import type { Loadout } from '../src/types/item.js';
import type { AffixTier } from '../src/types/affix.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);

function makeLoadout(
  weaponSlots: Array<{ affixId: string; tier: AffixTier } | null> = [],
  armorSlots: Array<{ affixId: string; tier: AffixTier } | null> = [],
): Loadout {
  const toSlot = (s: { affixId: string; tier: AffixTier } | null) =>
    s
      ? { gem: createGem(`uid_${s.affixId}_${s.tier}`, s.affixId, s.tier as 1|2|3|4|5, 'common') }
      : null;

  return {
    weapon: {
      baseItemId: 'sword',
      baseStats: null,
      slots: [
        ...weaponSlots.map(toSlot),
        ...Array(6 - weaponSlots.length).fill(null),
      ],
    },
    armor: {
      baseItemId: 'chainmail',
      baseStats: null,
      slots: [
        ...armorSlots.map(toSlot),
        ...Array(6 - armorSlots.length).fill(null),
      ],
    },
  };
}

describe('extractTriggers', () => {
  it('returns empty array for loadout with no trigger affixes', () => {
    const loadout = makeLoadout(
      [{ affixId: 'flat_physical', tier: 1 }],
      [{ affixId: 'armor_rating', tier: 1 }],
    );
    const triggers = extractTriggers(loadout, registry);
    expect(triggers).toEqual([]);
  });

  it('extracts trigger from chance_on_hit on weapon', () => {
    const loadout = makeLoadout([{ affixId: 'chance_on_hit', tier: 1 }]);
    const triggers = extractTriggers(loadout, registry);

    expect(triggers).toHaveLength(1);
    expect(triggers[0].affixId).toBe('chance_on_hit');
    expect(triggers[0].condition).toBe('on_hit');
    expect(triggers[0].chance).toBe(0.03); // valueRange[0] = 3 -> 3/100
    expect(triggers[0].cooldown).toBe(5); // valueRange[1] = 5
    expect(triggers[0].effect.kind).toBe('bonus_damage');
  });

  it('extracts trigger from chance_on_taking_damage on armor (heal effect)', () => {
    const loadout = makeLoadout([], [{ affixId: 'chance_on_taking_damage', tier: 1 }]);
    const triggers = extractTriggers(loadout, registry);

    expect(triggers).toHaveLength(1);
    expect(triggers[0].condition).toBe('on_taking_damage');
    expect(triggers[0].effect.kind).toBe('heal');
    if (triggers[0].effect.kind === 'heal') {
      expect(triggers[0].effect.amount).toBe(4); // armor T1 procHeal = 4
    }
  });

  it('higher tier increases effect magnitude', () => {
    const loadoutT1 = makeLoadout([{ affixId: 'chance_on_hit', tier: 1 }]);
    const loadoutT4 = makeLoadout([{ affixId: 'chance_on_hit', tier: 4 }]);

    const t1 = extractTriggers(loadoutT1, registry);
    const t4 = extractTriggers(loadoutT4, registry);

    expect(t1).toHaveLength(1);
    expect(t4).toHaveLength(1);

    // T4 should have higher chance and effect than T1
    expect(t4[0].chance).toBeGreaterThan(t1[0].chance);
    if (t1[0].effect.kind === 'bonus_damage' && t4[0].effect.kind === 'bonus_damage') {
      expect(t4[0].effect.amount).toBeGreaterThan(t1[0].effect.amount);
    }
  });

  it('extracts triggers from both weapon and armor slots', () => {
    const loadout = makeLoadout(
      [{ affixId: 'chance_on_hit', tier: 1 }],
      [{ affixId: 'chance_on_taking_damage', tier: 1 }],
    );
    const triggers = extractTriggers(loadout, registry);
    expect(triggers).toHaveLength(2);
    expect(triggers.map((t) => t.condition)).toContain('on_hit');
    expect(triggers.map((t) => t.condition)).toContain('on_taking_damage');
  });

  it('non-trigger gem slots are skipped', () => {
    const loadout = makeLoadout(
      [{ affixId: 'flat_physical', tier: 1 }],
    );
    const triggers = extractTriggers(loadout, registry);
    expect(triggers).toEqual([]);
  });
});
