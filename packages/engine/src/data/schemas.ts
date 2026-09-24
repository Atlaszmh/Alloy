import { z } from 'zod';

// --- Shared Schemas ---

const StatModifierSchema = z.object({
  stat: z.string(),
  op: z.enum(['flat', 'percent', 'override']),
  value: z.number(),
});

// --- Affix Schemas ---

const AffixTierDataSchema = z.object({
  weaponEffect: z.array(StatModifierSchema),
  armorEffect: z.array(StatModifierSchema),
  valueRange: z.tuple([z.number(), z.number()]),
});

const AffixDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  weaponFlavorText: z.string(),
  armorFlavorText: z.string(),
  category: z.enum(['offensive', 'defensive', 'sustain', 'utility', 'trigger']),
  tags: z.array(z.string()),
  tiers: z.record(z.coerce.number().pipe(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])), AffixTierDataSchema),
});

export const AffixesSchema = z.array(AffixDefSchema);

// --- Combination Schemas ---

const CompoundAffixDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  weaponFlavorText: z.string(),
  armorFlavorText: z.string(),
  components: z.union([
    z.tuple([z.string(), z.string()]),
    z.tuple([z.string(), z.string(), z.string()]),
  ]),
  fluxCost: z.number().int().positive(),
  slotCost: z.number().int().positive(),
  weaponEffect: z.array(StatModifierSchema),
  armorEffect: z.array(StatModifierSchema),
  tags: z.array(z.string()),
});

export const CombinationsSchema = z.array(CompoundAffixDefSchema);

// --- Recipe Schemas ---

const RecipeComponentSchema = z.object({
  kind: z.enum(['affix', 'recipe']),
  id: z.string(),
});

const CategoryRuleSchema = z.object({
  inputA: z.string(),
  inputB: z.string(),
});

const TriggerConditionSchema = z.enum([
  'on_hit',
  'on_crit',
  'on_block',
  'on_dodge',
  'on_taking_damage',
  'on_low_hp',
]);

const ElementSchema = z.enum(['fire', 'cold', 'lightning', 'poison', 'shadow', 'chaos']);
const PhysicalOrElementSchema = z.union([z.literal('physical'), ElementSchema]);

const CompoundEffectShapeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('compound_dot'),
    element: ElementSchema,
    dpsPerTier: z.number().nonnegative(),
    duration: z.number().nonnegative(),
    tickInterval: z.number().positive(),
    dotMultiplier: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal('apply_dot'),
    element: ElementSchema,
    dpsPerTier: z.number().nonnegative(),
    duration: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal('gain_barrier'),
    amount: z.number().nonnegative().optional(),
    amountPerTier: z.number().nonnegative().optional(),
    isPercent: z.boolean().optional(),
    duration: z.number().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal('stun'),
    duration: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal('reflect_damage'),
    multiplier: z.number().nonnegative(),
    duration: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal('apply_slow'),
    multiplier: z.number().positive(),
    duration: z.number().positive(),
  }),
  z.object({
    kind: z.literal('amplify_dot_element'),
    element: ElementSchema,
    stackMultiplier: z.number().positive(),
    tickMultiplier: z.number().positive(),
    duration: z.number().positive(),
  }),
  z.object({
    kind: z.literal('heal'),
    amount: z.number().optional(),
    amountPerTier: z.number().optional(),
    isPercent: z.boolean(),
  }),
  z.object({
    kind: z.literal('bonus_damage'),
    damageType: PhysicalOrElementSchema,
    amount: z.number().nonnegative().optional(),
    amountPerTier: z.number().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal('bonus_damage_scaled'),
    damageType: PhysicalOrElementSchema,
    multiplier: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal('damage_current_hp'),
    fraction: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal('reduce_max_hp'),
    // Cap < 1 so a recipe entry never zeroes out maxHP and instakills the
    // target via the currentHP clamp. 0.95 is a generous ceiling — designers
    // should rarely exceed 0.5.
    fraction: z.number().min(0).max(0.95),
    duration: z.number().positive(),
  }),
  z.object({
    kind: z.literal('stat_buff_add'),
    stat: z.string(),
    value: z.number().optional(),
    valuePerTier: z.number().optional(),
    duration: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal('stat_buff_mul'),
    stat: z.string(),
    multiplier: z.number(),
    duration: z.number().nonnegative(),
  }),
]);

const CompoundEffectBlueprintSchema = z.object({
  condition: TriggerConditionSchema.optional(),
  effect: CompoundEffectShapeSchema,
});

const ElementSchemaForCondition = z.enum(['fire', 'cold', 'lightning', 'poison', 'shadow', 'chaos']);

const PassiveModifierConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('always') }),
  z.object({ kind: z.literal('target_has_dot_element'), element: ElementSchemaForCondition }),
  z.object({ kind: z.literal('target_slowed') }),
  z.object({ kind: z.literal('target_below_hp_pct'), pct: z.number().min(0).max(1) }),
  z.object({ kind: z.literal('self_above_hp_pct'), pct: z.number().min(0).max(1) }),
  z.object({ kind: z.literal('self_has_barrier') }),
]);

const PassiveDamageModifierBlueprintSchema = z.object({
  damageType: z.union([z.literal('physical'), ElementSchemaForCondition]),
  multiplier: z.number().nonnegative(),
  condition: PassiveModifierConditionSchema,
});

const RecipeDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['signature', 'signature3', 'category']),
  components: z.union([
    z.tuple([RecipeComponentSchema, RecipeComponentSchema]),
    z.tuple([RecipeComponentSchema, RecipeComponentSchema, RecipeComponentSchema]),
  ]).optional(),
  categoryRule: CategoryRuleSchema.optional(),
  outputAffixId: z.string(),
  outputBonusEffects: z.array(StatModifierSchema),
  compoundEffects: z.array(CompoundEffectBlueprintSchema).optional(),
  passiveDamageModifiers: z.array(PassiveDamageModifierBlueprintSchema).optional(),
  maxDepthContribution: z.number().int().nonnegative(),
  tags: z.array(z.string()),
}).superRefine((recipe, ctx) => {
  if (recipe.type === 'signature') {
    if (!recipe.components || recipe.components.length !== 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'signature recipes must have exactly 2 components',
        path: ['components'],
      });
    }
  }
  if (recipe.type === 'signature3') {
    if (!recipe.components || recipe.components.length !== 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'signature3 recipes must have exactly 3 components',
        path: ['components'],
      });
    }
  }
});

export const RecipesSchema = z.array(RecipeDefinitionSchema);

// --- Synergy Schemas ---

const SynergyDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  requiredAffixes: z.array(z.string()),
  bonusEffects: z.array(StatModifierSchema),
  description: z.string(),
  condition: z.string().optional(),
});

export const SynergiesSchema = z.array(SynergyDefSchema);

// --- Base Item Schemas ---

const BaseItemDefSchema = z.object({
  id: z.string(),
  type: z.enum(['weapon', 'armor']),
  name: z.string(),
  baseStats: z.record(z.string(), z.number()),
  description: z.string(),
});

export const BaseItemsSchema = z.array(BaseItemDefSchema);

// --- Balance Config Schema ---

const FluxCostsSchema = z.object({
  assignOrb: z.number().int().nonnegative(),
  combineOrbs: z.number().int().nonnegative(),
  upgradeTier: z.number().int().nonnegative(),
  swapOrb: z.number().int().nonnegative(),
  removeOrb: z.number().int().nonnegative(),
});

const GemRaritySchema = z.enum(['common', 'uncommon', 'magic', 'rare', 'epic', 'legendary']);

const PoolScalingEntrySchema = z.object({
  roundRange: z.tuple([z.number().int(), z.number().int()]),
  tiers: z.tuple([z.number().int(), z.number().int()]),
  rarities: z.array(GemRaritySchema),
  poolSize: z.number().int().positive(),
});

const GemBalanceConfigSchema = z.object({
  tierValues: z.array(z.number()),
  rarityMultipliers: z.record(GemRaritySchema, z.number()),
  matchingRarityBonus: z.number().nonnegative(),
  depthBonusPerLevel: z.number().nonnegative(),
  maxRecipeDepth: z.number().int().positive(),
  recipeQualityThresholds: z.record(GemRaritySchema, z.number()),
  poolScaling: z.array(PoolScalingEntrySchema),
  goalRound: z.number().int().positive(),
  endlessStartRound: z.number().int().positive(),
  lives: z.object({
    default: z.number().int().positive(),
    min: z.number().int().positive(),
    max: z.number().int().positive(),
  }),
  lifeRecovery: z.object({
    winStreak: z.number().int().positive(),
    milestoneRounds: z.array(z.number().int().positive()),
    discoveryThreshold: z.number().int().positive(),
  }),
  flux: z.object({
    rewards: z.record(z.string(), z.number()),
    costs: z.record(z.string(), z.number()),
  }),
});

const TransplantBalanceSchema = z.object({
  unlockThreshold: z.number().int().positive(),
  secondaryValueScalar: z.number().positive(),
});

// --- Delve (loot-crawler mode) Schemas ---

const RaritySchema = z.enum(['common', 'uncommon', 'magic', 'rare', 'epic', 'legendary']);
const GearSlotSchema = z.enum(['weapon', 'helm', 'chest', 'gloves', 'boots', 'amulet', 'ring']);
const HeroStatKeySchema = z.enum([
  'damage',
  'fireDamage',
  'coldDamage',
  'lightningDamage',
  'damagePct',
  'attackSpeedPct',
  'critChance',
  'critDamage',
  'maxHp',
  'hpPct',
  'armor',
  'dodge',
  'lifesteal',
  'lifeOnHit',
  'healOnKill',
  'thorns',
  'magicFind',
  'scrapFind',
]);
const MonsterTraitSchema = z.enum(['armored', 'swift', 'brute', 'regenerating', 'vampiric', 'spiked']);
const StatScalingSchema = z.enum(['flat', 'fixed']);

function perRarity<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    common: schema,
    uncommon: schema,
    magic: schema,
    rare: schema,
    epic: schema,
    legendary: schema,
  });
}

function perSlot<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    weapon: schema,
    helm: schema,
    chest: schema,
    gloves: schema,
    boots: schema,
    amulet: schema,
    ring: schema,
  });
}

const MonsterDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  hp: z.number().positive(),
  dmg: z.number().positive(),
  interval: z.number().positive(),
  traits: z.array(MonsterTraitSchema).optional(),
});

export const DelveDataSchema = z.object({
  slotWeights: perSlot(z.number().positive()),
  bases: z
    .array(
      z.object({
        id: z.string(),
        slot: GearSlotSchema,
        name: z.string(),
        attackInterval: z.number().positive().optional(),
        weight: z.number().positive(),
        implicits: z.array(
          z.object({ stat: HeroStatKeySchema, base: z.number().positive(), scaling: StatScalingSchema }),
        ),
      }),
    )
    .min(1),
  affixes: z
    .array(
      z.object({
        stat: HeroStatKeySchema,
        label: z.string(),
        unit: z.enum(['flat', 'pct']),
        min: z.number().positive(),
        max: z.number().positive(),
        scaling: StatScalingSchema,
        decimals: z.number().int().min(0).max(2),
        weight: z.number().positive(),
        slots: z.array(GearSlotSchema).min(1),
      }),
    )
    .min(1),
  legendaries: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        text: z.string(),
        min: z.number().min(0),
        max: z.number().min(0),
        slots: z.array(GearSlotSchema).min(1),
      }),
    )
    .min(1),
  traits: z.array(z.object({ id: MonsterTraitSchema, name: z.string(), text: z.string() })),
  biomes: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        colors: z.tuple([z.string(), z.string()]),
        accent: z.string(),
        monsters: z.array(MonsterDefSchema).min(1),
        boss: MonsterDefSchema,
      }),
    )
    .min(1),
  doors: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        text: z.string(),
        icon: z.string(),
        weight: z.number().positive(),
        mods: z.object({
          magicFind: z.number().optional(),
          monsterHp: z.number().optional(),
          monsterDmg: z.number().optional(),
          eliteChance: z.number().min(0).max(1).optional(),
          bountyMult: z.number().positive().optional(),
          dropMult: z.number().positive().optional(),
          healFull: z.boolean().optional(),
          potions: z.number().int().optional(),
          skip: z.number().int().min(0).optional(),
          fights: z.number().int().positive().optional(),
        }),
      }),
    )
    .min(3),
  materials: z.array(z.object({ minIlvl: z.number().int().positive(), name: z.string() })).min(1),
  names: z.object({
    prefixes: z.array(z.string()).min(1),
    suffixes: perSlot(z.array(z.string()).min(1)),
  }),
});

const DelveBalanceSchema = z.object({
  hero: z.object({
    baseHp: z.number().positive(),
    baseCritChance: z.number().min(0),
    baseCritMultiplier: z.number().positive(),
    unarmedDamage: z.number().positive(),
    unarmedInterval: z.number().positive(),
    minAttackInterval: z.number().positive(),
    critCap: z.number().positive(),
    dodgeCap: z.number().positive(),
    armorK: z.number().positive(),
    armorCap: z.number().positive(),
  }),
  growth: z.object({ item: z.number().positive(), monsterHp: z.number().positive(), monsterDmg: z.number().positive() }),
  monster: z.object({
    baseHp: z.number().positive(),
    baseDmg: z.number().positive(),
    elite: z.object({
      hp: z.number().positive(),
      dmg: z.number().positive(),
      minTraits: z.number().int().min(0),
      maxTraits: z.number().int().min(0),
    }),
    boss: z.object({ hp: z.number().positive(), dmg: z.number().positive() }),
    traits: z.object({
      armoredReduction: z.number().min(0).max(1),
      swiftInterval: z.number().positive(),
      swiftHp: z.number().positive(),
      bruteDmg: z.number().positive(),
      bruteInterval: z.number().positive(),
      regenPerSecond: z.number().min(0),
      vampiricFraction: z.number().min(0),
      spikedFraction: z.number().min(0),
    }),
  }),
  dive: z.object({
    fightsPerDepth: z.number().int().positive(),
    bossEvery: z.number().int().positive(),
    eliteChance: z.number().min(0).max(1),
    healOnDepthClear: z.number().min(0).max(1),
    potions: z.number().int().min(0),
    maxPotions: z.number().int().min(0),
    potionHeal: z.number().min(0).max(1),
    bossPotionReward: z.number().int().min(0),
    doorsOffered: z.number().int().positive(),
    bountyBase: z.number().min(0),
    bountyGrowth: z.number().positive(),
  }),
  slam: z.object({ chargeMax: z.number().int().positive(), damageMult: z.number().positive(), stunSeconds: z.number().min(0) }),
  elements: z.object({
    burnFraction: z.number().min(0),
    burnDuration: z.number().positive(),
    chillSlow: z.number().min(0),
    chillDuration: z.number().positive(),
    chainChance: z.number().min(0).max(100),
  }),
  loot: z.object({
    rarityWeights: perRarity(z.number().min(0)),
    luckExponent: z.number().min(0),
    luckPerDepth: z.number().min(0),
    eliteLuck: z.number().min(0),
    bossLuck: z.number().min(0),
    pityPerDrop: z.number().min(0),
    normalDropChance: z.number().min(0).max(1),
    extraDropChance: z.number().min(0).max(1),
    eliteDrops: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    bossDrops: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    bossMinRarity: RaritySchema,
    rarityBaseMult: perRarity(z.number().positive()),
    affixCount: perRarity(z.number().int().min(0)),
    minRoll: perRarity(z.number().min(0).max(1)),
    scrapPerKill: z.number().min(0),
    scrapLevelScale: z.number().min(0),
    salvage: perRarity(z.number().min(0)),
    bagSize: z.number().int().positive(),
  }),
  forge: z.object({
    upgradeStep: z.number().min(0),
    maxUpgrade: z.number().int().min(0),
    upgradeBaseCost: z.number().positive(),
    upgradeCostExp: z.number().positive(),
    rarityCostMult: perRarity(z.number().positive()),
    reforgeBaseCost: z.number().positive(),
    reforgeGrowth: z.number().positive(),
    fuseCost: perRarity(z.number().min(0)),
  }),
});

export const BalanceConfigSchema = z.object({
  baseHP: z.number().positive(),
  maxDuelSeconds: z.number().positive(),
  baseCritMultiplier: z.number().positive(),
  minAttackSpeed: z.number().positive(),
  fluxPerRound: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
  quickMatchFlux: z.number().int().positive(),
  fluxCosts: FluxCostsSchema,
  draftPoolPerRound: z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]),
  draftPicksPerPlayer: z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]),
  draftPoolSizeQuick: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }),
  tierDistribution: z.record(z.coerce.number(), z.number()),
  draftTimerSeconds: z.number().positive(),
  forgeTimerSeconds: z.object({ round1: z.number().positive(), subsequent: z.number().positive() }),
  archetypeMinOrbs: z.number().int().positive(),
  baseStatScaling: z.record(
    z.string(),
    z.object({
      weapon: z.record(z.string(), z.number()),
      armor: z.record(z.string(), z.number()),
    }),
  ),
  statCaps: z.record(
    z.string(),
    z.object({ min: z.number(), max: z.number() }),
  ),
  gem: GemBalanceConfigSchema,
  transplant: TransplantBalanceSchema,
  delve: DelveBalanceSchema.optional(),
});
