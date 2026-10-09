import { z } from 'zod';
import type { ReactionId } from '../types/arpg.js';
import { CHAIN_SKILLS, MAX_CHAIN, type MoveKind } from '../types/ability.js';
import { RARITY_ORDER } from '../types/gear.js';
import { MAX_SOCKETS, RUNE_FAMILIES, RUNE_TIERS } from '../types/rune.js';
import { AFFIX_FAMILIES, FLUX_GRADES, METAL_IDS } from '../types/crafting.js';
import { BOON_FAMILIES } from '../types/boon.js';
import {
  OBJECTIVE_RULES,
  OBJECTIVE_TYPES,
  REWARD_KINDS,
  type ObjectiveType,
  type Reward,
} from '../types/quests.js';

// --- Delve (loot-crawler ARPG) Schemas ---

export const RaritySchema = z.enum(['common', 'uncommon', 'magic', 'rare', 'epic', 'legendary']);
const GearSlotSchema = z.enum(['weapon', 'helm', 'chest', 'gloves', 'boots', 'amulet', 'ring']);
export const ManaTypeSchema = z.enum(['fire', 'frost', 'storm', 'earth', 'shadow', 'nature']);
export const HeroStatKeySchema = z.enum([
  'damage',
  'damagePct',
  'attackSpeedPct',
  'critChance',
  'critDamage',
  'maxHp',
  'hpPct',
  'armor',
  'dodge',
  'lifesteal',
  'healOnKill',
  'thorns',
  'magicFind',
  'scrapFind',
  'moveSpeed',
  'cooldownReduction',
  'manaRegen',
  'firePower',
  'frostPower',
  'stormPower',
  'earthPower',
  'shadowPower',
  'naturePower',
  'fireAttune',
  'frostAttune',
  'stormAttune',
  'earthAttune',
  'shadowAttune',
  'natureAttune',
]);
export const MonsterTraitSchema = z.enum([
  'armored',
  'swift',
  'brute',
  'regenerating',
  'vampiric',
  'spiked',
]);
const StatScalingSchema = z.enum(['flat', 'fixed']);
const StatusIdSchema = z.enum([
  'burn',
  'chill',
  'freeze',
  'shock',
  'hex',
  'stagger',
  'blind',
  'brand',
  'poison',
  'root',
]);

/** Every reaction id: arpg.json's reactions and the save's `reactionsSeen` both check against it. */
export const ReactionIdSchema = z.enum([
  'melt',
  'shatter',
  'overload',
  'superconduct',
  'soulfire',
  'combust',
  'blight',
  'obsidian',
  'lightning_rod',
  'sunder',
  'seedling',
  'siphon',
  'crystallize',
  'blackout',
  'galvanize',
]);
// The ReactionId union and this list must name the same ids: this stops compiling if they drift.
type SameIds<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
true satisfies SameIds<ReactionId, z.infer<typeof ReactionIdSchema>>;

export const MoveKindSchema = z.enum(['light', 'medium', 'heavy', 'hold']);
true satisfies SameIds<MoveKind, z.infer<typeof MoveKindSchema>>;

function perKind<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ light: schema, medium: schema, heavy: schema, hold: schema });
}

/** A skill's slots on a weapon rarity: `[start, ceiling]`, the ceiling at least the start (the constructs spec §3.2). */
const SlotRangeSchema = z
  .tuple([z.number().int().min(0).max(MAX_CHAIN), z.number().int().min(0).max(MAX_CHAIN)])
  .refine(([start, ceiling]) => ceiling >= start, 'a ceiling is at least its start');

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

function perMana<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    fire: schema,
    frost: schema,
    storm: schema,
    earth: schema,
    shadow: schema,
    nature: schema,
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
  ai: z.enum(['melee', 'ranged', 'charger']).optional(),
  speed: z.number().positive().optional(),
  size: z.number().positive().optional(),
});

const ComboStepSchema = z.object({
  time: z.number().positive(),
  startup: z.number().gt(0).lt(1),
  move: z.number(),
  side: z.number().min(0).optional(),
  hop: z.number().min(0).optional(),
  power: z.number().positive(),
  heft: z.number().min(0).max(1),
  arc: z.number().positive().max(360).optional(),
  reach: z.number().min(0).optional(),
  knockback: z.number().min(0).optional(),
  stagger: z.boolean().optional(),
  size: z.number().positive().optional(),
  explode: z.number().positive().optional(),
  speed: z.number().positive().optional(),
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
        attack: z
          .object({
            kind: z.enum(['melee', 'bolt']),
            range: z.number().positive(),
            arc: z.number().positive().max(360).optional(),
            speed: z.number().positive().optional(),
            pierce: z.boolean().optional(),
          })
          .optional(),
        feel: perKind(ComboStepSchema).optional(),
        defaultChain: z.array(MoveKindSchema).min(1).max(MAX_CHAIN).optional(),
        tempo: z.number().positive().optional(),
        sway: z.enum(['alternate', 'orbit']).optional(),
        // Weapons only (every weapon has both): its class and its cast style (the constructs spec §2.1, §4.1).
        class: z.enum(['melee', 'ranged']).optional(),
        style: z
          .object({
            name: z.string().min(1),
            // The trait as the player reads it ("Shots pierce one foe"): the item header's line.
            text: z.string().min(1),
            numbers: z
              .object({
                windup: z.number().positive(),
                cooldown: z.number().positive(),
                power: z.number().positive(),
                range: z.number().positive(),
                radius: z.number().positive(),
                speed: z.number().positive(),
                duration: z.number().positive(),
              })
              .strict(),
            motion: z.enum(['none', 'dart', 'step', 'wade', 'plant', 'sway', 'orbit', 'back']),
            // `KnobsSchema` is declared below: lazy, so the file keeps its order.
            trait: z.lazy(() => KnobsSchema),
            look: z.enum(['blade', 'crescent', 'hatchet', 'stone', 'orb', 'spark', 'arrow']),
          })
          .strict()
          .optional(),
        weight: z.number().positive(),
        implicits: z.array(
          z.object({
            stat: HeroStatKeySchema,
            base: z.number().positive(),
            scaling: StatScalingSchema,
          }),
        ),
      }),
    )
    .min(1)
    .superRefine((bases, ctx) =>
      bases.forEach((b, i) => {
        if ((b.slot === 'weapon') !== (b.tempo !== undefined))
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [i, 'tempo'],
            message: `${b.id}: ${b.slot === 'weapon' ? 'a weapon base needs a tempo' : 'only a weapon base has a tempo'}`,
          });
        for (const key of ['class', 'style'] as const)
          if ((b.slot === 'weapon') !== (b[key] !== undefined))
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i, key],
              message: `${b.id}: ${b.slot === 'weapon' ? `a weapon base needs a ${key}` : `only a weapon base has a ${key}`}`,
            });
      }),
    ),
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
        mana: ManaTypeSchema,
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
          monsterHp: z.number().optional(),
          monsterDmg: z.number().optional(),
          eliteChance: z.number().min(0).max(1).optional(),
          bountyMult: z.number().positive().optional(),
          healFull: z.boolean().optional(),
          potions: z.number().int().optional(),
          skip: z.number().int().min(0).optional(),
          packs: z.number().positive().optional(),
          materials: z.number().positive().optional(),
          runes: z.number().positive().optional(),
          gear: z.number().positive().optional(),
          flux: z.number().positive().optional(),
          essence: z.number().positive().optional(),
          shardTier: z.number().min(0).max(1).optional(),
          find: z.number().optional(),
          boons: z.number().min(0).max(1).optional(),
        }),
      }),
    )
    .min(3),
  names: z.object({
    prefixes: z.array(z.string()).min(1),
    suffixes: perSlot(z.array(z.string()).min(1)),
  }),
});

// --- Crafting (crafting.json; see the crafting spec) ---

export const MetalIdSchema = z.enum(METAL_IDS);
export const FluxGradeSchema = z.enum(FLUX_GRADES);
const AffixFamilySchema = z.enum(AFFIX_FAMILIES);

/** Shard tiers, numbered from 1 in order, each band within 0–1. */
const ShardTiersSchema = z
  .array(
    z
      .object({ tier: z.number().int().min(1), min: z.number().min(0), max: z.number().max(1) })
      .refine((t) => t.min <= t.max, 'a tier band runs low to high'),
  )
  .min(1)
  .refine((ts) => ts.every((t, i) => t.tier === i + 1), 'tiers run 1, 2, 3… in order');

export const CraftingDataSchema = z.object({
  // Every metal once, lowest first, their bands partitioning the item levels from 1 up.
  metals: z
    .array(
      z.object({
        id: MetalIdSchema,
        name: z.string(),
        band: z.tuple([z.number().int().min(1), z.number().int().min(1).nullable()]),
      }),
    )
    .refine(
      (ms) => ms.map((m) => m.id).join() === METAL_IDS.join(),
      'every metal once, lowest first',
    )
    .refine(
      (ms) =>
        ms.every(({ band: [lo, hi] }, i) => {
          const last = i === ms.length - 1;
          const from = i === 0 ? 1 : (ms[i - 1].band[1] ?? NaN) + 1;
          return lo === from && (last ? hi === null : hi !== null && hi >= lo);
        }),
      'metal bands partition the item levels from 1 up: contiguous, no overlap, the last open-ended',
    ),
  flux: z
    .array(z.object({ grade: FluxGradeSchema }))
    .refine(
      (fs) => fs.map((f) => f.grade).join() === FLUX_GRADES.join(),
      'every grade once, lowest first',
    ),
  shardTiers: ShardTiersSchema,
  affixShardTiers: z.record(HeroStatKeySchema, ShardTiersSchema),
  families: z
    .record(HeroStatKeySchema, AffixFamilySchema)
    .refine((f) => HeroStatKeySchema.options.every((k) => k in f), 'every affix stat has a family'),
  startingPatterns: z.array(z.string()).min(1),
  startingMaterials: z.object({
    metals: z.record(MetalIdSchema, z.number().int().min(0)),
    flux: z.record(FluxGradeSchema, z.number().int().min(0)),
    scrap: z.number().int().min(0),
  }),
});

// --- Quests (quests.json, balance.json → delve.quests; see the quests spec) ---

const ObjectiveTypeSchema = z.enum(OBJECTIVE_TYPES);
const ObjectiveScopeSchema = z.enum(['total', 'dive']);

function perTier<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ easy: schema, normal: schema, hard: schema });
}

/** Only the filter fields its type takes, and no `dive` scope on an Anvil-only type. */
function objectiveProblem(o: { type: ObjectiveType; filter?: object; scope: string }) {
  const rule = OBJECTIVE_RULES[o.type];
  const bad = Object.keys(o.filter ?? {}).filter(
    (k) => !(rule.filters as readonly string[]).includes(k),
  );
  if (bad.length > 0) return `a ${o.type} objective takes no ${bad.join(', ')} filter`;
  if (o.scope === 'dive' && rule.anvilOnly)
    return `a ${o.type} objective can't be scoped to a dive`;
  return null;
}

export const ObjectiveSchema = z
  .object({
    id: z.string().min(1),
    type: ObjectiveTypeSchema,
    filter: z
      .object({
        kind: z.enum(['normal', 'elite']),
        biome: z.string(),
        element: ManaTypeSchema,
        noPotion: z.boolean(),
        noDamage: z.boolean(),
        minDepth: z.number().int().min(1),
        minRoomsCleared: z.number().int().min(1),
        reaction: ReactionIdSchema,
        pair: z.literal(true),
        minRarity: RaritySchema,
        legendary: z.boolean(),
      })
      .partial()
      .strict()
      .refine((f) => !(f.reaction && f.pair), 'a reaction or the pair, not both')
      .optional(),
    count: z.number().int().min(1),
    scope: ObjectiveScopeSchema,
    text: z.string().min(1),
  })
  .superRefine((o, ctx) => {
    const problem = objectiveProblem(o);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

/** What a reward of each kind must name, and nothing else (see `Reward`). */
function rewardProblem(r: Reward): string | null {
  const named = (['id', 'grade', 'family', 'tier', 'fallback'] as const).filter(
    (k) => r[k] !== undefined,
  );
  const names = (...keys: string[]) => named.join() === keys.join();
  switch (r.kind) {
    case 'scrap':
    case 'dust':
    case 'links':
      return names() ? null : `a ${r.kind} reward names only its count`;
    case 'metal':
      return names('id') && (r.id === 'depth' || (METAL_IDS as readonly string[]).includes(r.id!))
        ? null
        : "a metal reward's id is a metal or 'depth'";
    case 'flux':
      return names('grade') ? null : 'a flux reward names its grade';
    case 'shard':
      return names('family', 'tier') ? null : 'a shard reward names its family and tier';
    case 'essence':
      return names('id') ? null : "an essence reward's id is a legendary or 'fit'";
    case 'pattern':
      return names(...(r.id === 'unknown' ? ['id', 'fallback'] : ['id']))
        ? null
        : "a pattern reward's id is a base, or 'unknown' with a fallback";
  }
}

export const RewardSchema: z.ZodType<Reward> = z.lazy(() =>
  z
    .object({
      kind: z.enum(REWARD_KINDS),
      id: z.string().optional(),
      grade: FluxGradeSchema.optional(),
      family: AffixFamilySchema.optional(),
      tier: z.number().int().min(1).max(5).optional(),
      count: z.number().int().min(1),
      fallback: RewardSchema.optional(),
    })
    .strict()
    .superRefine((r, ctx) => {
      const problem = rewardProblem(r);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
    }),
);

/** Ids differ. */
const distinctIds = (xs: { id: string }[]) => new Set(xs.map((x) => x.id)).size === xs.length;

const QuestDefSchema = z.object({
  // `contract:<n>` ids are the board's.
  id: z
    .string()
    .min(1)
    .refine((id) => !id.startsWith('contract:'), "a quest's id never starts with contract:"),
  kind: z.enum(['main', 'side']),
  name: z.string().min(1),
  chapter: z.string().optional(),
  line: z.string().min(1),
  unlock: z
    .object({
      after: z.string(),
      bestDepth: z.number().int().min(1),
      reactionsSeen: z.number().int().min(1),
      patterns: z.number().int().min(1),
      pair: z.literal(true),
    })
    .partial()
    .strict()
    .refine((u) => Object.keys(u).length > 0, 'an unlock names a condition')
    .optional(),
  objectives: z.array(ObjectiveSchema).min(1).max(3).refine(distinctIds, 'objective ids differ'),
  rewards: z.array(RewardSchema).min(1),
});

const ContractTemplateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    line: z.string().min(1),
    type: ObjectiveTypeSchema,
    filter: z
      .object({
        kind: z.enum(['normal', 'elite']),
        biome: z.literal('reached'),
        element: z.literal('reached'),
        reaction: z.literal('known'),
        minDepth: z.enum(['window', 'flag']),
        minRarity: z.literal('owned'),
        noPotion: z.literal(true),
        noDamage: z.literal(true),
        minRoomsCleared: z.number().int().min(1),
      })
      .partial()
      .strict()
      .optional(),
    count: perTier(
      z
        .tuple([z.number().int().min(1), z.number().int().min(1)])
        .refine(([lo, hi]) => lo <= hi, 'a count runs low to high'),
    ),
    scope: ObjectiveScopeSchema,
    text: z.string().min(1),
    rewards: perTier(z.array(RewardSchema).min(1)),
  })
  .superRefine((t, ctx) => {
    const problem = objectiveProblem(t);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

/** `quests.json`: shapes and ids (the registry checks its references into the other files: `questsDataProblems`). */
export const QuestsDataSchema = z.object({
  giver: z.object({ name: z.string().min(1), sprite: z.string().min(1) }),
  rarityNames: perRarity(z.string().min(1)),
  quests: z.array(QuestDefSchema).refine(distinctIds, 'quest ids differ'),
  contractTemplates: z.array(ContractTemplateSchema).refine(distinctIds, 'template ids differ'),
});

/** `balance.json → delve.quests`. */
export const QuestsBalanceSchema = z.object({
  maxTracked: z.number().int().min(1),
  contracts: z.object({
    slots: z.number().int().min(0),
    tierWeights: perTier(z.number().min(0)).refine(
      (w) => w.easy + w.normal + w.hard > 0,
      'some tier weighs more than 0',
    ),
    depthScale: z.number().min(0),
    depthWindow: z
      .tuple([z.number().int(), z.number().int()])
      .refine(([lo, hi]) => lo <= hi, 'the window runs low to high'),
    flagDepthBelow: z.number().int().min(0),
    rerollScrap: z.number().min(0),
    essenceChance: z.number().min(0).max(1),
    countScale: z.record(ObjectiveTypeSchema, z.number().min(0)),
  }),
});

// --- Floor maps (see the floor maps spec) ---

/** A room template: its floor's size in cells. */
const RoomTemplateSchema = z
  .object({
    id: z.string().min(1),
    w: z.number().int().min(4),
    h: z.number().int().min(4),
  })
  .strict();

/** `layouts.json` (the generator checks the sizes against `delve.layout`'s coarse grid). */
export const LayoutsDataSchema = z.object({
  rooms: z
    .record(z.string(), z.array(RoomTemplateSchema).min(1))
    .refine((r) => 'default' in r, 'a default room list'),
  boss: RoomTemplateSchema,
  arena: z
    .array(RoomTemplateSchema)
    .min(1)
    .refine((ts) => ts.every((t) => t.w >= t.h), 'an arena is drawn wide'),
  props: z.object({
    chest: z.number().positive(),
    shrine: z.number().positive(),
    alcove_anvil: z.number().positive(),
    exit_gate: z.number().positive(),
  }),
});

/** A room kind's furnishing: pieces per 100 floor cells, hazards and crumbling cover allowed. */
const FurnishBudgetSchema = z
  .object({ pieces: z.number().min(0), hazards: z.boolean(), crumbling: z.boolean() })
  .strict();

/** `balance.json → delve.layout`. */
export const LayoutBalanceSchema = z
  .object({
    coarseCell: z.number().int().positive(),
    coarseCols: z.number().int().positive(),
    coarseRows: z.number().int().positive(),
    rooms: z
      .object({
        base: z.number().int().min(2),
        perDepth: z.number().min(0),
        max: z.number().int().min(2),
      })
      .refine((r) => r.base <= r.max, 'base ≤ max'),
    hallWidth: z.number().int().positive(),
    minWall: z.number().int().positive(),
    loops: z
      .tuple([z.number().int().min(0), z.number().int().min(0)])
      .refine(([lo, hi]) => lo <= hi, 'loops run low to high'),
    kindWeights: z
      .array(
        z.object({
          fromDepth: z.number().int().min(1),
          weights: z.object({
            combat: z.number().min(0),
            den: z.number().min(0),
            vault: z.number().min(0),
            sanctum: z.number().min(0),
            alcove: z.number().min(0),
          }),
        }),
      )
      .min(1)
      .refine(
        (bs) =>
          bs[0].fromDepth === 1 && bs.every((b, i) => i === 0 || b.fromDepth > bs[i - 1].fromDepth),
        'bands from depth 1, rising',
      ),
    alcoveMax: z.number().int().min(0),
    deadEndWeight: z.number().min(0),
    minCombatRooms: z.number().int().min(1),
    vaultGuardChance: z.number().min(0).max(1),
    arenaPacks: z.number().int().min(0),
    minPackDistance: z.number().positive(),
    packsPerRoom: z.number().int().positive(),
    generatedDives: z.boolean(),
    furnish: z
      .object({
        start: FurnishBudgetSchema,
        combat: FurnishBudgetSchema,
        arena: FurnishBudgetSchema,
        den: FurnishBudgetSchema,
        vault: FurnishBudgetSchema,
        sanctum: FurnishBudgetSchema,
        alcove: FurnishBudgetSchema,
        exit: FurnishBudgetSchema,
        boss: FurnishBudgetSchema,
      })
      .strict()
      .refine(
        (f) => !f.start.hazards && !f.boss.hazards && !f.boss.crumbling,
        'no hazards in the start or boss rooms, no crumbling cover in a boss room',
      ),
  })
  .refine((l) => l.rooms.max <= l.coarseCols * l.coarseRows, 'the rooms fit the coarse grid')
  .refine(
    (l) => l.coarseCell * Math.max(l.coarseCols, l.coarseRows) <= 96,
    'maps are at most 96 × 96 (see the room objects spec)',
  );

/** `balance.json → delve.ai.pack` (see the room objects spec's "Smarter packs"). */
export const PackAiBalanceSchema = z
  .object({
    directorEvery: z.number().positive(),
    flowRadius: z.number().int().positive(),
    stuckTime: z.number().positive(),
    ring: z.object({ on: z.boolean() }).strict(),
    flank: z
      .object({
        on: z.boolean(),
        kiteTime: z.number().min(0),
        leadTime: z.number().min(0),
        flankShare: z
          .object({
            fromDepth: z.number().int().min(1),
            base: z.number().min(0).max(1),
            perDepth: z.number().min(0),
            max: z.number().min(0).max(1),
          })
          .strict(),
      })
      .strict(),
    cover: z
      .object({
        on: z.boolean(),
        coverSearch: z.number().int().positive(),
        coverFlee: z.number().min(0),
      })
      .strict(),
    charge: z
      .object({ on: z.boolean(), chargeStun: z.number().min(0), chargeSlam: z.number().min(0) })
      .strict(),
    ambush: z
      .object({
        on: z.boolean(),
        ambushChance: z.number().min(0).max(1),
        ambushWake: z.number().positive(),
      })
      .strict(),
  })
  .strict();

/** `balance.json → delve.terrain` (see the room objects spec's "Objects in a fight"). */
export const TerrainBalanceSchema = z
  .object({
    slowMult: z.number().positive().max(1),
    bossSlowMult: z.number().positive().max(1),
    foliageSight: z.number().positive(),
    foliageDepth: z.number().min(0),
    searchTime: z.number().min(0),
    leashMargin: z.number().min(0),
    structureLife: z.number().positive(),
    slamDamage: z.number().min(0),
    slamStagger: z.number().min(0),
    propLife: z.number().positive(),
    propDrops: z
      .object({ chance: z.number().min(0).max(1), material: z.number().min(0).max(1) })
      .strict(),
    hazardDamage: z.number().min(0),
    hazardFoeMult: z.number().min(0),
    fuse: z.number().min(0),
    recharge: z.number().min(0),
    hazardOffElement: z.number().min(0).max(1),
  })
  .strict();

/** `balance.json → delve.ai`. */
export const AiBalanceSchema = z.object({
  flowEvery: z.number().positive(),
  flowRadius: z.number().int().positive(),
  directRange: z.number().min(0),
  leashSeconds: z.number().min(0),
  sealGrace: z.number().min(0),
  roomVacuum: z.boolean(),
  sightRadius: z.number().positive(),
  fogEvery: z.number().positive(),
  exitHintSeconds: z.number().min(0),
  interactRadius: z.number().positive(),
  shrineChannel: z.number().min(0),
  pack: PackAiBalanceSchema,
});

/** A count and a power (`split`, `extraShots`). */
const CountPowerSchema = z
  .object({ count: z.number().int().positive(), power: z.number().positive() })
  .strict();

/** Partial ability knobs (`KnobsData`); `.strict()` rejects misspelled knob names. */
export const KnobsSchema = z
  .object({
    power: z.number().positive(),
    area: z.number().positive(),
    applies: z.array(StatusIdSchema),
    chain: z.number().int().min(0),
    // True: every foe; a count: that many.
    pierce: z.union([z.boolean(), z.number().int().min(1)]),
    knockback: z.number().min(0),
    lifesteal: z.number().min(0),
    zone: z.object({
      seconds: z.number().positive(),
      tickPower: z.number().positive(),
      perCast: z.number().int().positive().optional(),
    }),
    pull: z.boolean(),
    execute: z.number().min(0).max(1),
    scatter: z.number().min(0).max(1),
    spread: z.boolean(),
    split: CountPowerSchema,
    extraShots: CountPowerSchema,
    echo: z.number().min(0),
    quick: z
      .object({
        beat: z.number().positive(),
        cooldown: z.number().positive(),
        windup: z.number().positive(),
      })
      .partial()
      .strict(),
    stacksBonus: z.number().int().min(0),
    catalyst: z.number().min(0),
    manaOnHit: z.number().min(0),
    guardOnLand: z.number().min(0),
    stackTime: z.number().min(0),
    // The constructs spec: Detonate's blast power (§2.3), and the cast styles' traits (§4.2).
    detonate: z.number().min(0),
    critBonus: z.number().min(0).max(1),
    cleave: z.number().min(0),
    homing: z.number().min(0),
    stepBonus: z.number().min(0),
  })
  .partial()
  .strict();

/**
 * One rune of `runes.json` (see the runes spec): its five tiers' knobs, the
 * trade-off included. A test holds its fit ids to the data.
 */
const RuneDefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    icon: z.string(),
    family: z.enum(RUNE_FAMILIES as [string, ...string[]]),
    fits: z
      .object({
        forms: z.array(z.string()),
        weapons: z.array(z.string()),
        kinds: z.array(MoveKindSchema).min(1).optional(),
      })
      .strict(),
    tiers: z.array(KnobsSchema).length(RUNE_TIERS),
    // Its load by tier (see the rune costs spec): required, so a new rune says what it costs.
    load: z
      .array(z.number().min(0))
      .length(RUNE_TIERS)
      .refine((l) => l.every((x, i) => i === 0 || l[i - 1] <= x), 'load must not fall with tier'),
    effect: z.string(),
    tradeoff: z.string().nullable(),
  })
  .strict();

/** `runes.json`: every rune once. */
export const RunesSchema = z
  .array(RuneDefSchema)
  .refine((rs) => new Set(rs.map((r) => r.id)).size === rs.length, 'rune ids must differ');

// --- Boons (see the boons spec) ---

const fraction = z.number().gt(0).max(1);

/**
 * What a boon or shrine does (`BoonEffect`): at least one field, and nothing else. Units: a bonus
 * is the added fraction (`damage: 0.25` is +25%; `maxLife` may be negative, above −1); a drop
 * multiplier (`flux`, `runes`, `gear`) is the raw factor (1.3); `find` is Find points;
 * `dodgeCharges` and `skip` are counts (`dodgeCharges` may be negative); `tempo` and
 * `dodgeRecharge` are cuts below 1.
 */
export const BoonEffectSchema = z
  .object({
    damage: z.number().positive().optional(),
    manaRegen: z.number().positive().optional(),
    lifeRegen: z.number().positive().optional(),
    maxLife: z.number().gt(-1).optional(),
    tempo: z.number().gt(0).lt(1).optional(),
    lifesteal: z.number().positive().optional(),
    bloodPrice: z.number().positive().optional(),
    attune: z
      .object({ role: z.enum(['primary', 'secondary']), points: z.number().int().positive() })
      .strict()
      .optional(),
    knobs: KnobsSchema.optional(),
    byKind: z
      .object({
        light: z.number().positive(),
        medium: z.number().positive(),
        heavy: z.number().positive(),
        hold: z.number().positive(),
      })
      .partial()
      .strict()
      .optional(),
    firstMove: z.number().positive().optional(),
    stepBonus: z.number().positive().optional(),
    lowLife: z.object({ below: fraction, mult: z.number().positive() }).strict().optional(),
    nearFoes: z
      .object({
        per: z.number().positive(),
        cap: z.number().int().positive(),
        radius: z.number().positive(),
      })
      .strict()
      .optional(),
    dodgeCharges: z.number().int().optional(),
    dodgeWindow: z.number().positive().optional(),
    dodgeRecharge: z.number().gt(0).lt(1).optional(),
    perfectAlways: z.literal(true).optional(),
    freeCast: z
      .object({ seconds: z.number().positive(), damage: z.number().min(0) })
      .strict()
      .optional(),
    defendDuration: z.number().positive().optional(),
    barrierOnFloor: fraction.optional(),
    healOnClear: fraction.optional(),
    lastStand: z
      .object({ below: fraction, reduce: fraction, seconds: z.number().positive() })
      .strict()
      .optional(),
    find: z.number().positive().optional(),
    magnet: z.number().positive().optional(),
    metalUp: fraction.optional(),
    flux: z.number().positive().optional(),
    runes: z.number().positive().optional(),
    gear: z.number().positive().optional(),
    scrap: z.number().positive().optional(),
    deathLoss: fraction.optional(),
    potions: z.literal(true).optional(),
    noPotions: z.literal(true).optional(),
    eliteChance: fraction.optional(),
    skip: z.number().int().min(0).optional(), // 0 once `chooseDoor` spends it (`spendSkip`)
    exitRevealed: z.literal(true).optional(),
    shrinesLastDive: z.literal(true).optional(),
    noSlow: z.literal(true).optional(),
    hazardsFriendly: fraction.optional(),
  })
  .strict()
  .refine((e) => Object.keys(e).length > 0, 'a boon does something');

/** A boon on the hero (`HeroEntity.floorBuffs`, `diveBuffs`, `DiveState.diveBuffs`): its row, its tier, its effect. */
export const BuffSchema = z
  .object({
    boon: z.string().min(1),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    effect: BoonEffectSchema,
  })
  .strict();

const BoonTierSchema = z.object({ text: z.string().min(1), effect: BoonEffectSchema }).strict();

/** One row of `boons.json` (`BoonDef`). */
export const BoonDefSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    family: z.enum(BOON_FAMILIES),
    duration: z.enum(['dive', 'floor']),
    cap: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    minDepth: z.number().int().min(1).optional(),
    shrine: z.number().positive().optional(),
    weight: z
      .object({ common: z.number().min(0), rare: z.number().min(0), epic: z.number().min(0) })
      .strict(),
    tiers: z.tuple([BoonTierSchema, BoonTierSchema, BoonTierSchema]),
  })
  .strict();

/** `boons.json`: the rows, ids distinct; a potion refill lasts the floor (it acts at once). */
export const BoonsDataSchema = z
  .array(BoonDefSchema)
  .min(1)
  .refine(distinctIds, 'boon ids differ')
  .refine(
    (bs) => bs.every((b) => b.duration === 'floor' || b.tiers.every((t) => !t.effect.potions)),
    'a refill lasts the floor',
  );

/** `balance.json → delve.boons`: a stop's cards and its tier weights by depth band, ascending from depth 1. */
export const BoonsBalanceSchema = z
  .object({
    offers: z.number().int().min(1),
    tierWeights: z
      .array(
        z
          .object({
            fromDepth: z.number().int().min(1),
            weights: z.tuple([z.number().min(0), z.number().min(0), z.number().min(0)]),
          })
          .strict(),
      )
      .min(1)
      .refine(
        (bs) =>
          bs[0].fromDepth === 1 && bs.every((b, i) => i === 0 || b.fromDepth > bs[i - 1].fromDepth),
        'the bands ascend from depth 1',
      ),
  })
  .strict();

export const ArpgDataSchema = z.object({
  mana: perMana(z.object({ name: z.string(), icon: z.string(), color: z.string() })),
  weakness: perMana(ManaTypeSchema),
  reactions: z
    .array(
      z.object({
        id: ReactionIdSchema,
        elements: z
          .tuple([ManaTypeSchema, ManaTypeSchema])
          .refine(([a, b]) => a !== b, 'a reaction needs two elements'),
        name: z.string(),
        icon: z.string(),
        text: z.string(),
        cooldown: z.literal(true).optional(),
      }),
    )
    .length(15)
    .refine((rs) => new Set(rs.map((r) => r.id)).size === rs.length, 'reaction ids must differ')
    .refine(
      (rs) => new Set(rs.map((r) => [...r.elements].sort().join('+'))).size === rs.length,
      'each pair of elements needs exactly one reaction',
    ),
  masteries: z
    .array(z.object({ mana: ManaTypeSchema, name: z.string(), text: z.string() }))
    .length(6),
  forms: z
    .array(
      z.object({
        id: z.enum([
          'bolt',
          'volley',
          'lance',
          'burst',
          'strike',
          'whirl',
          'ward',
          'armor',
          'surge',
          'blink',
          'repel',
          'nova',
          'barrage',
          'maelstrom',
          'onslaught',
        ]),
        slot: z.enum(['primary', 'defensive', 'ultimate']),
        // The weapon class that expresses it, or both (the constructs spec §2.1).
        class: z.enum(['melee', 'ranged', 'both']),
        // A shared form's melee version: what differs when a melee weapon casts it (B1 fills the rows).
        melee: z
          .object({
            range: z.number().positive().optional(),
            radius: z.number().positive().optional(),
            motion: z.number().optional(),
            speed: z.number().positive().optional(),
            text: z.string().optional(),
          })
          .strict()
          .optional(),
        name: z.string(),
        icon: z.string(),
        text: z.string(),
        power: z.number().min(0),
        effect: z.number().positive().optional(),
        range: z.number().positive().optional(),
        radius: z.number().positive().optional(),
        speed: z.number().positive().optional(),
        count: z.number().int().positive().optional(),
        duration: z.number().positive().optional(),
        tick: z.number().positive().optional(),
        arc: z.number().positive().max(360).optional(),
        motion: z.number().optional(),
        defaultChain: z.array(MoveKindSchema).min(1).max(MAX_CHAIN),
        countByKind: perKind(z.number().int().positive()).optional(),
      }),
    )
    .length(15),
  elementTraits: perMana(z.object({ knobs: KnobsSchema, text: z.string(), defensive: z.string() })),
  fusions: z
    .array(
      z.object({
        id: z.string(),
        elements: z.tuple([ManaTypeSchema, ManaTypeSchema]),
        name: z.string(),
        icon: z.string(),
        text: z.string(),
        knobs: KnobsSchema,
      }),
    )
    .length(15),
});

/** A drop-table entry: a chance, then a count from lo to hi. */
const DropEntrySchema = z.object({
  chance: z.number().min(0).max(1),
  count: z
    .tuple([z.number().int().min(0), z.number().int().min(0)])
    .refine(([lo, hi]) => lo <= hi, 'a count runs low to high'),
});

function perFoe<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ normal: schema, elite: schema, boss: schema });
}

/** Weights by affix family (a family left out weighs 1). */
const FamilyWeightsSchema = z.record(z.enum(AFFIX_FAMILIES), z.number().min(0));

/** Depths a tier or grade starts at: the first at 1, rising. */
const StartDepthsSchema = z
  .array(z.number().int().min(1))
  .min(1)
  .refine((ds) => ds[0] === 1 && ds.every((d, i) => i === 0 || d > ds[i - 1]), 'from 1, rising');

/** `balance.json → delve.crafting` (see the crafting spec). */
export const CraftingBalanceSchema = z.object({
  forgeScrap: perRarity(z.number().min(0)),
  offPairDust: z.number().int().min(0),
  weaponExtras: perRarity(z.object({ slots: z.number().int().min(0) })),
  honeScrap: z.number().min(0),
  honeGrowth: z.number().min(1),
  imprintScrap: perRarity(z.number().min(0)),
  refine: z.object({
    metal: z.object({ count: z.number().int().min(2), scrap: z.number().min(0) }),
    flux: z.object({ count: z.number().int().min(2), scrap: z.number().min(0) }),
    shard: z.object({
      count: z.number().int().min(2),
      // By the tier refined: I→II, II→III, III→IV, IV→V.
      scrap: z.array(z.number().min(0)).length(4),
    }),
  }),
  attuneRoll: z.object({ perPoint: z.number().min(0), cap: z.number().min(0).max(1) }),
  salvageShardTier: z
    .array(z.number().min(0).max(1))
    .length(4)
    .refine((ts) => ts.every((t, i) => i === 0 || t > ts[i - 1]), 'thresholds rise'),
  salvageExtraShard: z.number().min(0).max(1),
  shardBench: z.object({ scrap: z.number().min(0), dust: z.number().min(0) }),
  deathLoss: z.number().min(0).max(1),
});

/** `balance.json → delve.drops` (see the crafting spec). */
export const DropsBalanceSchema = z.object({
  normal: z.object({
    bars: DropEntrySchema,
    dust: DropEntrySchema,
    shards: DropEntrySchema,
    links: DropEntrySchema,
  }),
  elite: z.object({
    bars: DropEntrySchema,
    dust: DropEntrySchema,
    shards: DropEntrySchema,
    links: DropEntrySchema,
    flux: DropEntrySchema,
    gearChance: z.number().min(0).max(1),
    patternChance: z.number().min(0).max(1),
  }),
  boss: z.object({
    gear: z.number().int().min(0),
    flux: DropEntrySchema,
    shards: DropEntrySchema,
    essenceChance: z.number().min(0).max(1),
    patternChance: z.number().min(0).max(1),
  }),
  vault: z.object({
    flux: DropEntrySchema,
    shards: DropEntrySchema,
    shardTierUp: z.number().int().min(0),
    essenceChance: z.number().min(0).max(1),
  }),
  den: z.object({ gearBonus: z.number().min(0).max(1) }),
  scrapByKind: perFoe(z.number().min(0)),
  scrapPickups: perFoe(z.number().int().min(1)),
  metalUpChance: z.number().min(0).max(1),
  essenceMinDepth: z.number().int().min(1),
  find: z.object({ perPoint: z.number().min(0), cap: z.number().min(0).max(1) }),
  shardTierDepths: StartDepthsSchema.refine((ds) => ds.length === 5, 'one per tier, I to V'),
  fluxGradeDepths: StartDepthsSchema.refine(
    (ds) => ds.length === FLUX_GRADES.length,
    'one per grade, uncommon to epic',
  ),
  tierWeights: z.array(z.number().positive()).length(5),
  biomeShardWeights: z.record(z.string(), FamilyWeightsSchema),
  biomeElementWeight: z.number().min(0),
  doors: z.record(z.string(), FamilyWeightsSchema),
  magnetSpeed: z.number().positive(),
  vacuumSpeed: z.number().positive(),
  pickupDelay: z.number().min(0),
});

const AbilitySlotBalanceSchema = z.object({
  cost: z.number().min(0),
  cooldown: z.number().min(0),
  castTime: z.number().min(0),
});

const DelveBalanceSchema = z.object({
  hero: z.object({
    baseHp: z.number().positive(),
    baseCritChance: z.number().min(0),
    baseCritMultiplier: z.number().positive(),
    unarmedDamage: z.number().positive(),
    unarmedInterval: z.number().positive(),
    basicComboGrace: z.number().min(0),
    feel: perKind(ComboStepSchema),
    defaultChain: z.array(MoveKindSchema).min(1).max(MAX_CHAIN),
    tempo: z.number().positive(),
    minAttackInterval: z.number().positive(),
    critCap: z.number().positive(),
    dodgeCap: z.number().positive(),
    armorK: z.number().positive(),
    armorCap: z.number().positive(),
    moveSpeed: z.number().positive(),
    radius: z.number().positive(),
    pickupRadius: z.number().positive(),
    magnetRadius: z.number().positive(),
    cdrCap: z.number().min(0).max(90),
  }),
  growth: z.object({
    item: z.number().positive(),
    monsterHp: z.number().positive(),
    monsterDmg: z.number().positive(),
  }),
  monster: z.object({
    baseHp: z.number().positive(),
    baseDmg: z.number().positive(),
    earlyRamp: z.array(z.number().positive()),
    hpRamp: z.array(z.number().positive()),
    enrageSeconds: z.number().positive(),
    enrageInterval: z.number().positive(),
    speed: z.number().positive(),
    radius: z.number().positive(),
    windup: z.number().positive(),
    meleeRange: z.number().positive(),
    aggroRadius: z.number().positive(),
    resist: z.number().min(0).max(1),
    resistFromDepth: z.number().int().min(1),
    weakness: z.number().min(0),
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
    packsBase: z.number().positive(),
    packsPerDepth: z.number().min(0),
    packsMax: z.number().int().positive(),
    packSize: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    healthOrbChance: z.number().min(0).max(1),
    healthOrbHeal: z.number().min(0).max(1),
  }),
  loot: z.object({
    rarityWeights: perRarity(z.number().min(0)),
    luckExponent: z.number().min(0),
    luckPerDepth: z.number().min(0),
    maxDepthLuck: z.number().min(0),
    eliteLuck: z.number().min(0),
    bossLuck: z.number().min(0),
    bossMinRarity: RaritySchema,
    rarityBaseMult: perRarity(z.number().positive()),
    affixCount: perRarity(z.number().int().min(0)),
    minRoll: perRarity(z.number().min(0).max(1)),
    scrapPerKill: z.number().min(0),
    scrapLevelScale: z.number().min(0),
    salvage: perRarity(z.number().min(0)),
    bagSize: z.number().int().positive(),
    biomeManaBias: z.number().min(0).max(1),
  }),
  forge: z.object({
    upgradeStep: z.number().min(0),
    maxUpgrade: z.number().int().min(0),
    upgradeBaseCost: z.number().positive(),
    upgradeCostExp: z.number().positive(),
    rarityCostMult: perRarity(z.number().positive()),
    reforgeBaseCost: z.number().positive(),
    reforgeGrowth: z.number().positive(),
  }),
  mana: z.object({
    attuneByRarity: perRarity(z.number().int().min(0)),
    masteryThreshold: z.number().int().positive(),
    powerPerAttune: z.number().min(0),
    basePool: z.number().positive(),
    poolPerAttune: z.number().min(0),
    baseRegen: z.number().min(0),
    regenPerAttune: z.number().min(0),
    basicAttackGain: z.number().min(0),
    moteAmount: z.number().min(0),
    eliteMote: z.number().min(0),
    bossMote: z.number().min(0),
  }),
  pair: z.object({
    overtakeMargin: z.number().min(1),
    basicPowerPerAttune: z.number().min(0),
    dropBias: z.number().min(0).max(1),
    primaryShare: z.number().min(0).max(1),
    salvageDust: perRarity(z.number().int().min(0)),
    reattuneDust: perRarity(z.number().int().min(0)),
    realignDust: z.number().int().min(0),
    realignScrap: z.number().int().min(0),
  }),
  status: z.object({
    burnDps: z.number().min(0),
    freezeDuration: z.number().positive(),
    staggerDuration: z.number().positive(),
    blindMiss: z.number().min(0).max(1),
    blindDuration: z.number().positive(),
    poisonDps: z.number().min(0),
    rootDuration: z.number().positive(),
    rootBossMult: z.number().min(0).max(1),
    staggerImmunity: z.number().min(0),
    freezeImmunity: z.number().min(0),
    rootImmunity: z.number().min(0),
  }),
  stacks: z.object({
    cap: z.number().int().positive(),
    duration: perMana(z.number().positive()),
    byWeight: z.array(z.number().int().min(0)).length(5),
    basicByKind: perKind(z.number().int().min(0)),
    tick: z.number().int().min(0),
    curve: z.array(z.number().min(0)).min(2),
    freezeAt: z.number().int().positive(),
    firePerStack: z.number().min(0),
    frostSlowPerStack: z.number().min(0),
    frostSlowCap: z.number().min(0).max(1),
    shockPerStack: z.number().min(0),
    hexPerStack: z.number().min(0),
    poisonPerStack: z.number().min(0),
    reactionLockout: z.number().min(0),
  }),
  reactions: z.object({
    meltMult: z.number().positive(),
    shatterMult: z.number().positive(),
    overloadMult: z.number().positive(),
    overloadRadius: z.number().positive(),
    superconductFreeze: z.number().positive(),
    soulfireHeal: z.number().min(0).max(1),
    combustMult: z.number().positive(),
    combustRadius: z.number().positive(),
    blightRadius: z.number().positive(),
    obsidianSoak: z.number().min(0),
    obsidianCap: z.number().min(0).max(1),
    obsidianDuration: z.number().positive(),
    lightningRodDuration: z.number().positive(),
    lightningRodMove: z.number().min(0),
    sunderDuration: z.number().positive(),
    sunderBonus: z.number().min(0),
    seedlingHeal: z.number().min(0).max(1),
    siphonMana: z.number().min(0).max(1),
    crystallizeMult: z.number().positive(),
    crystallizeRadius: z.number().positive(),
    blackoutRadius: z.number().positive(),
    galvanizeSeconds: z.number().min(0),
    reactionCooldown: z.number().min(0),
  }),
  abilities: z.object({
    slots: z.object({
      primary: AbilitySlotBalanceSchema,
      defensive: AbilitySlotBalanceSchema,
      ultimate: AbilitySlotBalanceSchema,
    }),
    weight: z.object({
      power: z.number().min(0),
      cost: z.number().min(0),
      cooldown: z.number().min(0),
      size: z.number().min(0),
      speed: z.number().min(0).max(0.4),
      castTime: z.number().min(0),
    }),
    castManaMult: z.number().min(0),
    castPowerMult: z.number().positive(),
    chargeRatio: z.number().positive(),
    lullCharge: z.number().min(0),
    lullRadius: z.number().positive(),
    chargeLockout: z.number().min(0),
    comboWindow: z.number().positive(),
    chainRange: z.number().positive(),
    chainPower: z.number().positive(),
    scatterReach: z.number().min(0),
    defend: z.object({
      earthReduction: z.number().min(0).max(1),
      shadowLifesteal: z.number().min(0),
      natureRegen: z.number().min(0),
      blinkSeconds: z.number().min(0),
      onslaughtGuard: z.number().min(0),
    }),
  }),
  chains: z
    .object({
      cap: z.object({
        basic: z.number().int().min(1).max(MAX_CHAIN),
        primary: z.number().int().min(1).max(MAX_CHAIN),
        defensive: z.number().int().min(1).max(MAX_CHAIN),
        ultimate: z.number().int().min(1).max(MAX_CHAIN),
      }),
      // The per-weight tables (`feel`, `stacks.byWeight`) run Swift to Crushing: −2..2.
      kindWeight: z.object({
        light: z.number().int().min(-2).max(2),
        medium: z.number().int().min(-2).max(2),
        heavy: z.number().int().min(-2).max(2),
      }),
      holdStageWeight: z.array(z.number().int().min(-2).max(2)).length(3),
      holdTime: z.number().positive(),
      holdMax: z.number().positive(),
      holdStages: z.array(z.number().gt(0).lte(1)).length(2),
      stepBonus: z.number().min(0),
      beat: perKind(z.number().positive()),
      beatSlot: z.object({
        primary: z.number().positive(),
        defensive: z.number().positive(),
        ultimate: z.number().positive(),
      }),
    })
    .refine((c) => c.holdStages[0] < c.holdStages[1], 'holdStages must rise')
    .refine((c) => c.holdMax >= c.holdTime, 'holdMax must be at least holdTime'),
  movesets: z.object({
    // Each rarity's slots by skill, `[start, ceiling]` (the constructs spec §3.2): the Basic's
    // start 0 means the weapon's string; a ceiling never below its start nor the rarity below's,
    // and the legendary's all 5.
    slots: perRarity(
      z.object({
        basic: SlotRangeSchema,
        primary: SlotRangeSchema,
        defensive: SlotRangeSchema,
        ultimate: SlotRangeSchema,
      }),
    )
      .refine(
        (s) =>
          RARITY_ORDER.slice(1).every((r, i) =>
            CHAIN_SKILLS.every((k) => s[r][k][1] >= s[RARITY_ORDER[i]][k][1]),
          ),
        'a ceiling never falls with rarity',
      )
      .refine(
        (s) => CHAIN_SKILLS.every((k) => s.legendary[k][1] === MAX_CHAIN),
        `the legendary's ceilings are all ${MAX_CHAIN}`,
      ),
    extraSlots: perRarity(
      z
        .tuple([z.number().int().min(0), z.number().int().min(0)])
        .refine(([lo, hi]) => lo <= hi, 'least before most'),
    ),
    // By the new slot's position: the 2nd slot's price first, the last slot's last.
    slotLinks: z.array(z.number().int().min(0)).length(MAX_CHAIN - 1),
    slotScrap: z.array(z.number().int().min(0)).length(MAX_CHAIN - 1),
    // Open a skill (a skill's first slot), by the weapon's rarity: flux by grade, Links and scrap.
    openSkill: perRarity(
      z.object({
        flux: z
          .object({
            uncommon: z.number().int().min(0),
            magic: z.number().int().min(0),
            rare: z.number().int().min(0),
            epic: z.number().int().min(0),
          })
          .partial()
          .strict(),
        links: z.number().int().min(0),
        scrap: z.number().min(0),
      }),
    ),
    editDust: z.number().int().min(0),
    elementDust: z.number().int().min(0),
    // Mana Dust salvaging a construct gives (the constructs spec §3.3 gives none: 0 as shipped).
    salvageDust: z.number().int().min(0),
  }),
  runes: z.object({
    // Chance a weapon drop's open socket holds a rune, by rarity (the constructs spec §3.5).
    runeChance: perRarity(z.number().min(0).max(1)),
    // By the sockets the move already has: the first socket's price first.
    // At least 1: a removed move gives back a flat Link per socket.
    socketLinks: z.array(z.number().int().min(1)).length(MAX_SOCKETS),
    socketScrap: z.array(z.number().int().min(0)).length(MAX_SOCKETS),
    socketDrops: perRarity(
      z
        .tuple([z.number().int().min(0), z.number().int().min(0)])
        .refine(([lo, hi]) => lo <= hi, 'least before most'),
    ),
    unsocket: z.enum(['destroy', 'pay']),
    pullScrap: z.array(z.number().int().min(0)).length(RUNE_TIERS),
    fuseCount: z.number().int().min(2),
    // By the tier a fuse makes: II, III, IV, V.
    fuseScrap: z.array(z.number().int().min(0)).length(RUNE_TIERS - 1),
    dropChance: z.object({
      normal: z.number().min(0).max(1),
      elite: z.number().min(0).max(1),
      boss: z.number().min(0).max(1),
    }),
    tierDepths: z.array(z.number().int().min(1)).length(RUNE_TIERS),
    tierUp: z.number().min(0).max(1),
    echoDelay: z.number().positive(),
    guardSeconds: z.number().positive(),
    drainFoes: z.number().int().positive(),
    drainShare: z.number().min(0),
    shardSpeed: z.number().positive(),
    shardRange: z.number().positive(),
    // Rune costs (see the rune costs spec). A test holds `byForm`'s keys to arpg.json's forms.
    load: z.object({
      bySlot: z.object({
        primary: z.number().min(0),
        defensive: z.number().min(0),
        ultimate: z.number().min(0),
      }),
      byForm: z.record(z.string(), z.number().min(0)),
      charge: z.number().min(0),
      cast: z.number().min(0),
      easePerAttune: z.number().min(0),
      // At 1 runes are free; above it a load would turn into a refund.
      easeCap: z.number().min(0).max(1),
    }),
  }),
  dodge: z
    .object({
      charges: z.number().int().positive(),
      recharge: z.number().positive(),
      distance: z.number().positive(),
      duration: z.number().positive(),
      // The glide's ease-out: 0 a steady dash; under 1, so it never stops before its end.
      ease: z.number().min(0).lt(1),
      // Seconds the button held stretches the slide past its end, its speed draining to a stop.
      glide: z.number().min(0),
      // Radians a second the steering turns the dash.
      steer: z.number().min(0),
      // The burst: seconds into the dash before a move starts (the hero then acts as it slides).
      cancelAfter: z.number().min(0),
      iframes: z.number().positive(),
      perfectWindow: z.number().positive(),
      riposteWindow: z.number().positive(),
    })
    .refine((d) => d.perfectWindow <= d.iframes, 'perfectWindow must fit inside iframes')
    .refine((d) => d.cancelAfter <= d.duration, 'cancelAfter must fit inside duration'),
  feel: z.object({
    conjure: z.array(z.number().min(0)).length(5),
    conjureSlot: z.object({
      primary: z.number().min(0),
      defensive: z.number().min(0),
      ultimate: z.number().min(0),
    }),
    recovery: z.array(z.number().min(0)).length(5),
    heft: z.array(z.number().min(0).max(1)).length(5),
    recoveryMove: z.number().min(0).max(1),
    basicRecovery: z.number().min(0).max(1),
    motionPerWeight: z.number().min(0),
    recoilSeconds: z.number().positive(),
    stepSeconds: z.number().positive(),
    minLeap: z.number().positive(),
    actionMove: z.number().min(0).max(1),
    sideSteer: z.number().min(0).max(1),
    lungeHold: z.number().min(0).max(1),
    contactGap: z.number().min(0),
    buffer: z.number().min(0),
    heavyKnockback: z.number().min(0),
    lobBase: z.number().min(0),
  }),
  sandbox: z.object({
    dummyLifeMult: z.number().positive(),
    heroStart: z.tuple([z.number().min(0), z.number().min(0)]),
    dummyDistance: z.number().positive(),
    rowSpacing: z.number().positive(),
    clumpRadius: z.number().positive(),
    groupSpacing: z.number().positive(),
    spawnRing: z.number().positive(),
    edgeMargin: z.number().min(0),
  }),
  crafting: CraftingBalanceSchema,
  drops: DropsBalanceSchema,
  quests: QuestsBalanceSchema,
  layout: LayoutBalanceSchema,
  ai: AiBalanceSchema,
  terrain: TerrainBalanceSchema,
  boons: BoonsBalanceSchema,
  arena: z.object({
    step: z.number().positive(),
    // The open room's grid: whole cells.
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    packSpacing: z.number().positive(),
  }),
});

export const BalanceConfigSchema = z.object({
  delve: DelveBalanceSchema,
});
