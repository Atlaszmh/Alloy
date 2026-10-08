import type { ChainSkill, Construct, WeaponClass } from './ability.js';
import type { MonsterKind } from './arpg.js';
import type { DelveProfile } from './delve.js';
import type { GearSlot, HeroStatKey, Rarity } from './gear.js';
import type { ManaType } from './mana.js';
import type { RunePouch, RuneRef } from './rune.js';

/**
 * Component crafting and the materials economy (see the crafting spec): what
 * the Anvil forges from, what a dive carries home, and the shapes the forge,
 * salvage and settle ops trade in.
 */

/** The seven metals, lowest first: each sets an item-level band (`crafting.json → metals`). */
export const METAL_IDS = [
  'rusty',
  'iron',
  'steel',
  'mithril',
  'adamant',
  'starforged',
  'voidforged',
] as const;
export type MetalId = (typeof METAL_IDS)[number];

/** The flux grades, lowest first: a bar and a flux make an ingot of that rarity (none: common). */
export const FLUX_GRADES = ['uncommon', 'magic', 'rare', 'epic'] as const;
export type FluxGrade = (typeof FLUX_GRADES)[number];

/** What an affix belongs to, for the biomes' and doors' shard leanings. */
export const AFFIX_FAMILIES = ['offense', 'defense', 'sustain', 'utility', 'element'] as const;
export type AffixFamily = (typeof AFFIX_FAMILIES)[number];

/** An affix shard: its stat and its tier (1 = I), within the affix's tier count. */
export interface ShardRef {
  stat: HeroStatKey;
  tier: number;
}

/**
 * The materials pouch (`DelveProfile.materials`): bars by metal, flux by grade,
 * shards by affix (counts by tier, index tier − 1) and essences by legendary id.
 */
export interface MaterialsPouch {
  metals: Record<MetalId, number>;
  flux: Record<FluxGrade, number>;
  shards: Partial<Record<HeroStatKey, number[]>>;
  essences: Record<string, number>;
}

/** What a floor or a dive carries (`DiveState.haul`, `banked`, `lost`): materials and the currencies. */
export interface Haul extends MaterialsPouch {
  scrap: number;
  /** Mana Dust. */
  dust: number;
  links: number;
  runes: RunePouch;
  /** Constructs a weapon salvaged mid-dive gave (the constructs spec §3.3), lost with the haul. */
  constructs: Construct[];
}

/** One material pickup's kind: a bar, a flux, a shard, an essence, Mana Dust or Links. */
export type MaterialRef =
  | { kind: 'metal'; metal: MetalId }
  | { kind: 'flux'; grade: FluxGrade }
  | ({ kind: 'shard' } & ShardRef)
  | { kind: 'essence'; essence: string }
  | { kind: 'dust' }
  | { kind: 'links' };

/** How a dive's banked materials settle into the stockpile (`settleDive`). */
export type SettleOutcome = 'extract' | 'death' | 'abandon';

// ── Forging ────────────────────────────────────────────────────────────────

/** A forge at the bench: a learned pattern, a bar, a flux (none: common), an essence (legendary, with epic flux), the element and the shards. */
export interface ForgeRequest {
  baseId: string;
  metal: MetalId;
  flux?: FluxGrade;
  /** A legendary id: with epic flux, a legendary carrying that power. */
  essence?: string;
  element: ManaType;
  shards: ShardRef[];
}

/** Why a forge refuses (`ForgePreview.refused`): a code to test and a reason to show. */
export type ForgeRefusalCode =
  | 'locked'
  | 'pattern'
  | 'materials'
  | 'essence'
  | 'essenceSlot'
  | 'shardSlot'
  | 'shardDuplicate'
  | 'shardCount'
  | 'scrap'
  | 'dust'
  | 'bagFull';

export interface ForgeRefusal {
  code: ForgeRefusalCode;
  reason: string;
}

/** One affix line a forge would roll. */
export interface ForgeLinePreview {
  /** The shard that sets the line, or null: it rolls at random from the slot's pool (the shards' affixes left out). */
  shard: ShardRef | null;
  /** Its roll band, 0–1 in the affix's full range: the shard tier's, or the rarity's `[minRoll, 1]`. */
  band: [number, number];
  /** A shard line's value range at the item level, the floor lifting its low end (null for a random line). */
  range: [number, number] | null;
}

/** Everything `forgeItem` would make but the random draws (the bench renders only this). */
export interface ForgePreview {
  baseId: string;
  slot: GearSlot;
  rarity: Rarity;
  ilvl: number;
  element: ManaType;
  /** The attunement floor its affix lines and legendary roll take (0 off the pair). */
  floor: number;
  /** Each implicit's value range at the item level and rarity. */
  implicits: { stat: HeroStatKey; min: number; max: number }[];
  /** One per line the rarity rolls (`loot.affixCount`), the shards' first. */
  lines: ForgeLinePreview[];
  /** A legendary's power, its roll band and its value range (the floor lifting its low end). */
  legendary: { id: string; band: [number, number]; range: [number, number] } | null;
  /** What it costs besides the bar, flux, essence and shards it consumes. */
  price: { scrap: number; dust: number };
  /**
   * A weapon's class, each skill's slots against its ceiling (a skill at 0 slots listed with its
   * ceiling, so the bench can show "Defensive 0 / 1") and its open sockets (the constructs spec §3.5).
   */
  weapon: {
    class: WeaponClass;
    slots: Record<ChainSkill, [slots: number, ceiling: number]>;
    sockets: number;
  } | null;
  refused: ForgeRefusal | null;
}

// ── Salvage ────────────────────────────────────────────────────────────────

/** What salvaging an item could give back (`salvageYield`): the Loadout's preview. */
export interface SalvageYield {
  scrap: number;
  dust: number;
  links: number;
  /** One of these at random (each line's shard at the tier its roll gives); none for a common or a legendary. */
  shards: ShardRef[];
  /** The chance of a second shard, from another line. */
  extraShard: number;
  /** Its base's pattern, when not yet learned. */
  pattern: string | null;
  /** A legendary's essence (its legendary id). */
  essence: string | null;
  /** A weapon's socketed runes, which go by the pull rule. */
  runes: RuneRef[];
  /** A weapon's constructs, which go to the bag (the constructs spec §3.3; B2 fills it: empty in A). */
  constructs: Construct[];
}

/** What one salvage gave (`applySalvage`): mid-dive into the floor's haul, at the Anvil into the stockpile. */
export interface SalvageResult {
  profile: DelveProfile;
  scrap: number;
  dust: number;
  links: number;
  shards: ShardRef[];
  pattern: string | null;
  essence: string | null;
  runes: RuneRef[];
  destroyed: RuneRef[];
  /** The constructs sent to the bag, or mid-dive the haul (B2 fills it: empty in A). */
  constructs: Construct[];
}

// ── Data (crafting.json) ───────────────────────────────────────────────────

/** A metal: its name and the item levels it forges, `[lo, hi]` (hi null: open-ended). */
export interface MetalDef {
  id: MetalId;
  name: string;
  band: [number, number | null];
}

/** A shard tier's roll band, 0–1 in its affix's range. */
export interface ShardTierDef {
  tier: number;
  min: number;
  max: number;
}

export interface CraftingData {
  /** Lowest first; their bands partition the item levels from 1 up. */
  metals: MetalDef[];
  flux: { grade: FluxGrade }[];
  /** The default shard tiers, I up. */
  shardTiers: ShardTierDef[];
  /** An affix's own tiers, in place of the default (the `*Attune` shards: I–II). */
  affixShardTiers: Partial<Record<HeroStatKey, ShardTierDef[]>>;
  /** Every affix's family. */
  families: Record<HeroStatKey, AffixFamily>;
  /** The patterns a new save knows. */
  startingPatterns: string[];
  /** The materials and scrap a new save holds. */
  startingMaterials: {
    metals: Partial<Record<MetalId, number>>;
    flux: Partial<Record<FluxGrade, number>>;
    scrap: number;
  };
}

// ── Balance (balance.json → delve.crafting, delve.drops) ──────────────────

/** A drop-table entry: the chance it drops at all (× the door's `materials`, at most 1), then a uniform count. */
export interface DropEntry {
  chance: number;
  count: [number, number];
}

export interface CraftingBalance {
  /** A forge's scrap by rarity, × `scrapLevelFactor(ilvl)`. */
  forgeScrap: Record<Rarity, number>;
  /** Mana Dust to forge in an element outside the pair. */
  offPairDust: number;
  /** A forged weapon's free extra slots by rarity (the Primary's first, then Basic, Ultimate, Defensive; not bought). */
  weaponExtras: Record<Rarity, { slots: number }>;
  /** A hone's scrap: this × `forge.rarityCostMult` × `honeGrowth` ^ hones × `scrapLevelFactor(ilvl)`. */
  honeScrap: number;
  honeGrowth: number;
  /** An imprint's scrap by rarity, × `scrapLevelFactor(ilvl)`, besides the shard. */
  imprintScrap: Record<Rarity, number>;
  /** Refining `count` of a grade into one of the next, for scrap (a shard's by the tier refined, I→II first). */
  refine: {
    metal: { count: number; scrap: number };
    flux: { count: number; scrap: number };
    shard: { count: number; scrap: number[] };
  };
  /** The attunement floor on an in-pair item's affix and legendary rolls: min(cap, perPoint × attunement). */
  attuneRoll: { perPoint: number; cap: number };
  /** A salvaged line's shard tier: the roll thresholds it passes, one per tier past I (clamped to the affix's last). */
  salvageShardTier: number[];
  /** Chance a salvage gives a second shard, from another line. */
  salvageExtraShard: number;
  /** The shard bench's price for a tier I shard. */
  shardBench: { scrap: number; dust: number };
  /** The share of a dive's banked materials a death or an abandon loses. */
  deathLoss: number;
}

export interface DropsBalance {
  normal: { bars: DropEntry; dust: DropEntry; shards: DropEntry; links: DropEntry };
  elite: {
    bars: DropEntry;
    dust: DropEntry;
    shards: DropEntry;
    links: DropEntry;
    flux: DropEntry;
    /** Chance an elite drops a gear item (× the door's `gear`). */
    gearChance: number;
    /** Chance of a pattern the hero doesn't know (none once every pattern is known). */
    patternChance: number;
  };
  boss: {
    /** Gear items a boss drops, rolled as today's boss item (at least `loot.bossMinRarity`). */
    gear: number;
    flux: DropEntry;
    shards: DropEntry;
    /** Chance of an essence (× the door's `essence` and Lucky Charm's `legendaryBoost`). */
    essenceChance: number;
    patternChance: number;
  };
  /**
   * A treasure vault's chest (see the floor maps spec): no gear; its shards come
   * `shardTierUp` tiers above the floor's, and an essence at `essenceChance`.
   */
  vault: { flux: DropEntry; shards: DropEntry; shardTierUp: number; essenceChance: number };
  /** An elite den: added to its elites' gear chance. */
  den: { gearBonus: number };
  /** A kill's scrap by foe kind: `scrapLevelFactor(ilvl)` × this × (1 + scrapFind / 100). */
  scrapByKind: Record<MonsterKind, number>;
  /** The scrap pickups a kill's scrap is split into. */
  scrapPickups: Record<MonsterKind, number>;
  /** Chance a bar comes as the next metal up. */
  metalUpChance: number;
  /** Below this depth nothing yields an essence: no boss, vault, contract or reward (see the tutorial spec). */
  essenceMinDepth: number;
  /** Find: each flux or shard drop comes a grade or tier up with chance min(cap, Find / 100 × perPoint). */
  find: { perPoint: number; cap: number };
  /** The depth each shard tier, I to V, starts dropping at. */
  shardTierDepths: number[];
  /** The depth each flux grade, uncommon to epic, starts dropping at. */
  fluxGradeDepths: number[];
  /** The weights of the tiers (or grades) a floor can drop, lowest first. */
  tierWeights: number[];
  /** A biome's shard leanings: an affix's weight × this by its family (missing: 1). */
  biomeShardWeights: Record<string, Partial<Record<AffixFamily, number>>>;
  /** The biome element's `*Power` and `*Attune` shards' weight × this. */
  biomeElementWeight: number;
  /** A door's shard leanings, as `biomeShardWeights`. */
  doors: Record<string, Partial<Record<AffixFamily, number>>>;
  /** The magnet's pull speed and the floor-clear vacuum's, in units a second. */
  magnetSpeed: number;
  vacuumSpeed: number;
  /** Seconds before a fresh drop can be picked up. */
  pickupDelay: number;
}
