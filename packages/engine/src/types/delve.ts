import type { EquippedGear, GearItem, GearSlot, HeroStatKey, Rarity } from './gear.js';
import type { ManaMap, ManaType } from './mana.js';
import type { AbilityBuilds, AbilitySlot } from './ability.js';

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
  /** Bolts pass through every foe (bows). */
  pierce?: boolean;
}

/** One blow of a weapon's basic-attack string (`delve.json` weapon `combo`). */
export interface ComboStepDef {
  /** Share of the attack interval this blow takes: its cycle is `attackInterval × time`. */
  time: number;
  /** Share of the cycle before the strike (the startup). */
  startup: number;
  /** Units of motion: a lunge over the startup (melee) or a recoil after the release (negative, ranged). */
  move: number;
  /** Damage multiplier. */
  power: number;
  /** 0–1: how hard it lands (hit-stop, camera kick; never the rules). */
  heft: number;
  /** Melee: swing arc in degrees (defaults to the weapon's). */
  arc?: number;
  /** Melee: extra range, added to the weapon's. */
  reach?: number;
  /** Shove on hit, in units. */
  knockback?: number;
  /** The blow staggers what it hits. */
  stagger?: boolean;
  /** Ranged: projectile size multiplier. */
  size?: number;
  /** Ranged: the shot bursts over this radius on its first hit or at the end of its flight. */
  explode?: number;
  /** Ranged: projectile speed multiplier. */
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
  /** Weapons only: the basic-attack string (else the hero's default string). */
  combo?: ComboStepDef[];
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

/** Numbers that turn an ability build into costs, cooldowns and power. */
export interface DelveAbilityBalance {
  slots: Record<AbilitySlot, { cost: number; cooldown: number; castTime: number }>;
  /** Per weight step (-2..2): each value scales by (1 + k × weight); speed by (1 - k × weight). */
  weight: {
    power: number;
    cost: number;
    cooldown: number;
    size: number;
    speed: number;
    castTime: number;
  };
  castManaMult: number;
  castPowerMult: number;
  /** A charge-paid ability needs its mana cost × this in charge units. */
  chargeRatio: number;
  /** Charge units per second with no foe within `lullRadius`. */
  lullCharge: number;
  lullRadius: number;
  /** Seconds after a charge-paid ability fires before it can charge again. */
  chargeLockout: number;
  /** Seconds to press again to continue a combo. */
  comboWindow: number;
  chainRange: number;
  /** Damage kept per chain jump. */
  chainPower: number;
  /** Scatter moves impacts up to scatter × radius × this. */
  scatterReach: number;
  /** Defensive element effects while a defensive is active. */
  defend: {
    earthReduction: number;
    shadowLifesteal: number;
    natureRegen: number;
    surgeMove: number;
    blinkSeconds: number;
  };
}

/** Combat weight: action timing and motion. Arrays run Swift → Crushing (ability weight −2..2). */
export interface FeelBalance {
  /** Conjure seconds by ability weight. */
  conjure: number[];
  /** Conjure multiplier per ability slot. */
  conjureSlot: Record<AbilitySlot, number>;
  /** Slowed seconds after an ability lands, by weight (the Defensive has none). */
  recovery: number[];
  /** Ability heft by weight. */
  heft: number[];
  /** Move speed multiplier during a recovery. */
  recoveryMove: number;
  /** Share of a basic's cycle after its strike spent recovering. */
  basicRecovery: number;
  /** Ability motion grows by this per weight step. */
  motionPerWeight: number;
  /** How long a recoil push takes. */
  recoilSeconds: number;
  /** A lunge stops when the gap between the hero's and the foe's edges is this small. */
  contactGap: number;
  /** Seconds a press waits past the end of whatever keeps the hero busy. */
  buffer: number;
  /** Knockback per weight step above Balanced, on direct hits. */
  heavyKnockback: number;
  /** A thrown Burst's minimum flight in seconds. */
  lobBase: number;
}

export interface DelveBalance {
  hero: {
    baseHp: number;
    baseCritChance: number;
    baseCritMultiplier: number;
    unarmedDamage: number;
    unarmedInterval: number;
    /** The melee combo resets after a pause longer than the attack interval plus this. */
    basicComboGrace: number;
    /** The string for weapons without one (and unarmed). */
    defaultCombo: ComboStepDef[];
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
    /** A type at this attunement grants its mastery passive. */
    masteryThreshold: number;
    /** Ability damage bonus per point of attunement in its element(s), averaged. */
    powerPerAttune: number;
    /** Mana pool: basePool + poolPerAttune × total attunement. */
    basePool: number;
    poolPerAttune: number;
    baseRegen: number;
    regenPerAttune: number;
    /** Mana gained per basic attack. */
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
    /** Each poison stack deals this fraction of the hit per second. */
    poisonDps: number;
    poisonDuration: number;
    poisonMaxStacks: number;
    rootDuration: number;
    /** Bosses are rooted for this fraction of `rootDuration`. */
    rootBossMult: number;
    /** Seconds a foe can't be staggered / frozen / rooted again after one ends. */
    staggerImmunity: number;
    freezeImmunity: number;
    rootImmunity: number;
  };
  reactions: {
    meltMult: number;
    shatterMult: number;
    overloadMult: number;
    overloadRadius: number;
    superconductFreeze: number;
    soulfireHeal: number;
    combustMult: number;
    combustRadius: number;
    blightRadius: number;
  };
  abilities: DelveAbilityBalance;
  /** The dodge: charges, the dash, i-frames and the perfect-dodge windows (seconds / units). */
  dodge: {
    charges: number;
    /** Seconds per charge, refilled one at a time. */
    recharge: number;
    distance: number;
    duration: number;
    iframes: number;
    /** A hit this soon after the dodge starts is a perfect dodge. */
    perfectWindow: number;
    /** How long the riposte (next real hit crits and staggers) stays armed. */
    riposteWindow: number;
  };
  feel: FeelBalance;
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
  pierce: boolean;
  /** Element of basic attacks (the weapon's mana), or null when unarmed. */
  element: ManaType | null;
  /** The basic-attack string, one entry per blow. */
  combo: ComboStepDef[];
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
  version: 3;
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
  /** The Primary, Defensive and Ultimate builds. */
  abilities: AbilityBuilds;
  /** Elemental reactions the player has triggered at least once. */
  reactionsSeen: string[];
  dive: DiveState | null;
}
