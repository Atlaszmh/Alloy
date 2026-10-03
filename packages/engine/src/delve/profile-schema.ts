import { z } from 'zod';
import {
  HeroStatKeySchema as StatKeySchema,
  ManaTypeSchema,
  MoveKindSchema,
  ObjectiveSchema,
  ReactionIdSchema,
  RewardSchema,
} from '../data/schemas.js';
import { CHAIN_SKILLS, MAX_CHAIN, type AbilitySlot, type FormId } from '../types/ability.js';
import { FLUX_GRADES, METAL_IDS } from '../types/crafting.js';
import { CONTRACT_TIERS } from '../types/quests.js';
import { MAX_SOCKETS, RUNE_TIERS } from '../types/rune.js';

/** Zod schema for persisted Delve saves (version 9 only) — rejects corrupt or foreign data. */

/** Each ability slot's forms (`arpg.json`'s, which a test holds this to). */
export const SLOT_FORMS: Record<AbilitySlot, readonly FormId[]> = {
  primary: ['bolt', 'volley', 'lance', 'burst', 'strike'],
  defensive: ['ward', 'armor', 'surge', 'blink'],
  ultimate: ['nova', 'barrage', 'maelstrom'],
};

const FormIdSchema = z.enum([
  'bolt',
  'volley',
  'lance',
  'burst',
  'strike',
  'ward',
  'armor',
  'surge',
  'blink',
  'nova',
  'barrage',
  'maelstrom',
]);

/** One element, or two different ones (a fusion). */
const ElementsSchema = z
  .array(ManaTypeSchema)
  .min(1)
  .max(2)
  .refine((e) => new Set(e).size === e.length, 'elements must differ');

const PaymentSchema = z.enum(['mana', 'charge', 'cast']);

/** A socketed rune: its id (checked against the data at load) and its tier, I to V. */
export const RuneRefSchema = z.object({
  id: z.string(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

/** A move's or a blow's open sockets, each a rune or null (see the runes spec). */
const SocketsSchema = z.array(RuneRefSchema.nullable()).max(MAX_SOCKETS).optional();

export const MoveSchema = z.object({
  kind: MoveKindSchema,
  form: FormIdSchema,
  elements: ElementsSchema,
  runes: SocketsSchema,
});

export const BlowSchema = z.object({
  kind: MoveKindSchema,
  element: ManaTypeSchema,
  runes: SocketsSchema,
});

/** Loose runes: rune id → counts by tier. */
export const RunePouchSchema = z.record(
  z.string(),
  z.array(z.number().int().min(0)).length(RUNE_TIERS),
);

const count = z.number().int().min(0);

/** A count for each id. */
function counts<K extends string>(ids: readonly K[]) {
  return z.object(Object.fromEntries(ids.map((id) => [id, count])) as Record<K, typeof count>);
}

/** The materials pouch: bars, flux, shards by tier and essences (see the crafting spec). */
export const MaterialsPouchSchema = z.object({
  metals: counts(METAL_IDS),
  flux: counts(FLUX_GRADES),
  shards: z.record(StatKeySchema, z.array(count).max(5)),
  essences: z.record(z.string(), count),
});

/** A floor's or a dive's haul: materials and the currencies. */
export const HaulSchema = MaterialsPouchSchema.extend({
  scrap: z.number().min(0),
  dust: count,
  links: count,
  runes: RunePouchSchema,
});

/** An ability chain: 1 to `MAX_CHAIN` moves and a payment (see `slotChain` for the forms). */
export const ChainSchema = z.object({
  moves: z.array(MoveSchema).min(1).max(MAX_CHAIN),
  payment: PaymentSchema,
});

/** A chain whose every move is one of `slot`'s forms. */
function slotChain(slot: AbilitySlot) {
  return ChainSchema.refine(
    (c) => c.moves.every((m) => SLOT_FORMS[slot].includes(m.form)),
    `every move must be a ${slot} form`,
  );
}

const CapSchema = z.number().int().min(1).max(MAX_CHAIN);

/** A weapon's moveset: a chain for each skill it carries, each within its skill's slots. */
export const MovesetSchema = z
  .object({
    chains: z.object({
      basic: z.array(BlowSchema).min(1).max(MAX_CHAIN).optional(),
      primary: slotChain('primary').optional(),
      defensive: slotChain('defensive').optional(),
      ultimate: slotChain('ultimate').optional(),
    }),
    slots: z.object({
      basic: CapSchema.optional(),
      primary: CapSchema.optional(),
      defensive: CapSchema.optional(),
      ultimate: CapSchema.optional(),
    }),
  })
  .refine(
    ({ chains, slots }) =>
      CHAIN_SKILLS.every((skill) => {
        const moves = skill === 'basic' ? chains.basic?.length : chains[skill]?.moves.length;
        const n = slots[skill];
        return moves === undefined ? n === undefined : n !== undefined && moves <= n;
      }),
    'each chain has its slots and fits them',
  );

const RaritySchema = z.enum(['common', 'uncommon', 'magic', 'rare', 'epic', 'legendary']);
const SlotSchema = z.enum(['weapon', 'helm', 'chest', 'gloves', 'boots', 'amulet', 'ring']);

const StatRollSchema = z.object({
  stat: StatKeySchema,
  value: z.number(),
  roll: z.number(),
  band: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
});

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
  // The Training Grounds' saved loadout predates hones: it reads as none.
  hones: z.number().int().min(0).default(0),
  locked: z.boolean(),
  moveset: MovesetSchema.optional(),
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
    monsterHp: z.number().optional(),
    monsterDmg: z.number().optional(),
    eliteChance: z.number().optional(),
    bountyMult: z.number().optional(),
    healFull: z.boolean().optional(),
    potions: z.number().optional(),
    skip: z.number().optional(),
    packs: z.number().optional(),
    materials: z.number().optional(),
    runes: z.number().optional(),
    gear: z.number().optional(),
    flux: z.number().optional(),
    essence: z.number().optional(),
    shardTier: z.number().optional(),
    find: z.number().optional(),
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
  dustEarned: z.number().int().min(0).default(0),
  linksEarned: z.number().int().min(0).default(0),
  runesEarned: z.number().int().min(0).default(0),
  // A stop between depths: its kinds are `STOP_KINDS` (delve/stops.ts).
  stop: z
    .object({
      offers: z.array(z.enum(['equip', 'slot', 'move', 'upgrade', 'rune'])),
      taken: z.boolean(),
    })
    .nullable()
    .default(null),
  haul: HaulSchema,
  banked: HaulSchema,
  lost: HaulSchema.nullable(),
  settled: z.boolean(),
  dropsGiven: z.array(z.number().int()).default([]),
  found: PerRarityCount,
  bestFind: GearItemSchema.nullable(),
});

/** The hero's pair: a secondary only once there is a primary, and never the same element. */
const PairSchema = z
  .object({ primary: ManaTypeSchema.nullable(), secondary: ManaTypeSchema.nullable() })
  .refine(
    (p) => p.secondary === null || (p.primary !== null && p.secondary !== p.primary),
    'a secondary needs a different primary',
  );

const ProgressSchema = z.object({ value: count, done: z.boolean() });

/** A contract on the board, with its own progress. */
const ContractSchema = z.object({
  id: z.string(),
  template: z.string(),
  tier: z.enum(CONTRACT_TIERS),
  name: z.string(),
  line: z.string(),
  objectives: z.array(ObjectiveSchema).min(1),
  rewards: z.array(RewardSchema),
  progress: z.array(ProgressSchema),
});

/** The quests (see the quests spec). */
const QuestsSchema = z.object({
  progress: z.record(z.string(), z.array(ProgressSchema)),
  unlocked: z.array(z.string()),
  claimed: z.array(z.string()),
  tracked: z.array(z.string()),
  seen: z.array(z.string()),
  board: z.array(ContractSchema.nullable()),
  boardCount: count,
  contractsClaimed: count,
  rerollUsed: z.boolean(),
  claimCount: count,
});

/** Version 9: the quests (see the quests spec); older saves reset. */
export const DelveProfileSchema = z.object({
  version: z.literal(9),
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
  firstEssenceGiven: z.boolean(),
  autoSalvage: z.object({
    common: z.boolean(),
    uncommon: z.boolean(),
    magic: z.boolean(),
    rare: z.boolean(),
    epic: z.boolean(),
    legendary: z.boolean(),
  }),
  pair: PairSchema,
  manaDust: z.number().int().min(0),
  links: z.number().int().min(0),
  runes: RunePouchSchema,
  materials: MaterialsPouchSchema,
  patterns: z.array(z.string()),
  essencesSeen: z.array(z.string()),
  reactionsSeen: z.array(ReactionIdSchema),
  quests: QuestsSchema,
  dive: DiveSchema.nullable(),
});
