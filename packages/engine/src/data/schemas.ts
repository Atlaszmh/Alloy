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
});
