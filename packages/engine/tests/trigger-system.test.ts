import { describe, it, expect } from 'vitest';
import { extractTriggers } from '../src/duel/trigger-system.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { createGem } from '../src/types/gem.js';
import type { Loadout } from '../src/types/item.js';
import type { AffixTier } from '../src/types/affix.js';
import type { GemRarity } from '../src/types/gem.js';

const data = loadAndValidateData();
const registry = new DataRegistry(
  data.affixes,
  data.combinations,
  data.synergies,
  data.baseItems,
  data.balance,
  data.recipes,
);

interface SlotSpec {
  affixId: string;
  tier: AffixTier;
  rarity?: GemRarity;
  sourceRecipe?: string;
  recipeDepth?: number;
}

function makeLoadout(
  weaponSlots: Array<SlotSpec | null> = [],
  armorSlots: Array<SlotSpec | null> = [],
): Loadout {
  const toSlot = (s: SlotSpec | null) =>
    s
      ? {
          gem: createGem(
            `uid_${s.affixId}_${s.tier}`,
            s.affixId,
            s.tier as 1 | 2 | 3 | 4 | 5,
            s.rarity ?? 'common',
            {
              sourceRecipe: s.sourceRecipe,
              recipeDepth: s.recipeDepth,
            },
          ),
        }
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
    expect(triggers[0].effects[0].kind).toBe('bonus_damage');
  });

  it('extracts trigger from chance_on_taking_damage on armor (heal effect)', () => {
    const loadout = makeLoadout([], [{ affixId: 'chance_on_taking_damage', tier: 1 }]);
    const triggers = extractTriggers(loadout, registry);

    expect(triggers).toHaveLength(1);
    expect(triggers[0].condition).toBe('on_taking_damage');
    expect(triggers[0].effects[0].kind).toBe('heal');
    if (triggers[0].effects[0].kind === 'heal') {
      expect(triggers[0].effects[0].amount).toBe(4); // armor T1 procHeal = 4
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
    if (t1[0].effects[0].kind === 'bonus_damage' && t4[0].effects[0].kind === 'bonus_damage') {
      expect(t4[0].effects[0].amount).toBeGreaterThan(t1[0].effects[0].amount);
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

describe('extractTriggers — compound gems', () => {
  it('extracts an Ignite compound trigger from a socketed ignite gem', () => {
    // An ignite gem is the output of the Ignite recipe: its affixId == 'ignite'
    // and its sourceRecipe == 'ignite'. The trigger system should detect it and
    // emit a compound_dot TriggerEffect.
    const loadout = makeLoadout([
      {
        affixId: 'ignite',
        tier: 1,
        rarity: 'common',
        sourceRecipe: 'ignite',
        recipeDepth: 1,
      },
    ]);

    const triggers = extractTriggers(loadout, registry);
    const ignite = triggers.find(
      (t) => t.effects[0].kind === 'compound_dot' && t.effects[0].compoundId === 'ignite',
    );
    expect(ignite).toBeDefined();
    expect(ignite?.condition).toBe('on_hit');
    expect(ignite?.chance).toBeGreaterThan(0);
    if (ignite?.effects[0].kind === 'compound_dot') {
      expect(ignite.effects[0].element).toBe('fire');
      expect(ignite.effects[0].dotMultiplier).toBeCloseTo(2.0);
      expect(ignite.effects[0].duration).toBeGreaterThan(0);
      expect(ignite.effects[0].damagePerSecond).toBeGreaterThan(0);
    }
  });

  it('compound recipe with no compoundEffects produces no triggers', () => {
    // Envenom is intentionally not wired — its stack-mutation semantics
    // (poison stacks count double) need a real DOT-rule mutation system,
    // deferred to a future tier. extractTriggers must produce zero triggers
    // for it.
    const loadout = makeLoadout([
      {
        affixId: 'envenom',
        tier: 1,
        rarity: 'common',
        sourceRecipe: 'envenom',
        recipeDepth: 1,
      },
    ]);

    const triggers = extractTriggers(loadout, registry);
    const fromIt = triggers.filter((t) => t.affixId === 'envenom');
    expect(fromIt).toEqual([]);
  });

  it('extracts a Concussion compound trigger from a socketed concussion gem (stun on hit)', () => {
    const loadout = makeLoadout([
      {
        affixId: 'concussion',
        tier: 1,
        rarity: 'common',
        sourceRecipe: 'concussion',
        recipeDepth: 1,
      },
    ]);

    const triggers = extractTriggers(loadout, registry);
    const concussion = triggers.find((t) => t.affixId === 'concussion');
    expect(concussion).toBeDefined();
    expect(concussion?.condition).toBe('on_hit');
    expect(concussion?.chance).toBeGreaterThan(0);
    expect(concussion?.effects[0].kind).toBe('stun');
    if (concussion?.effects[0].kind === 'stun') {
      expect(concussion.effects[0].duration).toBeGreaterThan(0);
    }
  });

  it('extracts a Retribution Aura compound trigger (reflect on taking damage)', () => {
    const loadout = makeLoadout(
      [],
      [
        {
          affixId: 'retribution_aura',
          tier: 1,
          rarity: 'common',
          sourceRecipe: 'retribution_aura',
          recipeDepth: 1,
        },
      ],
    );

    const triggers = extractTriggers(loadout, registry);
    const retribution = triggers.find((t) => t.affixId === 'retribution_aura');
    expect(retribution).toBeDefined();
    expect(retribution?.condition).toBe('on_taking_damage');
    expect(retribution?.chance).toBeGreaterThan(0);
    expect(retribution?.effects[0].kind).toBe('reflect_damage');
    if (retribution?.effects[0].kind === 'reflect_damage') {
      expect(retribution.effects[0].multiplier).toBeCloseTo(2.0);
      expect(retribution.effects[0].duration).toBeGreaterThan(0);
    }
  });

  it('extracts a Shield Bash compound trigger (stun on block)', () => {
    const loadout = makeLoadout(
      [],
      [
        {
          affixId: 'shield_bash',
          tier: 1,
          rarity: 'common',
          sourceRecipe: 'shield_bash',
          recipeDepth: 1,
        },
      ],
    );
    const triggers = extractTriggers(loadout, registry);
    const sb = triggers.find((t) => t.affixId === 'shield_bash');
    expect(sb?.condition).toBe('on_block');
    expect(sb?.effects[0].kind).toBe('stun');
    if (sb?.effects[0].kind === 'stun') {
      expect(sb.effects[0].duration).toBeGreaterThan(0);
    }
  });

  it('extracts an Immolation compound trigger (fire bonus_damage on taking damage, scales with tier)', () => {
    const tierLoadout = (tier: 1 | 2 | 3 | 4) =>
      makeLoadout(
        [],
        [
          {
            affixId: 'immolation',
            tier,
            rarity: 'common',
            sourceRecipe: 'immolation',
            recipeDepth: 1,
          },
        ],
      );
    const t1 = extractTriggers(tierLoadout(1), registry).find((t) => t.affixId === 'immolation');
    const t3 = extractTriggers(tierLoadout(3), registry).find((t) => t.affixId === 'immolation');
    expect(t1?.condition).toBe('on_taking_damage');
    expect(t1?.effects[0].kind).toBe('bonus_damage');
    if (t1?.effects[0].kind === 'bonus_damage' && t3?.effects[0].kind === 'bonus_damage') {
      expect(t1.effects[0].damageType).toBe('fire');
      expect(t3.effects[0].amount).toBeGreaterThan(t1.effects[0].amount);
    }
  });

  it('extracts a Combustion compound trigger (fire compound_dot on crit)', () => {
    const loadout = makeLoadout([
      {
        affixId: 'combustion',
        tier: 1,
        rarity: 'common',
        sourceRecipe: 'combustion',
        recipeDepth: 1,
      },
    ]);
    const triggers = extractTriggers(loadout, registry);
    const combustion = triggers.find((t) => t.affixId === 'combustion');
    expect(combustion?.condition).toBe('on_crit');
    expect(combustion?.effects[0].kind).toBe('compound_dot');
    if (combustion?.effects[0].kind === 'compound_dot') {
      expect(combustion.effects[0].compoundId).toBe('combustion');
      expect(combustion.effects[0].element).toBe('fire');
      expect(combustion.effects[0].damagePerSecond).toBeGreaterThan(0);
    }
  });

  it('extracts a Soul Siphon compound trigger (heal on hit)', () => {
    const loadout = makeLoadout([
      {
        affixId: 'soul_siphon',
        tier: 1,
        rarity: 'common',
        sourceRecipe: 'soul_siphon',
        recipeDepth: 1,
      },
    ]);
    const triggers = extractTriggers(loadout, registry);
    const ss = triggers.find((t) => t.affixId === 'soul_siphon');
    expect(ss?.condition).toBe('on_hit');
    expect(ss?.effects[0].kind).toBe('heal');
    if (ss?.effects[0].kind === 'heal') {
      expect(ss.effects[0].amount).toBeGreaterThan(0);
      expect(ss.effects[0].isPercent).toBe(false);
    }
  });

  it('extracts a Blood Frenzy compound trigger (lifestealPercent additive buff on low HP)', () => {
    const loadout = makeLoadout([
      {
        affixId: 'blood_frenzy',
        tier: 1,
        rarity: 'common',
        sourceRecipe: 'blood_frenzy',
        recipeDepth: 1,
      },
    ]);
    const triggers = extractTriggers(loadout, registry);
    const bf = triggers.find((t) => t.affixId === 'blood_frenzy');
    expect(bf?.condition).toBe('on_low_hp');
    expect(bf?.effects[0].kind).toBe('stat_buff_add');
    if (bf?.effects[0].kind === 'stat_buff_add') {
      expect(bf.effects[0].stat).toBe('lifestealPercent');
      expect(bf.effects[0].value).toBeGreaterThan(0);
      expect(bf.effects[0].duration).toBeGreaterThan(0);
    }
  });

  it('extracts a Desperation compound trigger (attackSpeed multiplicative buff on low HP)', () => {
    const loadout = makeLoadout([
      {
        affixId: 'desperation',
        tier: 1,
        rarity: 'common',
        sourceRecipe: 'desperation',
        recipeDepth: 1,
      },
    ]);
    const triggers = extractTriggers(loadout, registry);
    const desp = triggers.find((t) => t.affixId === 'desperation');
    expect(desp?.condition).toBe('on_low_hp');
    expect(desp?.effects[0].kind).toBe('stat_buff_mul');
    if (desp?.effects[0].kind === 'stat_buff_mul') {
      expect(desp.effects[0].stat).toBe('attackSpeed');
      expect(desp.effects[0].multiplier).toBeLessThan(1); // < 1 = faster attacks
      expect(desp.effects[0].duration).toBeGreaterThan(0);
    }
  });

  it('extracts a Reactive Shield compound trigger (% max HP barrier on taking damage)', () => {
    const loadout = makeLoadout(
      [],
      [
        {
          affixId: 'reactive_shield',
          tier: 1,
          rarity: 'common',
          sourceRecipe: 'reactive_shield',
          recipeDepth: 1,
        },
      ],
    );
    const triggers = extractTriggers(loadout, registry);
    const rs = triggers.find((t) => t.affixId === 'reactive_shield');
    expect(rs?.condition).toBe('on_taking_damage');
    expect(rs?.effects[0].kind).toBe('gain_barrier');
    if (rs?.effects[0].kind === 'gain_barrier') {
      expect(rs.effects[0].isPercent).toBe(true);
      expect(rs.effects[0].amount).toBeGreaterThan(0);
      expect(rs.effects[0].amount).toBeLessThanOrEqual(1);
      // Tier 4: triggered shield expires
      expect(rs.effects[0].duration).toBeGreaterThan(0);
    }
  });

  it('extracts a Counter Strike compound trigger (scaled bonus_damage on block)', () => {
    const loadout = makeLoadout(
      [],
      [
        {
          affixId: 'counter_strike',
          tier: 1,
          rarity: 'common',
          sourceRecipe: 'counter_strike',
          recipeDepth: 1,
        },
      ],
    );
    const triggers = extractTriggers(loadout, registry);
    const cs = triggers.find((t) => t.affixId === 'counter_strike');
    expect(cs?.condition).toBe('on_block');
    expect(cs?.effects[0].kind).toBe('bonus_damage_scaled');
    if (cs?.effects[0].kind === 'bonus_damage_scaled') {
      expect(cs.effects[0].damageType).toBe('physical');
      expect(cs.effects[0].multiplier).toBeGreaterThan(1);
    }
  });

  it('extracts a Bastion compound trigger via explicit on_block condition (capstone, no chance_*)', () => {
    const loadout = makeLoadout(
      [],
      [
        {
          affixId: 'bastion',
          tier: 1,
          rarity: 'common',
          sourceRecipe: 'bastion',
          recipeDepth: 1,
        },
      ],
    );
    const triggers = extractTriggers(loadout, registry);
    const bastion = triggers.find((t) => t.affixId === 'bastion');
    expect(bastion?.condition).toBe('on_block');
    expect(bastion?.chance).toBeCloseTo(1.0);
    expect(bastion?.effects).toHaveLength(1);
    expect(bastion?.effects[0].kind).toBe('gain_barrier');
    if (bastion?.effects[0].kind === 'gain_barrier') {
      expect(bastion.effects[0].isPercent).toBe(true);
      expect(bastion.effects[0].amount).toBeGreaterThan(0);
      // Tier 4: capstone shield expires (otherwise it would stack indefinitely)
      expect(bastion.effects[0].duration).toBeGreaterThan(0);
    }
  });

  it('Frostbite produces ONE TriggerDef on_hit with 2 grouped effects (DOT + slow)', () => {
    const loadout = makeLoadout([
      {
        affixId: 'frostbite',
        tier: 1,
        rarity: 'common',
        sourceRecipe: 'frostbite',
        recipeDepth: 1,
      },
    ]);
    const triggers = extractTriggers(loadout, registry);
    const frostbite = triggers.filter((t) => t.affixId === 'frostbite');
    // Single TriggerDef (single chance roll) carrying both effects together
    expect(frostbite).toHaveLength(1);
    expect(frostbite[0].condition).toBe('on_hit');
    expect(frostbite[0].effects).toHaveLength(2);
    const kinds = frostbite[0].effects.map((e) => e.kind).sort();
    expect(kinds).toEqual(['apply_slow', 'compound_dot']);
    const slow = frostbite[0].effects.find((e) => e.kind === 'apply_slow');
    expect(slow?.kind === 'apply_slow' && slow.multiplier).toBeGreaterThan(1);
  });

  it('extracts a Static Discharge compound trigger (lightning bonus_damage_scaled on hit)', () => {
    const loadout = makeLoadout([
      {
        affixId: 'static_discharge',
        tier: 1,
        rarity: 'common',
        sourceRecipe: 'static_discharge',
        recipeDepth: 1,
      },
    ]);
    const triggers = extractTriggers(loadout, registry);
    const sd = triggers.find((t) => t.affixId === 'static_discharge');
    expect(sd?.condition).toBe('on_hit');
    expect(sd?.effects).toHaveLength(1);
    expect(sd?.effects[0].kind).toBe('bonus_damage_scaled');
    if (sd?.effects[0].kind === 'bonus_damage_scaled') {
      expect(sd.effects[0].damageType).toBe('lightning');
      expect(sd.effects[0].multiplier).toBeGreaterThan(0);
      expect(sd.effects[0].multiplier).toBeLessThanOrEqual(1);
    }
  });

  it('extracts a Soul Rend compound trigger with full intent (damage_current_hp + reduce_max_hp on hit)', () => {
    const loadout = makeLoadout([
      {
        affixId: 'soul_rend',
        tier: 1,
        rarity: 'common',
        sourceRecipe: 'soul_rend',
        recipeDepth: 1,
      },
    ]);
    const triggers = extractTriggers(loadout, registry);
    const sr = triggers.find((t) => t.affixId === 'soul_rend');
    expect(sr?.condition).toBe('on_hit');
    // Tier 5: now fires both halves of the recipe — current-HP siphon + max-HP debuff
    expect(sr?.effects).toHaveLength(2);
    const kinds = sr!.effects.map((e) => e.kind).sort();
    expect(kinds).toEqual(['damage_current_hp', 'reduce_max_hp']);
    const reduce = sr!.effects.find((e) => e.kind === 'reduce_max_hp');
    if (reduce?.kind === 'reduce_max_hp') {
      expect(reduce.fraction).toBeGreaterThan(0);
      expect(reduce.duration).toBeGreaterThan(0);
    }
  });

  it('extracts a Phoenix Embers capstone (immolation + reactive_shield on_taking_damage)', () => {
    const loadout = makeLoadout(
      [],
      [
        { affixId: 'phoenix_embers', tier: 1, rarity: 'common', sourceRecipe: 'phoenix_embers', recipeDepth: 2 },
      ],
    );
    const triggers = extractTriggers(loadout, registry);
    const pe = triggers.find((t) => t.affixId === 'phoenix_embers');
    expect(pe?.condition).toBe('on_taking_damage');
    expect(pe?.effects).toHaveLength(2);
    const kinds = pe!.effects.map((e) => e.kind).sort();
    expect(kinds).toEqual(['bonus_damage', 'gain_barrier']);
  });

  it('extracts an Oathbound Fury capstone (multi stat_buff on_low_hp)', () => {
    const loadout = makeLoadout([
      { affixId: 'oathbound_fury', tier: 1, rarity: 'common', sourceRecipe: 'oathbound_fury', recipeDepth: 2 },
    ]);
    const triggers = extractTriggers(loadout, registry);
    const of = triggers.find((t) => t.affixId === 'oathbound_fury');
    expect(of?.condition).toBe('on_low_hp');
    expect(of?.chance).toBeCloseTo(1.0);
    const kinds = of!.effects.map((e) => e.kind).sort();
    expect(kinds).toEqual(['stat_buff_add', 'stat_buff_mul']);
  });

  it('extracts a Frost Nova capstone (cold bonus_damage + apply_slow on_block)', () => {
    const loadout = makeLoadout(
      [],
      [
        { affixId: 'frost_nova', tier: 1, rarity: 'common', sourceRecipe: 'frost_nova', recipeDepth: 1 },
      ],
    );
    const triggers = extractTriggers(loadout, registry);
    const fn = triggers.find((t) => t.affixId === 'frost_nova');
    expect(fn?.condition).toBe('on_block');
    expect(fn?.effects).toHaveLength(2);
    const kinds = fn!.effects.map((e) => e.kind).sort();
    expect(kinds).toEqual(['apply_slow', 'bonus_damage']);
  });

  it('extracts a Detonator capstone (compound_dot fire on_crit)', () => {
    const loadout = makeLoadout([
      { affixId: 'detonator', tier: 1, rarity: 'common', sourceRecipe: 'detonator', recipeDepth: 1 },
    ]);
    const triggers = extractTriggers(loadout, registry);
    const det = triggers.find((t) => t.affixId === 'detonator');
    expect(det?.condition).toBe('on_crit');
    expect(det?.effects[0].kind).toBe('compound_dot');
    if (det?.effects[0].kind === 'compound_dot') {
      expect(det.effects[0].element).toBe('fire');
      expect(det.effects[0].dotMultiplier).toBeGreaterThan(2);
    }
  });

  it('extracts a Thunderbrand capstone (lightning bonus_damage_scaled on_hit)', () => {
    const loadout = makeLoadout([
      { affixId: 'thunderbrand', tier: 1, rarity: 'common', sourceRecipe: 'thunderbrand', recipeDepth: 1 },
    ]);
    const triggers = extractTriggers(loadout, registry);
    const tb = triggers.find((t) => t.affixId === 'thunderbrand');
    expect(tb?.condition).toBe('on_hit');
    expect(tb?.effects[0].kind).toBe('bonus_damage_scaled');
    if (tb?.effects[0].kind === 'bonus_damage_scaled') {
      expect(tb.effects[0].damageType).toBe('lightning');
    }
  });

  it('extracts a Soul Eclipse capstone (damage_current_hp + heal on_hit)', () => {
    const loadout = makeLoadout([
      { affixId: 'soul_eclipse', tier: 1, rarity: 'common', sourceRecipe: 'soul_eclipse', recipeDepth: 2 },
    ]);
    const triggers = extractTriggers(loadout, registry);
    const se = triggers.find((t) => t.affixId === 'soul_eclipse');
    expect(se?.condition).toBe('on_hit');
    const kinds = se!.effects.map((e) => e.kind).sort();
    expect(kinds).toEqual(['damage_current_hp', 'heal']);
  });

  it('base-affix triggers still extract alongside compound pathway', () => {
    // Plain chance_on_hit gem (not a compound) must still yield a bonus_damage
    // TriggerEffect — locks the existing pathway against regression.
    const loadout = makeLoadout([{ affixId: 'chance_on_hit', tier: 2 }]);
    const triggers = extractTriggers(loadout, registry);

    expect(triggers).toHaveLength(1);
    expect(triggers[0].affixId).toBe('chance_on_hit');
    expect(triggers[0].condition).toBe('on_hit');
    expect(triggers[0].effects[0].kind).toBe('bonus_damage');
  });

  it('compound lookup does not match plain affixes that share an id prefix', () => {
    // fire_damage is a base affix, not a compound. Its id is not a recipe
    // outputAffixId, so no compound_dot trigger should be extracted.
    const loadout = makeLoadout([{ affixId: 'fire_damage', tier: 1 }]);
    const triggers = extractTriggers(loadout, registry);
    const compoundDots = triggers.filter(
      (t) => t.effects[0].kind === 'compound_dot',
    );
    expect(compoundDots).toEqual([]);
  });
});
