import type { EquippedGear, GearItem, GearSlot, HeroStatKey, Rarity } from './gear.js';
import type { ManaMap, ManaType } from './mana.js';

// ── Data definitions (delve.json) ──────────────────────────────────────────

export type StatScaling = 'flat' | 'fixed';

export interface ImplicitTemplate {
  stat: HeroStatKey;
  base: number;
  scaling: StatScaling;
}

/** How a weapon's basic attack behaves in the arena. */
export interface WeaponAttackDef {
  /** melee: instant cleave in an arc; bolt: a projectile. */
  kind: 'melee' | 'bolt';
  /** Reach (melee) or max travel distance (bolt), in world units. */
  range: number;
  /** Melee cleave arc in degrees (360 = all around). */
  arc?: number;
  /** Bolt speed in units per second. */
  speed?: number;
}

export interface GearBaseDef {
  id: string;
  slot: GearSlot;
  name: string;
  /** Weapons only: seconds between attacks. */
  attackInterval?: number;
  /** Weapons only: basic-attack profile. */
  attack?: WeaponAttackDef;
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

export type MonsterAi = 'melee' | 'ranged' | 'charger';

export interface MonsterDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  dmg: number;
  interval: number;
  traits?: MonsterTrait[];
  ai?: MonsterAi;
  /** Movement speed multiplier (1 = normal). */
  speed?: number;
  /** Body radius multiplier (1 = normal). */
  size?: number;
}

export interface BiomeDef {
  id: string;
  name: string;
  /** The biome's element: monsters resist it, and gear found here leans toward it. */
  mana: ManaType;
  colors: [string, string];
  accent: string;
  monsters: MonsterDef[];
  boss: MonsterDef;
}

export interface DoorMods {
  magicFind?: number;
  monsterHp?: number;
  monsterDmg?: number;
  /** Chance each pack is an elite pack (overrides the base chance if higher). */
  eliteChance?: number;
  bountyMult?: number;
  dropMult?: number;
  healFull?: boolean;
  potions?: number;
  skip?: number;
  /** Multiplier on the number of monster packs. */
  packs?: number;
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
    /** World units per second. */
    moveSpeed: number;
    radius: number;
    /** Items within this distance are picked up. */
    pickupRadius: number;
    /** Mana motes, health orbs and scrap drift in from this far. */
    magnetRadius: number;
    /** Cap on cooldown reduction, in percent. */
    cdrCap: number;
  };
  growth: { item: number; monsterHp: number; monsterDmg: number };
  monster: {
    baseHp: number;
    baseDmg: number;
    /** Softening multipliers for depths 1..n so the first floors are gentle. */
    earlyRamp: number[];
    /** Boss fight length (s) after which boss damage starts doubling. */
    enrageSeconds: number;
    /** Seconds between each further doubling. */
    enrageInterval: number;
    /** World units per second. */
    speed: number;
    radius: number;
    /** Seconds of telegraph before a melee swing lands. */
    windup: number;
    meleeRange: number;
    aggroRadius: number;
    /** Damage taken from the monster's own element is multiplied by (1 - resist). */
    resist: number;
    /** Damage taken from the element it's weak to is multiplied by (1 + weakness). */
    weakness: number;
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
    bossEvery: number;
    /** Chance each pack is an elite pack. */
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
    packsBase: number;
    packsPerDepth: number;
    packsMax: number;
    packSize: [number, number];
    healthOrbChance: number;
    healthOrbHeal: number;
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
    /** Chance a drop takes the biome's mana instead of a random one. */
    biomeManaBias: number;
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
  mana: {
    /** Attunement an item grants to its own mana type, by rarity. */
    attuneByRarity: Record<Rarity, number>;
    /** Both types need this much attunement to unlock a combo spell. */
    comboThreshold: number;
    /** A type at this attunement grants its mastery passive. */
    masteryThreshold: number;
    /** Spell damage bonus per point of attunement in the spell's type(s). */
    powerPerAttune: number;
    basePool: number;
    poolPerAttune: number;
    baseRegen: number;
    regenPerAttune: number;
    /** Mana gained in the weapon's type per basic-attack hit. */
    basicAttackGain: number;
    moteAmount: number;
    eliteMote: number;
    bossMote: number;
  };
  status: {
    /** Burn deals this fraction of the igniting hit per second. */
    burnDps: number;
    burnDuration: number;
    chillSlow: number;
    chillDuration: number;
    /** Chill stacks needed to freeze. */
    chillToFreeze: number;
    freezeDuration: number;
    shockBonus: number;
    shockDuration: number;
    hexBonus: number;
    hexDuration: number;
    staggerDuration: number;
    blindMiss: number;
    blindDuration: number;
  };
  reactions: {
    meltMult: number;
    shatterMult: number;
    overloadMult: number;
    overloadRadius: number;
    superconductFreeze: number;
    soulfireHeal: number;
  };
  arena: {
    /** Fixed simulation step in seconds. */
    step: number;
    width: number;
    height: number;
    packSpacing: number;
    minPackDistance: number;
  };
}

// ── Hero at runtime ────────────────────────────────────────────────────────

export interface HeroWeapon {
  baseId: string | null;
  kind: 'melee' | 'bolt';
  range: number;
  arc: number;
  speed: number;
  /** Element of basic attacks (the weapon's mana), or null when unarmed. */
  element: ManaType | null;
}

export interface HeroStats {
  maxHp: number;
  armor: number;
  /** Weapon damage per hit before multipliers. */
  weaponDamage: number;
  /** 1 + %damage / 100 */
  damageMult: number;
  /** Seconds between basic attacks after attack speed. */
  attackInterval: number;
  /** 0–1 */
  critChance: number;
  /** e.g. 1.5 = 150% */
  critMultiplier: number;
  /** 0–1 */
  dodge: number;
  /** 0–1 fraction of damage dealt */
  lifesteal: number;
  /** 0–1 fraction of max HP */
  healOnKill: number;
  thorns: number;
  /** Percentage points */
  magicFind: number;
  /** Percentage points */
  scrapFind: number;
  /** World units per second. */
  moveSpeed: number;
  /** Multiply cooldowns by this (1 = no reduction). */
  cooldownMult: number;
  /** Multiply mana regen by this. */
  manaRegenMult: number;
  weapon: HeroWeapon;
  /** Total attunement per mana type (item affinities + attunement affixes). */
  attunement: ManaMap;
  /** Extra damage fraction per element (0.2 = +20%). */
  elementPower: ManaMap;
  /** Equipped legendary powers → rolled value (best of duplicates). */
  legendaries: Record<string, number>;
}

// ── Dive & profile ─────────────────────────────────────────────────────────

export type DivePhase = 'fighting' | 'choosing' | 'dead' | 'extracted';

export interface DiveState {
  seed: number;
  startDepth: number;
  depth: number;
  /** 0–1 fraction of max HP, so gear swaps between floors never over/under-heal. */
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
  /** The best (highest rarity, then ilvl) item found this dive. */
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
  version: 2;
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
  /** Spells on the action bar (skill ids). */
  skillSlots: (string | null)[];
  /** Elemental reactions the player has triggered at least once. */
  reactionsSeen: string[];
  dive: DiveState | null;
}
