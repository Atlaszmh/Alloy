import type { SeededRNG } from '../rng/seeded-rng.js';
import type { EquippedGear, GearItem, GearSlot, HeroStatKey, Rarity } from './gear.js';

// ── Data definitions (delve.json) ──────────────────────────────────────────

export type StatScaling = 'flat' | 'fixed';

export interface ImplicitTemplate {
  stat: HeroStatKey;
  base: number;
  scaling: StatScaling;
}

export interface GearBaseDef {
  id: string;
  slot: GearSlot;
  name: string;
  /** Weapons only: seconds between attacks. */
  attackInterval?: number;
  weight: number;
  implicits: ImplicitTemplate[];
}

export interface GearAffixDef {
  stat: HeroStatKey;
  label: string;
  unit: 'flat' | 'pct';
  min: number;
  max: number;
  scaling: StatScaling;
  decimals: number;
  weight: number;
  slots: GearSlot[];
}

export interface LegendaryDef {
  id: string;
  name: string;
  /** Player-facing text; `{v}` is replaced with the rolled value. */
  text: string;
  min: number;
  max: number;
  slots: GearSlot[];
}

export type MonsterTrait = 'armored' | 'swift' | 'brute' | 'regenerating' | 'vampiric' | 'spiked';

export interface MonsterTraitDef {
  id: MonsterTrait;
  name: string;
  text: string;
}

export interface MonsterDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  dmg: number;
  interval: number;
  traits?: MonsterTrait[];
}

export interface BiomeDef {
  id: string;
  name: string;
  colors: [string, string];
  accent: string;
  monsters: MonsterDef[];
  boss: MonsterDef;
}

export interface DoorMods {
  magicFind?: number;
  monsterHp?: number;
  monsterDmg?: number;
  eliteChance?: number;
  bountyMult?: number;
  dropMult?: number;
  healFull?: boolean;
  potions?: number;
  skip?: number;
  fights?: number;
}

export interface DoorDef {
  id: string;
  name: string;
  text: string;
  icon: string;
  weight: number;
  mods: DoorMods;
}

export interface MaterialDef {
  minIlvl: number;
  name: string;
}

export interface DelveData {
  bases: GearBaseDef[];
  affixes: GearAffixDef[];
  legendaries: LegendaryDef[];
  traits: MonsterTraitDef[];
  biomes: BiomeDef[];
  doors: DoorDef[];
  materials: MaterialDef[];
  names: { prefixes: string[]; suffixes: Record<GearSlot, string[]> };
  slotWeights: Record<GearSlot, number>;
}

// ── Balance (balance.json → delve) ─────────────────────────────────────────

export interface DelveBalance {
  hero: {
    baseHp: number;
    baseCritChance: number;
    baseCritMultiplier: number;
    unarmedDamage: number;
    unarmedInterval: number;
    minAttackInterval: number;
    critCap: number;
    dodgeCap: number;
    armorK: number;
    armorCap: number;
  };
  growth: { item: number; monsterHp: number; monsterDmg: number };
  monster: {
    baseHp: number;
    baseDmg: number;
    /** Softening multipliers for depths 1..n so the first fights are gentle wins. */
    earlyRamp: number[];
    /** Fight length (s) after which monster damage starts doubling. */
    enrageSeconds: number;
    /** Seconds between each further doubling. */
    enrageInterval: number;
    elite: { hp: number; dmg: number; minTraits: number; maxTraits: number };
    boss: { hp: number; dmg: number };
    traits: {
      armoredReduction: number;
      swiftInterval: number;
      swiftHp: number;
      bruteDmg: number;
      bruteInterval: number;
      regenPerSecond: number;
      vampiricFraction: number;
      spikedFraction: number;
    };
  };
  dive: {
    fightsPerDepth: number;
    bossEvery: number;
    eliteChance: number;
    healOnDepthClear: number;
    potions: number;
    maxPotions: number;
    potionHeal: number;
    bossPotionReward: number;
    doorsOffered: number;
    /** Scrap added per cleared depth (scaled by depth like all scrap). */
    bountyBase: number;
    /** Compounds per depth cleared in the same dive — the push-your-luck curve. */
    bountyGrowth: number;
  };
  slam: { chargeMax: number; damageMult: number; stunSeconds: number };
  elements: {
    burnFraction: number;
    burnDuration: number;
    chillSlow: number;
    chillDuration: number;
    chainChance: number;
  };
  loot: {
    rarityWeights: Record<Rarity, number>;
    luckExponent: number;
    luckPerDepth: number;
    /** Cap on the luck granted by depth alone. */
    maxDepthLuck: number;
    eliteLuck: number;
    bossLuck: number;
    pityPerDrop: number;
    normalDropChance: number;
    extraDropChance: number;
    eliteDrops: [number, number];
    bossDrops: [number, number];
    bossMinRarity: Rarity;
    rarityBaseMult: Record<Rarity, number>;
    affixCount: Record<Rarity, number>;
    minRoll: Record<Rarity, number>;
    scrapPerKill: number;
    scrapLevelScale: number;
    salvage: Record<Rarity, number>;
    bagSize: number;
  };
  forge: {
    upgradeStep: number;
    maxUpgrade: number;
    upgradeBaseCost: number;
    upgradeCostExp: number;
    rarityCostMult: Record<Rarity, number>;
    reforgeBaseCost: number;
    reforgeGrowth: number;
    fuseCost: Record<Rarity, number>;
  };
}

// ── Hero & monsters at runtime ─────────────────────────────────────────────

export interface HeroStats {
  maxHp: number;
  armor: number;
  /** Physical damage per hit before multipliers. */
  weaponDamage: number;
  fireDamage: number;
  coldDamage: number;
  lightningDamage: number;
  /** 1 + %damage / 100 */
  damageMult: number;
  /** Seconds between attacks after attack speed. */
  attackInterval: number;
  /** 0–1 */
  critChance: number;
  /** e.g. 1.5 = 150% */
  critMultiplier: number;
  /** 0–1 */
  dodge: number;
  /** 0–1 fraction of damage dealt */
  lifesteal: number;
  lifeOnHit: number;
  /** 0–1 fraction of max HP */
  healOnKill: number;
  thorns: number;
  /** Percentage points */
  magicFind: number;
  /** Percentage points */
  scrapFind: number;
  /** Equipped legendary powers → rolled value (best of duplicates). */
  legendaries: Record<string, number>;
}

export type MonsterKind = 'normal' | 'elite' | 'boss';

export interface MonsterInstance {
  id: string;
  name: string;
  icon: string;
  kind: MonsterKind;
  depth: number;
  biomeId: string;
  maxHp: number;
  damage: number;
  attackInterval: number;
  traits: MonsterTrait[];
}

// ── Fight runtime ──────────────────────────────────────────────────────────

export type FightSide = 'hero' | 'monster';

export type FightEvent =
  | {
      kind: 'hit';
      t: number;
      source: FightSide;
      amount: number;
      crit: boolean;
      dodged?: boolean;
      blocked?: boolean;
      element?: 'fire' | 'cold' | 'lightning';
      extra?: 'twin' | 'chain' | 'storm';
    }
  | { kind: 'burn'; t: number; amount: number }
  | { kind: 'thorns'; t: number; source: FightSide; amount: number }
  | { kind: 'heal'; t: number; target: FightSide; amount: number; source: 'lifesteal' | 'potion' | 'kill' | 'regen' | 'vampiric' }
  | { kind: 'slam'; t: number; amount: number; crit: boolean }
  | { kind: 'chill'; t: number }
  | { kind: 'revive'; t: number; amount: number }
  | { kind: 'death'; t: number; target: FightSide };

export interface FightState {
  t: number;
  rng: SeededRNG;
  depth: number;
  hero: HeroStats;
  monster: MonsterInstance;
  heroHp: number;
  monsterHp: number;
  heroNextAttack: number;
  monsterNextAttack: number;
  attackCount: number;
  slamCharge: number;
  burnDps: number;
  burnUntil: number;
  burnNextTick: number;
  chillUntil: number;
  regenNextTick: number;
  bulwarkUsed: boolean;
  phoenixAvailable: boolean;
  phoenixUsed: boolean;
  over: boolean;
  winner: FightSide | null;
}

// ── Dive & profile ─────────────────────────────────────────────────────────

export type DivePhase = 'fighting' | 'choosing' | 'dead' | 'extracted';

export interface DiveState {
  seed: number;
  startDepth: number;
  depth: number;
  encounterIndex: number;
  encountersInDepth: number;
  /** 0–1 fraction of max HP, so gear swaps between fights never over/under-heal. */
  heroHpFrac: number;
  potions: number;
  phoenixUsed: boolean;
  door: DoorDef | null;
  doorChoices: string[];
  phase: DivePhase;
  bounty: number;
  kills: number;
  depthsCleared: number;
  scrapEarned: number;
  found: Record<Rarity, number>;
  /** uid of the best (highest rarity, then ilvl) item found this dive. */
  bestFind: GearItem | null;
}

export interface DelveStats {
  kills: number;
  dives: number;
  deaths: number;
  extracts: number;
  bossKills: number;
  scrapEarned: number;
  itemsFound: Record<Rarity, number>;
}

export interface CodexEntry {
  count: number;
  bestRoll: number;
}

export interface DelveProfile {
  version: 1;
  seed: number;
  diveCount: number;
  forgeCount: number;
  nextUid: number;
  equipped: EquippedGear;
  bag: GearItem[];
  scrap: number;
  bestDepth: number;
  checkpoints: number[];
  codex: Record<string, CodexEntry>;
  stats: DelveStats;
  /** Drops since the last legendary — raises legendary odds. */
  pity: number;
  firstBossLegendaryGiven: boolean;
  autoSalvage: Record<Rarity, boolean>;
  dive: DiveState | null;
}
