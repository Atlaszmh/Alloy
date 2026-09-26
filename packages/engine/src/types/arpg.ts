import type { SeededRNG } from '../rng/seeded-rng.js';
import type { DoorDef, HeroStats, MonsterAi, MonsterTrait } from './delve.js';
import type { GearItem, Rarity } from './gear.js';
import type { ManaType } from './mana.js';
import type { AbilityCast, AbilitySlot, FormId, Knobs, ResolvedAbility } from './ability.js';

// ── Data definitions (arpg.json) ───────────────────────────────────────────

export type StatusId =
  | 'burn'
  | 'chill'
  | 'freeze'
  | 'shock'
  | 'hex'
  | 'stagger'
  | 'blind'
  | 'brand'
  | 'poison'
  | 'root';

export type ReactionId =
  | 'melt'
  | 'shatter'
  | 'overload'
  | 'superconduct'
  | 'soulfire'
  | 'combust'
  | 'blight';

/** An ability form: what the ability does. Values are before weight, payment and knobs. */
export interface FormDef {
  id: FormId;
  slot: AbilitySlot;
  name: string;
  icon: string;
  text: string;
  /** Damage as a multiple of weapon damage (ward burst, armor retaliation, blink trail for defensives). */
  power: number;
  /**
   * A defensive form's magnitude: ward absorb (fraction of max life), armor
   * reduction, surge attack speed, blink untouchable seconds.
   */
  effect?: number;
  range?: number;
  radius?: number;
  speed?: number;
  count?: number;
  duration?: number;
  tick?: number;
  /** Melee arc in degrees. */
  arc?: number;
  /** Press-combo multipliers for power and size (Primary forms). */
  combo?: number[];
  /** Press-combo projectile counts (Volley). */
  comboCount?: number[];
  /** Units the hero moves when casting: positive steps in over the conjure, negative recoils after the release. */
  motion?: number;
}

/** What an element adds to any ability built with it. */
export interface ElementTraitDef {
  knobs: Partial<Knobs>;
  /** Player-facing effect on offensive forms. */
  text: string;
  /** Player-facing effect on defensive forms. */
  defensive: string;
}

/** What a pair of elements adds on top of both elements' traits. */
export interface FusionDef {
  id: string;
  elements: [ManaType, ManaType];
  name: string;
  icon: string;
  text: string;
  knobs: Partial<Knobs>;
}

export interface ReactionDef {
  id: ReactionId;
  name: string;
  icon: string;
  text: string;
}

export interface MasteryDef {
  mana: ManaType;
  name: string;
  text: string;
}

export interface ManaInfo {
  name: string;
  icon: string;
  color: string;
}

export interface ArpgData {
  mana: Record<ManaType, ManaInfo>;
  /** Monsters of the key element take extra damage from the value element. */
  weakness: Record<ManaType, ManaType>;
  forms: FormDef[];
  elementTraits: Record<ManaType, ElementTraitDef>;
  fusions: FusionDef[];
  reactions: ReactionDef[];
  masteries: MasteryDef[];
}

// ── World runtime ──────────────────────────────────────────────────────────

export interface Vec {
  x: number;
  y: number;
}

export type MonsterKind = 'normal' | 'elite' | 'boss';

export interface StatusState {
  burnDps: number;
  burnUntil: number;
  burnTickAt: number;
  chillStacks: number;
  chillUntil: number;
  freezeUntil: number;
  shockUntil: number;
  hexUntil: number;
  staggerUntil: number;
  blindUntil: number;
  brandUntil: number;
  poisonStacks: number;
  /** Damage per second per stack. */
  poisonDps: number;
  poisonUntil: number;
  poisonTickAt: number;
  rootUntil: number;
  /** Crowd-control immunity after a stagger, freeze or root ends, so spam can't lock a foe. */
  staggerImmuneUntil: number;
  freezeImmuneUntil: number;
  rootImmuneUntil: number;
}

export interface MonsterEntity {
  id: number;
  defId: string;
  name: string;
  icon: string;
  kind: MonsterKind;
  element: ManaType;
  ai: MonsterAi;
  traits: MonsterTrait[];
  packId: number;
  x: number;
  y: number;
  radius: number;
  /** World units per second. */
  speed: number;
  hp: number;
  maxHp: number;
  damage: number;
  attackInterval: number;
  attackRange: number;
  aggro: boolean;
  aggroAt: number;
  nextAttackAt: number;
  /** While > t the monster is winding up an attack (telegraphed). */
  windupUntil: number;
  windupStart: number;
  /** Charger dash: active while > t. */
  chargeUntil: number;
  chargeDir: Vec;
  chargeHit: boolean;
  /** Knockback velocity, decays quickly. */
  kbx: number;
  kby: number;
  status: StatusState;
  lastHitAt: number;
  /** Boss special-attack clock. */
  nextSpecialAt: number;
  dead: boolean;
}

export interface Projectile {
  id: number;
  owner: 'hero' | 'monster';
  /** The ability form that fired it, 'ember' (Pyroclasm), or null for a basic-attack bolt / monster shot. */
  form: FormId | 'ember' | null;
  /** The hero ability behind it (its knobs decide what an impact does). */
  ability: ResolvedAbility | null;
  /** Volley: the foe this dart homes in on. */
  homingId: number | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  element: ManaType | null;
  pierce: boolean;
  hitIds: number[];
  maxDist: number;
  traveled: number;
  explodeRadius: number;
  applies: StatusId[];
  knockback: number;
  /** How hard its hit lands (client feel). */
  heft?: number;
  dead: boolean;
}

export interface Zone {
  id: number;
  owner: 'hero' | 'monster';
  /** What left it: a form ('maelstrom', 'barrage') or a fusion ('magma', 'rimebloom'…), for VFX. */
  source: string | null;
  /** The hero ability behind it; a hero zone with `detonateAt` lands as one impact (Barrage). */
  ability: ResolvedAbility | null;
  x: number;
  y: number;
  radius: number;
  born: number;
  until: number;
  /** Lingering damage zones tick; monster telegraphs detonate once. */
  tick: number;
  nextTick: number;
  damage: number;
  element: ManaType | null;
  applies: StatusId[];
  /** Telegraph / Barrage impact: explodes at this time (0 = lingering zone). */
  detonateAt: number;
  /** A thrown Burst: where it was thrown from (for the arc). */
  fromX?: number;
  fromY?: number;
  /** How hard its landing hits (client feel). */
  heft?: number;
  dead: boolean;
}

export type DropKind = 'item' | 'mote' | 'orb' | 'scrap';

export interface Drop {
  id: number;
  kind: DropKind;
  x: number;
  y: number;
  item?: GearItem;
  mana?: ManaType;
  amount: number;
  born: number;
  /** Pulled to the hero regardless of distance (floor cleared). */
  vacuum: boolean;
  dead: boolean;
}

export interface HeroEntity {
  x: number;
  y: number;
  radius: number;
  facing: Vec;
  hp: number;
  stats: HeroStats;
  /** The one mana pool: basic hits fill it, abilities spend it. */
  mana: number;
  manaMax: number;
  /** Mana per second. */
  manaRegen: number;
  /** Primary, Defensive, Ultimate. */
  abilities: ResolvedAbility[];
  /** Per slot: time it is ready again. */
  cooldowns: number[];
  /** Per slot: charge units banked (charge payment). */
  charge: number[];
  /** Per slot: combo step of the last press and when it was pressed. */
  comboStep: number[];
  comboAt: number[];
  /** A cast-paid ability winding up; the hero can't move or attack meanwhile. */
  windup: {
    slot: number;
    aim: Vec | null;
    /** Where the press aimed (the fallback if auto-aim finds nothing at landing). */
    at: Vec;
    start: number;
    until: number;
  } | null;
  /** A basic attack in its startup: the blow lands at `strikeAt`. */
  swing: {
    step: number;
    dir: Vec;
    targetId: number | null;
    start: number;
    strikeAt: number;
    /** Committed swings root the hero, lunge and leave a recovery (automatic swings on the move don't). */
    committed: boolean;
  } | null;
  /** Motion an action imposes (a lunge, a step-in or a recoil), placed by progress; it replaces move input. */
  push: {
    fromX: number;
    fromY: number;
    dx: number;
    dy: number;
    start: number;
    until: number;
    /** Stop at this foe's edge (a lunge), or null. */
    stopId: number | null;
  } | null;
  /** Movement is slowed until this time (after a strike or a landed ability). */
  recoverUntil: number;
  /** The active defensive (Ward, Armor, Surge; Blink's trail effects). */
  defend: { form: FormId; until: number } | null;
  ward: { hp: number; max: number } | null;
  dodgeCharges: number;
  /** When the next dodge charge arrives (0 = full). */
  dodgeRechargeAt: number;
  /**
   * The last dodge, kept after the dash ends so a perfect dodge can be judged
   * from its start. The hero is dashing while `t < until`.
   */
  dodge: {
    dir: Vec;
    fromX: number;
    fromY: number;
    start: number;
    until: number;
    /** This dodge already paid out its perfect dodge. */
    perfect: boolean;
  } | null;
  /** The next real hit before this time crits and staggers. */
  riposteUntil: number;
  nextAttackAt: number;
  /** Blows landed in the current string (resets after a pause). */
  attackCount: number;
  lastBasicAt: number;
  potions: number;
  invulnUntil: number;
  phoenixAvailable: boolean;
  phoenixUsed: boolean;
  lastHitAt: number;
  moving: boolean;
}

export interface ArpgInput {
  /** Desired direction; length is clamped to 1. Zero = stand still. */
  move: Vec;
  /** Ability to use this step (0 Primary, 1 Defensive, 2 Ultimate), with an optional aim point. */
  cast?: AbilityCast | null;
  potion?: boolean;
  /** Dodge this step (the dash follows `move`, or runs from the nearest foe). */
  dodge?: boolean;
  /**
   * Manual basic attacks: whether the attack is held (or was tapped) this
   * frame. Leave undefined for automatic basic attacks.
   */
  attack?: boolean;
  /** Manual attacks: the attack was pressed this frame (kept briefly if the hero is busy). */
  attackTap?: boolean;
  /** Manual attacks: aim at this world point (else the nearest foe in reach, else ahead). */
  attackAim?: Vec | null;
}

export type ArpgEvent =
  | {
      kind: 'hit';
      id: number;
      x: number;
      y: number;
      amount: number;
      crit: boolean;
      element: ManaType | null;
      reaction?: ReactionId;
      heft: number;
    }
  | {
      kind: 'heroHit';
      x: number;
      y: number;
      amount: number;
      dodged: boolean;
      element: ManaType | null;
    }
  | { kind: 'heal'; amount: number; source: 'lifesteal' | 'potion' | 'kill' | 'orb' | 'soulfire' }
  | {
      kind: 'cast';
      slot: number;
      name: string;
      form: FormId;
      element: ManaType;
      x: number;
      y: number;
      tx: number;
      ty: number;
      heft: number;
    }
  | { kind: 'windup'; slot: number; until: number; heft: number }
  | { kind: 'buff'; form: FormId; element: ManaType; until: number }
  | { kind: 'wardBreak'; x: number; y: number; element: ManaType }
  | { kind: 'beam'; x: number; y: number; tx: number; ty: number; width: number; element: ManaType }
  | { kind: 'slash'; x: number; y: number; dir: Vec; range: number; arc: number; element: ManaType }
  | {
      kind: 'basic';
      x: number;
      y: number;
      tx: number;
      ty: number;
      element: ManaType | null;
      melee: boolean;
    }
  | { kind: 'chain'; points: Vec[]; element: ManaType }
  | { kind: 'explode'; x: number; y: number; radius: number; element: ManaType | null }
  | { kind: 'reaction'; reaction: ReactionId; x: number; y: number }
  | { kind: 'freeze'; id: number }
  | { kind: 'death'; id: number; x: number; y: number; monsterKind: MonsterKind; scrap: number }
  | { kind: 'drop'; dropId: number; x: number; y: number; dropKind: DropKind; rarity?: Rarity }
  | {
      kind: 'pickup';
      dropId: number;
      dropKind: DropKind;
      item?: GearItem;
      amount: number;
      mana?: ManaType;
    }
  | { kind: 'dash'; fromX: number; fromY: number; toX: number; toY: number }
  | { kind: 'noMana'; slot: number }
  | { kind: 'dodge'; fromX: number; fromY: number; dirX: number; dirY: number }
  | { kind: 'perfectDodge'; x: number; y: number }
  | { kind: 'cleared' }
  | { kind: 'revive'; amount: number }
  | { kind: 'heroDeath' };

export interface LootContext {
  pity: number;
  nextUid: number;
  magicFind: number;
  legendaryBoost: number;
  dropMult: number;
  /** First boss kill ever drops a guaranteed legendary. */
  forceLegendary: boolean;
}

export interface WorldPending {
  items: GearItem[];
  scrap: number;
  kills: number;
  reactions: ReactionId[];
}

export interface ArpgWorld {
  t: number;
  accumulator: number;
  rng: SeededRNG;
  lootRng: SeededRNG;
  depth: number;
  biomeId: string;
  element: ManaType;
  door: DoorDef | null;
  width: number;
  height: number;
  hero: HeroEntity;
  monsters: MonsterEntity[];
  projectiles: Projectile[];
  zones: Zone[];
  drops: Drop[];
  nextId: number;
  loot: LootContext;
  /** Rewards collected since the last bank into the profile. */
  pending: WorldPending;
  totalMonsters: number;
  bossId: number | null;
  /** One-shot inputs waiting for the next simulation step. */
  queuedCast: AbilityCast | null;
  /** The queued cast is dropped after this time: the end of whatever kept the hero busy, plus the buffer. */
  queuedCastUntil: number;
  /** A manual attack tap waiting for the weapon (see `queuedCastUntil`). */
  queuedAttack: { until: number; aim: Vec | null } | null;
  queuedPotion: boolean;
  queuedDodge: boolean;
  kills: number;
  bossKilled: boolean;
  cleared: boolean;
  clearedAt: number;
  heroDead: boolean;
}
