import { z } from 'zod';
import { HeroStatKeySchema as StatKeySchema, ManaTypeSchema } from '../data/schemas.js';

/** Zod schema for persisted Delve saves — rejects corrupt or foreign data. */

const AbilityBuildSchema = z.object({
  form: z.enum(['bolt', 'volley', 'lance', 'burst', 'strike', 'ward', 'armor', 'surge', 'blink', 'nova', 'barrage', 'maelstrom']),
  elements: z
    .array(ManaTypeSchema)
    .min(1)
    .max(2)
    .refine((e) => new Set(e).size === e.length, 'elements must differ'),
  weight: z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]),
  payment: z.enum(['mana', 'charge', 'cast']),
});

const RaritySchema = z.enum(['common', 'uncommon', 'magic', 'rare', 'epic', 'legendary']);
const SlotSchema = z.enum(['weapon', 'helm', 'chest', 'gloves', 'boots', 'amulet', 'ring']);

const StatRollSchema = z.object({ stat: StatKeySchema, value: z.number(), roll: z.number() });

export const GearItemSchema = z.object({
  uid: z.string(),
  slot: SlotSchema,
  baseId: z.string(),
  rarity: RaritySchema,
  mana: ManaTypeSchema,
  ilvl: z.number().int().min(1),
  name: z.string(),
  implicits: z.array(StatRollSchema),
  affixes: z.array(StatRollSchema),
  legendary: z.object({ id: z.string(), value: z.number(), roll: z.number() }).optional(),
  upgrade: z.number().int().min(0),
  reforges: z.number().int().min(0),
  locked: z.boolean(),
});

const PerRarityCount = z.object({
  common: z.number(),
  uncommon: z.number(),
  magic: z.number(),
  rare: z.number(),
  epic: z.number(),
  legendary: z.number(),
});

const DoorSchema = z.object({
  id: z.string(),
  name: z.string(),
  text: z.string(),
  icon: z.string(),
  weight: z.number(),
  mods: z.object({
    magicFind: z.number().optional(),
    monsterHp: z.number().optional(),
    monsterDmg: z.number().optional(),
    eliteChance: z.number().optional(),
    bountyMult: z.number().optional(),
    dropMult: z.number().optional(),
    healFull: z.boolean().optional(),
    potions: z.number().optional(),
    skip: z.number().optional(),
    packs: z.number().optional(),
  }),
});

const DiveSchema = z.object({
  seed: z.number().int(),
  startDepth: z.number().int().min(1),
  depth: z.number().int().min(1),
  heroHpFrac: z.number().min(0).max(1),
  potions: z.number().int().min(0),
  phoenixUsed: z.boolean(),
  door: DoorSchema.nullable(),
  doorChoices: z.array(z.string()),
  phase: z.enum(['fighting', 'choosing', 'dead', 'extracted']),
  bounty: z.number().min(0),
  kills: z.number().int().min(0),
  depthsCleared: z.number().int().min(0),
  scrapEarned: z.number().min(0),
  found: PerRarityCount,
  bestFind: GearItemSchema.nullable(),
});

export const DelveProfileSchema = z.object({
  version: z.literal(3),
  seed: z.number().int(),
  diveCount: z.number().int().min(0),
  forgeCount: z.number().int().min(0),
  nextUid: z.number().int().min(0),
  equipped: z.object({
    weapon: GearItemSchema.optional(),
    helm: GearItemSchema.optional(),
    chest: GearItemSchema.optional(),
    gloves: GearItemSchema.optional(),
    boots: GearItemSchema.optional(),
    amulet: GearItemSchema.optional(),
    ring: GearItemSchema.optional(),
  }),
  bag: z.array(GearItemSchema),
  scrap: z.number().min(0),
  bestDepth: z.number().int().min(0),
  checkpoints: z.array(z.number().int().min(1)),
  codex: z.record(z.string(), z.object({ count: z.number().int().min(0), bestRoll: z.number() })),
  stats: z.object({
    kills: z.number().int().min(0),
    dives: z.number().int().min(0),
    deaths: z.number().int().min(0),
    extracts: z.number().int().min(0),
    bossKills: z.number().int().min(0),
    scrapEarned: z.number().min(0),
    itemsFound: PerRarityCount,
  }),
  pity: z.number().int().min(0),
  firstBossLegendaryGiven: z.boolean(),
  autoSalvage: z.object({
    common: z.boolean(),
    uncommon: z.boolean(),
    magic: z.boolean(),
    rare: z.boolean(),
    epic: z.boolean(),
    legendary: z.boolean(),
  }),
  abilities: z.object({
    primary: AbilityBuildSchema,
    defensive: AbilityBuildSchema,
    ultimate: AbilityBuildSchema,
  }),
  reactionsSeen: z.array(z.enum(['melt', 'shatter', 'overload', 'superconduct', 'soulfire', 'combust', 'blight'])),
  dive: DiveSchema.nullable(),
});

/** Version 2 saves had a spell bar instead of ability builds; `parseDelveProfile` migrates them. */
export const DelveProfileV2Schema = DelveProfileSchema.omit({ version: true, abilities: true }).extend({
  version: z.literal(2),
  skillSlots: z.array(z.string().nullable()).length(3),
});
