import type { EquippedGear, GearItem, GearSlot, HeroStatKey, Rarity } from './gear.js';
import type { ManaMap, ManaType } from './mana.js';
import type { AbilitySlot, ChainSkill, MoveKind } from './ability.js';

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

/** A basic blow's row: the weapon's (`delve.json` weapon `feel`) for its kind. */
export interface ComboStepDef {
  /** Share of the attack interval this blow takes: its cycle is `attackInterval × time`. */
  time: number;
  /** Share of the cycle before the strike (the startup). */
  startup: number;
  /**
   * Units of motion along the attack: a lunge over the startup (positive), or a
   * step back after the strike (negative). See the weapon flow spec.
   */
  move: number;
  /** Units of a sideways step after the strike (default 0); see `HeroWeapon.sway`. */
  side?: number;
  /** Units of a hop back, away from the attack, after the strike (default 0). */
  hop?: number;
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

/**
 * Which side a blow's side step takes when the steering doesn't pick one:
 * `alternate` flips each blow (the staff), `orbit` keeps the last side (the
 * wand, circling its target).
 */
export type WeaponSway = 'alternate' | 'orbit';

export interface GearBaseDef {
  id: string;
  slot: GearSlot;
  name: string;
  /** Weapons only: seconds between attacks. */
  attackInterval?: number;
  /** Weapons only: basic-attack profile. */
  attack?: WeaponAttackDef;
  /** Weapons only: a blow's row by its kind (else the hero's). */
  feel?: Record<MoveKind, ComboStepDef>;
  /** Weapons only: the basic chain a new hero gets (else the hero's). */
  defaultChain?: MoveKind[];
  /** Weapons only (every weapon has one): scales every hold's charge and every chain beat (1 = the sword's). */
  tempo?: number;
  /** Weapons only: the side a blow's side step takes when the steering doesn't pick one (default `alternate`). */
  sway?: WeaponSway;
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
  /** How long a form's recoil push takes. */
  recoilSeconds: number;
  /** How long a blow's step (its step back, side step and hop) takes, from the strike; a hold blow's leap too. */
  stepSeconds: number;
  /** A charged hold blow's leap shorter than this is skipped: it strikes as it is let go. */
  minLeap: number;
  /** Move speed multiplier while a swing, a charging hold blow, a wind-up or a charging hold runs. */
  actionMove: number;
  /** The steering's lateral part (of a full stick) that picks a side step's side. */
  sideSteer: number;
  /** Share of a basic blow's startup spent planted before its lunge moves. */
  lungeHold: number;
  /** A lunge stops when the gap between the hero's and the foe's edges is this small. */
  contactGap: number;
  /** Seconds a press waits past the end of whatever keeps the hero busy. */
  buffer: number;
  /** Knockback per weight step above Balanced, on direct hits. */
  heavyKnockback: number;
  /** A thrown Burst's minimum flight in seconds. */
  lobBase: number;
}

/** The Training Grounds (`delve.sandbox`): where the hero stands, and where dummies and spawns go. */
export interface SandboxBalance {
  /** A dummy's life is the reference monster's life at the depth times this. */
  dummyLifeMult: number;
  /** Where the hero stands (the arena is 26 × 40). */
  heroStart: [number, number];
  /** How far above the hero the first dummy stands (a row then runs to 7.8: on screen, and mostly in a Lance's 7.5 reach). */
  dummyDistance: number;
  /** Gap between dummies in a row: at least two monster radii (they don't touch), under `abilities.chainRange` (chains jump). */
  rowSpacing: number;
  /** How far a clump's dummies sit from its centre. */
  clumpRadius: number;
  /** Each new dummy group stands this much further sideways, alternating right and left (two clumps never touch). */
  groupSpacing: number;
  /** How far from the hero spawned monsters appear. */
  spawnRing: number;
  /** Dummies and spawns are kept this far inside the walls. */
  edgeMargin: number;
}

export interface DelveBalance {
  hero: {
    baseHp: number;
    baseCritChance: number;
    baseCritMultiplier: number;
    unarmedDamage: number;
    unarmedInterval: number;
    /** The basic chain restarts after a pause longer than the attack interval plus this. */
    basicComboGrace: number;
    /** Unarmed: a blow's row by its kind. */
    feel: Record<MoveKind, ComboStepDef>;
    /** Unarmed: the default basic chain. */
    defaultChain: MoveKind[];
    /** Unarmed: the tempo (see `GearBaseDef.tempo`). */
    tempo: number;
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
  /** Elemental affinity: the hero's two elements (see the elemental affinity spec). */
  pair: {
    /** Between dives, a bound secondary above this × the primary's attunement (and above 0) swaps in. */
    overtakeMargin: number;
    /** Basic blows gain this much damage per point of attunement in the element they strike with. */
    basicPowerPerAttune: number;
    /** Chance a drop takes one of the pair's elements (else the biome lean and a uniform roll). */
    dropBias: number;
    /** Of those, the share that takes the primary once a secondary is bound. */
    primaryShare: number;
    /** Mana Dust from salvaging an item outside the pair, by rarity. */
    salvageDust: Record<Rarity, number>;
    /** Mana Dust to re-attune an item to the pair's other element, by rarity. */
    reattuneDust: Record<Rarity, number>;
    /** What a Realign costs. */
    realignDust: number;
    realignScrap: number;
  };
  status: {
    /** A burn's ref: this fraction of the igniting hit (see `stacks.firePerStack`). */
    burnDps: number;
    freezeDuration: number;
    staggerDuration: number;
    blindMiss: number;
    blindDuration: number;
    /** A poison's ref: this fraction of the applying hit (see `stacks.poisonPerStack`). */
    poisonDps: number;
    rootDuration: number;
    /** Bosses are rooted for this fraction of `rootDuration`. */
    rootBossMult: number;
    /** Seconds a foe can't be staggered / frozen / rooted again after one ends. */
    staggerImmunity: number;
    freezeImmunity: number;
    rootImmunity: number;
  };
  /** Elemental stacks: what each hit applies, and what each count does (see the elemental stacks spec). */
  stacks: {
    /** Most stacks of one element on a foe (Nature's doubles with Plaguebearer). */
    cap: number;
    /** Seconds each element's stacks last; a new stack of it starts the timer again. */
    duration: Record<ManaType, number>;
    /** An ability's direct hit, by weight: Swift, Light, Balanced, Heavy, Crushing. */
    byWeight: number[];
    /** A basic blow's stacks, by its kind. */
    basicByKind: Record<MoveKind, number>;
    /** Every other hit that applies statuses: zone ticks, embers, chain jumps, retaliation… */
    tick: number;
    /**
     * How strong 1, 2, 3… stacks of a status are, in per-stack units (cumulative); past its end
     * each stack adds its last step (Plaguebearer's poison).
     */
    curve: number[];
    /** Frost stacks whose crossing freezes. */
    freezeAt: number;
    /** A burn deals its ref × this × `curve` per second. */
    firePerStack: number;
    frostSlowPerStack: number;
    frostSlowCap: number;
    /** Extra damage taken: this × `curve` (doubled by Tempest). */
    shockPerStack: number;
    /** Extra damage taken: this × `curve`. */
    hexPerStack: number;
    /** Poison deals its ref × this × `curve` per second. */
    poisonPerStack: number;
    /** Seconds after a reaction on a foe before another can fire on it. */
    reactionLockout: number;
  };
  reactions: {
    /** Melt, Shatter, Combust, Crystallize: the hit × (1 + (mult − 1) × pairs × Catalyst). */
    meltMult: number;
    shatterMult: number;
    /** Overload's blast: the hit × this × pairs × Catalyst. */
    overloadMult: number;
    overloadRadius: number;
    superconductFreeze: number;
    soulfireHeal: number;
    combustMult: number;
    combustRadius: number;
    blightRadius: number;
    /** Obsidian: a barrier worth this share of the hit, capped at `obsidianCap` × max life, for `obsidianDuration` s. */
    obsidianSoak: number;
    obsidianCap: number;
    obsidianDuration: number;
    /** Lightning Rod: a dodge charge back, and movement × (1 + `lightningRodMove`) for `lightningRodDuration` s. */
    lightningRodDuration: number;
    lightningRodMove: number;
    /** Sunder: every later hit on the foe deals × (1 + `sunderBonus`) for `sunderDuration` s. */
    sunderDuration: number;
    sunderBonus: number;
    /** Seedling: a health orb worth this share of max life. */
    seedlingHeal: number;
    /** Siphon: three motes worth this share of the mana pool between them. */
    siphonMana: number;
    /** Crystallize: per pair as `meltMult`, and `stacks.tick` frost stacks on foes within `crystallizeRadius`. */
    crystallizeMult: number;
    crystallizeRadius: number;
    /** Blackout: the foe and foes within this radius are blinded. */
    blackoutRadius: number;
    /** Galvanize: seconds off each ability still cooling down (a charge slot gains a unit instead). */
    galvanizeSeconds: number;
    /** Seconds before a buff reaction (Obsidian, Lightning Rod, Seedling, Siphon, Galvanize) can fire again. */
    reactionCooldown: number;
  };
  abilities: DelveAbilityBalance;
  /** Moves and chains (see the moves and chains spec). */
  chains: {
    /** Most slots each skill's chain can grow to on a weapon (at most `MAX_CHAIN`). */
    cap: Record<ChainSkill, number>;
    /** The weight each kind resolves at: every per-weight table reads through it. */
    kindWeight: Record<Exclude<MoveKind, 'hold'>, number>;
    /** A hold's three stages' weights. */
    holdStageWeight: number[];
    /** Seconds a hold takes to charge fully, times the hero's tempo. */
    holdTime: number;
    /** A hold still charging this many seconds (times the tempo) after it began fires by itself at stage 2. */
    holdMax: number;
    /** The charge (0..1) at which a hold reaches stage 1, then stage 2 (full power: 1, the full charge). */
    holdStages: number[];
    /** Move `i` (from 0) lands at power × (1 + this × i) and size × (1 + this × i / 2). */
    stepBonus: number;
    /**
     * The beat: seconds a slot waits after a move lands before its chain's next
     * move, by the kind the move played as, times `beatSlot` and the hero's
     * tempo (`beatFor`; see the chain feel spec).
     */
    beat: Record<MoveKind, number>;
    beatSlot: Record<AbilitySlot, number>;
  };
  /** Weapon movesets: which chains a weapon carries, its slots and their prices (see the weapon movesets spec). */
  movesets: {
    /** The chains a weapon of each rarity carries (unarmed: basic and primary). */
    carries: Record<Rarity, ChainSkill[]>;
    /** Extra slots a weapon drop rolls, least and most, by rarity. */
    extraSlots: Record<Rarity, [number, number]>;
    /** Links a new slot costs, by its position: the 2nd slot's first. */
    slotLinks: number[];
    /** Scrap a new slot costs, by its position as `slotLinks`. */
    slotScrap: number[];
    /** Mana Dust a changed, moved, added or removed move costs, or a changed payment. */
    editDust: number;
    /** Mana Dust a move's changed elements cost, or a new move's elements that no old move has. */
    elementDust: number;
    /** Scrap a transfer costs for each extra slot that moves. */
    transferScrap: number;
  };
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
  sandbox: SandboxBalance;
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

/** One blow of the hero's basic chain: the weapon's row for its kind, in its element. */
export interface HeroBlow extends ComboStepDef {
  kind: MoveKind;
  element: ManaType;
  /** Its damage multiplier: 1 + basicPowerPerAttune × its element's attunement (1 without a pair). */
  attunePower: number;
}

export interface HeroWeapon {
  baseId: string | null;
  kind: 'melee' | 'bolt';
  range: number;
  arc: number;
  speed: number;
  pierce: boolean;
  /** The side a side step takes when the steering doesn't pick one. */
  sway: WeaponSway;
  /** A blow's row by its kind (a manual hold blow's stages read medium, heavy and hold). */
  feel: Record<MoveKind, ComboStepDef>;
  /** The basic chain, one entry per blow (see the moves and chains spec). */
  blows: HeroBlow[];
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
  /**
   * The weapon's tempo (the hero's unarmed): every hold's charge and auto-fire
   * time and every chain beat scale by it. Gear modifiers would multiply in here.
   */
  tempo: number;
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

/** A stop's power-up: equip a bag item, add a slot, adjust one move, or upgrade an item. */
export type StopKind = 'equip' | 'slot' | 'move' | 'upgrade';

/** A stop between depths (see the weapon movesets spec): the kinds offered, and whether one is taken. */
export interface DiveStop {
  offers: StopKind[];
  taken: boolean;
}

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
  /** Mana Dust from gear salvaged while banking this dive (auto-salvage, full bag). */
  dustEarned: number;
  /** Links from weapons salvaged while banking this dive (auto-salvage, full bag). */
  linksEarned: number;
  /** The door screen's stop: the power-up offered after the depth just cleared (null: none). */
  stop: DiveStop | null;
  found: Record<Rarity, number>;
  /** The best (highest rarity, then ilvl) item found this dive. */
  bestFind: GearItem | null;
}

/** The hero's two elements (`DelveProfile.pair`). */
export interface ManaPair {
  /** Null only before the "Choose your mana" screen. */
  primary: ManaType | null;
  /** The bound second element, or null until one is bound. */
  secondary: ManaType | null;
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
  version: 6;
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
  /** The hero's two elements. */
  pair: ManaPair;
  /** From salvaging gear outside the pair; spent on Re-attune, Realign and edits to a moveset. */
  manaDust: number;
  /** From salvaging weapons with extra slots; spent on a weapon's new slots (see the weapon movesets spec). */
  links: number;
  /** Elemental reactions the player has triggered at least once. */
  reactionsSeen: string[];
  dive: DiveState | null;
}
