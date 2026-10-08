import type { SeededRNG } from '../rng/seeded-rng.js';
import type { DoorDef, HeroStats, MonsterAi, MonsterTrait } from './delve.js';
import type { GearItem, Rarity } from './gear.js';
import type { ManaType } from './mana.js';
import type { RuneDef, RuneRef } from './rune.js';
import type { Haul, MaterialRef } from './crafting.js';
import type { QuestEvent } from './quests.js';
import type { FloorMap, InteractableKind } from './floor-map.js';
import type { BoonSum, Buff } from './boon.js';
import type { WorldTutorial } from './tutorial.js';
import type { TutorialScript } from './tutorial-floor.js';
import type {
  AbilityCast,
  AbilitySlot,
  FormClass,
  FormId,
  Knobs,
  KnobsData,
  MoveKind,
  ResolvedAbility,
  ResolvedChain,
} from './ability.js';

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
  | 'blight'
  | 'obsidian'
  | 'lightning_rod'
  | 'sunder'
  | 'seedling'
  | 'siphon'
  | 'crystallize'
  | 'blackout'
  | 'galvanize';

/** An ability form: what the ability does. Values are before weight, payment and knobs. */
export interface FormDef {
  id: FormId;
  slot: AbilitySlot;
  /** The weapon class that expresses it, or both (the constructs spec §2.1). */
  class: FormClass;
  /** A shared form's melee version (spec §2.2): what differs when a melee weapon casts it. B1 fills the rows. */
  melee?: { range?: number; radius?: number; motion?: number; speed?: number; text?: string };
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
  /** The form's default chain: new heroes' and migrated builds' moves (see the moves and chains spec). */
  defaultChain: MoveKind[];
  /** Projectiles by kind (Volley; a hold's stages count as medium, heavy and hold). */
  countByKind?: Record<MoveKind, number>;
  /** Units the hero moves when casting: positive steps in over the conjure, negative recoils after the release. */
  motion?: number;
}

/** A cast style's numbers: factors on the form's base (1 = unchanged). */
export interface StyleNumbers {
  windup: number;
  cooldown: number;
  power: number;
  range: number;
  radius: number;
  speed: number;
  duration: number;
}
/** How a cast style moves the hero as it casts (the weapon flow's pushes; B1 wires them). */
export type StyleMotion = 'none' | 'dart' | 'step' | 'wade' | 'plant' | 'sway' | 'orbit' | 'back';
/** A cast style's motif, client-only: drawn on its casts' shots and impacts (the constructs spec §4.2). */
export type StyleLook = 'blade' | 'crescent' | 'hatchet' | 'stone' | 'orb' | 'spark' | 'arrow';

/** A weapon's cast style (the constructs spec §4): how it expresses every ability form. */
export interface CastStyle {
  name: string;
  numbers: StyleNumbers;
  motion: StyleMotion;
  /** Merged first, like a built-in rune that costs nothing. */
  trait: KnobsData;
  look: StyleLook;
}

/** What an element adds to any ability built with it. */
export interface ElementTraitDef {
  knobs: KnobsData;
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
  knobs: KnobsData;
}

/** A hit of either element pairs its stacks off with the other's on a foe to set it off (see the elemental stacks spec). */
export interface ReactionDef {
  id: ReactionId;
  elements: [ManaType, ManaType];
  name: string;
  icon: string;
  text: string;
  /** A buff reaction: after it fires it can't again for `reactionCooldown` seconds. */
  cooldown?: true;
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
  /** `runes.json`'s runes (see the runes spec). */
  runes: RuneDef[];
}

// ── World runtime ──────────────────────────────────────────────────────────

export interface Vec {
  x: number;
  y: number;
}

export type MonsterKind = 'normal' | 'elite' | 'boss';

export interface StatusState {
  /** Elemental stacks per element (0 to the cap): the count is the status and its strength. */
  stacks: Record<ManaType, number>;
  /** When each element's stacks lapse, all together; a new stack of it pushes this back. */
  stackUntil: Record<ManaType, number>;
  /** The strongest applying hit × `status.burnDps`: a burn deals `firePerStack` × `curve` of it a second. */
  burnRef: number;
  burnTickAt: number;
  /** The ability slot whose burn set `burnRef` (undefined: a basic's, or no slot's); its ticks carry it. */
  burnSlot: number | undefined;
  freezeUntil: number;
  staggerUntil: number;
  /** Sunder: every hit on the foe deals more until this time. */
  sunderUntil: number;
  blindUntil: number;
  brandUntil: number;
  /** The strongest applying hit × `status.poisonDps`: poison deals `poisonPerStack` × `curve` of it a second. */
  poisonRef: number;
  poisonTickAt: number;
  /** The ability slot whose poison set `poisonRef` (see `burnSlot`). */
  poisonSlot: number | undefined;
  rootUntil: number;
  /** Crowd-control immunity after a stagger, freeze or root ends, so spam can't lock a foe. */
  staggerImmuneUntil: number;
  freezeImmuneUntil: number;
  rootImmuneUntil: number;
  /** No reaction fires on the foe before this time (`stacks.reactionLockout` after one does). */
  reactionLockUntil: number;
}

/**
 * The pack director's jobs (see the room objects spec): a ring slot round the
 * hero, a flanker's intercept, a ranged foe's cover, a charger's lane.
 */
export const PACK_JOBS = ['ring', 'flank', 'cover', 'charge'] as const;
export type PackJob = (typeof PACK_JOBS)[number];

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
  /** Its room on a generated floor (see the floor maps spec); null in the open room. */
  roomId: number | null;
  /** Since when it has been beyond its leash (`terrain.leashMargin` outside its room's rect), else null. */
  farSince: number | null;
  /** Leashed: going home along its room's `homeField`, to heal and sleep. */
  goingHome: boolean;
  /** Its job from the pack director (see the room objects spec), or null. */
  job: PackJob | null;
  /**
   * Where it walks instead of at the hero: its job's spot, or the last-seen
   * point a foliage search goes to (a search's wins); null: at the hero.
   */
  goal: Vec | null;
  /** It lost the hero to foliage: searching `at` (where it was last seen) until `until`. */
  search: { at: Vec; until: number } | null;
  /** It spawned hidden in foliage, asleep, until the hero comes near or its room wakes. */
  ambush: boolean;
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
  /** The hit that set its knockback going (a wall slam deals a share of it); 0: none. */
  kbHit: number;
  status: StatusState;
  lastHitAt: number;
  /** Boss special-attack clock. */
  nextSpecialAt: number;
  dead: boolean;
  /** A training dummy: where it stands, and the element it resists (null = Neutral). Null for real monsters. */
  dummy: { homeX: number; homeY: number; element: ManaType | null } | null;
  /** A hand-built floor's foe: its spawn's id (`TutorialSpawn.id`; see the tutorial spec). */
  spawnId?: string;
  /** A scripted foe's script (a hand-built floor's). */
  script?: TutorialScript;
}

export interface Projectile {
  id: number;
  owner: 'hero' | 'monster';
  /**
   * The ability form that fired it, 'ember' (Pyroclasm), 'shard' (Split's), or
   * null for a basic-attack bolt / monster shot.
   */
  form: FormId | 'ember' | 'shard' | null;
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
  /** Spawned piercing: such a shot never bursts at the end of its flight. */
  pierce: boolean;
  /** Foes it may still pass; a hit with none left ends it (Infinity: all). */
  pierceLeft: number;
  hitIds: number[];
  maxDist: number;
  traveled: number;
  explodeRadius: number;
  applies: StatusId[];
  knockback: number;
  /** How hard its hit lands (client feel). */
  heft?: number;
  /** A basic shot from an Earth source: its stagger rattles (see `HitOpts.rattles`). */
  rattles?: boolean;
  /** A basic shot's stacks (see `HitOpts.stacks`). */
  stacks?: number;
  /** A Twin Fang echo: its hit pairs nothing (see `HitOpts.noReact`). */
  noReact?: boolean;
  /** A basic shot's blow knobs (its runes'; see the runes spec). */
  knobs?: Knobs;
  /** An Echo's basic shot: it sets no room object off (an ability's says so on `ability.replay`). */
  replay?: boolean;
  /** A heavy or hold basic shot: it wears crumbling cover where it bursts or stops at a wall. */
  wears?: boolean;
  dead: boolean;
}

export interface Zone {
  id: number;
  owner: 'hero' | 'monster';
  /** What left it: a form ('maelstrom', 'barrage') or a fusion ('magma', 'rimebloom'…), for VFX. */
  source: string | null;
  /** The hero ability behind it; a hero zone with `detonateAt` lands as one impact (Barrage, a thrown Burst). */
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
  /** Telegraph / Barrage impact / thrown Burst: explodes at this time (0 = lingering zone). */
  detonateAt: number;
  /** A thrown Burst: where it was thrown from (for the arc). */
  fromX?: number;
  fromY?: number;
  /** How hard its landing hits (client feel). */
  heft?: number;
  dead: boolean;
}

export type DropKind = 'item' | 'mote' | 'orb' | 'scrap' | 'rune' | 'material' | 'pattern';

export interface Drop {
  id: number;
  kind: DropKind;
  x: number;
  y: number;
  item?: GearItem;
  mana?: ManaType;
  /** A rune drop's rune (kind `'rune'`). */
  rune?: RuneRef;
  /** A material drop's material (kind `'material'`; see the crafting spec). */
  material?: MaterialRef;
  /** A pattern drop's base id (kind `'pattern'`): learned when it banks. */
  pattern?: string;
  /** The room of the foe it fell from (none: a hall's, or the open room's): its last kill pulls it in. */
  roomId?: number;
  amount: number;
  born: number;
  /** Pulled to the hero regardless of distance (floor cleared). */
  vacuum: boolean;
  dead: boolean;
}

/** A breakable prop (see the room objects spec): a fixed circle that stops bodies and shots, never sight. */
export interface PropEntity {
  type: 'prop';
  id: number;
  /** Its `setpieces.json → props` id. */
  kind: string;
  x: number;
  y: number;
  radius: number;
  life: number;
  /** Broken (its `propBreak` event plays the break). */
  dead: boolean;
}

/** A hazard's state: ready to be set off, primed (its fuse burning), or dormant (recharging). */
export type HazardState = 'ready' | 'primed' | 'dormant';

/** An elemental hazard (see the room objects spec): a fixed circle any hit sets off; its burst hits everyone. */
export interface HazardEntity {
  type: 'hazard';
  id: number;
  /** Its `setpieces.json → hazards` id. */
  kind: string;
  element: ManaType;
  x: number;
  y: number;
  /** Its body. */
  radius: number;
  /** Its burst's reach. */
  burst: number;
  state: HazardState;
  /** Primed: when it bursts; dormant: when it is ready again. */
  until: number;
}

/**
 * What made a push, which decides what ends it: `lunge` a swing's (a hold
 * blow's leap too), `stepIn` a form's over its conjure, `step` a blow's step
 * after its strike or a form's recoil (see the weapon flow spec).
 */
export type PushKind = 'lunge' | 'stepIn' | 'step';

/**
 * Motion an action adds on top of the steering: `dx`, `dy` (its direction
 * times its distance) from `start` to `until`, each tick's slice by its
 * progress (`done`, 0..1). `movedX`, `movedY` are what it has actually
 * moved the hero, after the steering's projection, clamping and cuts.
 */
export interface Push {
  kind: PushKind;
  dx: number;
  dy: number;
  start: number;
  until: number;
  /** Stop at this foe's contact gap (a lunge, a step-in), or null. */
  stopId: number | null;
  done: number;
  movedX: number;
  movedY: number;
}

export interface HeroEntity {
  x: number;
  y: number;
  radius: number;
  facing: Vec;
  hp: number;
  /** Its stats: `baseStats` under the floor's blessings (`applyBuffs`). */
  stats: HeroStats;
  /** Its stats before the floor's blessings: its gear's under the dive's (see the floor maps spec). */
  baseStats: HeroStats;
  /** The blessings it took on this floor (a sanctum's shrine). */
  floorBuffs: Buff[];
  /** The dive's blessings: those it began the floor with, and any taken on it. */
  diveBuffs: Buff[];
  /**
   * `buffSum` of `diveBuffs` and `floorBuffs` (see the boons spec): the combined view every
   * boon field's site reads; set when the hero is made and whenever a buff is added.
   */
  boon: BoonSum;
  /** The one mana pool: basic hits fill it, abilities spend it. */
  mana: number;
  manaMax: number;
  /** Mana per second. */
  manaRegen: number;
  /**
   * The Primary's, Defensive's and Ultimate's chains, by slot: null for a
   * skill the weapon doesn't carry (see the weapon movesets spec).
   */
  chains: (ResolvedChain | null)[];
  /** Per slot and move: the time the move is ready again. */
  cooldowns: number[][];
  /** Per slot: charge units banked (a charge-paid chain's meter). */
  charge: number[];
  /**
   * Per slot: the move of the last cast, and when its chain's restart window
   * starts: its landing plus its beat (a press's move is chosen from these).
   */
  comboStep: number[];
  comboAt: number[];
  /**
   * Per slot: the beat after the last move landed, from `beatFrom` to
   * `beatUntil`; the slot's next move waits for its end (see the chain feel spec).
   */
  beatFrom: number[];
  beatUntil: number[];
  /**
   * An ability winding up (every ability conjures; cast payment channels too):
   * the hero can't attack meanwhile, and walks slowed, facing it (see the
   * weapon flow spec).
   */
  windup: {
    slot: number;
    aim: Vec | null;
    /** Where the press aimed (the fallback if auto-aim finds nothing at landing). */
    at: Vec;
    /** Where the hero stood when the wind-up began. */
    from: Vec;
    start: number;
    until: number;
    /** The chain's move, chosen at the press, and its hold stage (a released hold's; else 0). */
    step: number;
    stage: number;
    /** When the conjure ends (any channel follows). */
    conjureUntil: number;
    /** Charge spent at the press (refunded if a dodge cancels). */
    chargePaid: number;
    /** A Free Cast's damage bonus, carried to the landing (0 or absent: none). */
    free?: number;
  } | null;
  /**
   * A hold move charging while its button is held (see the moves and chains
   * spec): the slot, the chain's move, when it began, and what it aimed at then
   * (null: nothing in reach), and where the hero stood then (`from`, its
   * wind-up's, for the past-the-aim-point rule). Nothing is paid until it
   * fires. `full` and `max` are the seconds to its full charge and to its
   * auto-fire (`holdTime` and `holdMax` × the tempo), fixed when it began, so a
   * weapon swap mid-charge doesn't make it jump.
   */
  hold: {
    slot: number;
    step: number;
    start: number;
    aim: Vec | null;
    from: Vec;
    full: number;
    max: number;
  } | null;
  /** A basic attack in its startup: the blow lands at `strikeAt`; the hero walks slowed meanwhile, facing `dir`. */
  swing: {
    step: number;
    dir: Vec;
    targetId: number | null;
    start: number;
    strikeAt: number;
    /** Seconds this blow takes, startup included (its share of the attack interval). */
    cycle: number;
    /** A committed swing leaves a recovery (moving during an automatic swing's startup clears it). */
    committed: boolean;
    /** A manual hold blow held at its strike point: since when (else null). */
    held: number | null;
    /**
     * A manual hold blow let go at stage 1 or 2 whose row lunges further than
     * medium's: the stage it was let go at. It leaps the rest, then strikes at
     * `strikeAt` (see the weapon flow spec). Else null.
     */
    released: number | null;
  } | null;
  /** Each running push (a lunge, a step-in, a step or a recoil), in the order they began. */
  pushes: Push[];
  /** Movement is slowed until this time (after a committed strike or a landed ability). */
  recoverUntil: number;
  /**
   * The active defensive (Ward, Armor, Surge; Blink's trail effects): the chain's
   * `move` that cast it, at its hold `stage` (0 for any other move).
   */
  defend: { form: FormId; until: number; move: number; stage: number } | null;
  ward: { hp: number; max: number } | null;
  /** Obsidian's barrier: soaks damage after the Defensive and before the Ward, until `until`. */
  barrier: { hp: number; max: number; until: number } | null;
  /** Lightning Rod quickens movement until this time. */
  quickUntil: number;
  /** When each buff reaction can fire again (missing: ready). */
  reactionReadyAt: Partial<Record<ReactionId, number>>;
  dodgeCharges: number;
  /** When the next dodge charge arrives (0 = full). */
  dodgeRechargeAt: number;
  /** Free Cast (a boon): an ability paid before this time is free (absent: none). */
  freeCastUntil?: number;
  /** Last Stand (a boon) has fired on this floor. */
  lastStandUsed?: boolean;
  /** Last Stand's damage cut runs until this time. */
  lastStandUntil?: number;
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
  /** Strikes in the current string, whiffs included (resets after a pause). */
  attackCount: number;
  lastBasicAt: number;
  potions: number;
  invulnUntil: number;
  phoenixAvailable: boolean;
  phoenixUsed: boolean;
  lastHitAt: number;
  /** Steering (above 0.05) and not dashing. */
  moving: boolean;
  /** The side (1 or −1) the last side step took (see the weapon flow spec). */
  swaySide: number;
  /**
   * Drain's foe-hits counted per skill since it last fired: the Primary, the
   * Defensive, the Ultimate, then the basic attack (see the runes spec).
   */
  drained: number[];
  /** The mana Drain may still give back per skill this cast (`runes.drainShare`), as `drained`. */
  drainLeft: number[];
  /** The capped zones (`ZoneKnob.perCast`, Linger's) each skill may still leave this cast, as `drained`. */
  zonesLeft: number[];
}

export interface ArpgInput {
  /** Desired direction; length is clamped to 1. Zero = stand still. */
  move: Vec;
  /**
   * Ability to use this step (0 Primary, 1 Defensive, 2 Ultimate), with an optional aim point:
   * a press, or the release of a hold move's button.
   */
  cast?: AbilityCast | null;
  /** The ability slot whose button is held this step: a hold move charges while it is. */
  holding?: number | null;
  /** Drop a running hold unpaid (an aim released back on its button). */
  cancelHold?: boolean;
  potion?: boolean;
  /** Dodge this step (the dash follows `move`, or runs from the nearest foe). */
  dodge?: boolean;
  /** The dodge button is held: a dash at its end glides on (up to `dodge.glide`) until let go. */
  dodgeHeld?: boolean;
  /** Use the interactable in reach: a chest, a shrine, an alcove, the gate (a press; see the floor maps spec). */
  interact?: boolean;
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

/** Where a hit on a monster came from (display data: the damage meter's buckets); `hazard` a hazard's burst. */
export type HitSource = 'basic' | 'skill' | 'dot' | 'reaction' | 'thorns' | 'hazard';

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
      /** The pairs of stacks the reaction consumed (see the `reaction` event). */
      pairs?: number;
      heft: number;
      /**
       * Where the hit came from, and the ability slot (0 Primary, 1 Defensive, 2 Ultimate) behind
       * it: a skill hit's, or the one whose burn, poison or reaction splash this is.
       */
      source: HitSource;
      slot?: number;
      /**
       * An echo's hit (`landBlow`'s `echo`, an ability's `replay`; see the boons spec's 8): the
       * client gives it no hit-stop or kick. Its numbers are as any hit's.
       */
      echo?: true;
    }
  | {
      kind: 'heroHit';
      x: number;
      y: number;
      amount: number;
      dodged: boolean;
      element: ManaType | null;
      /** Invulnerable (Training Grounds): `amount` is what it would have taken; no life was lost. */
      blocked?: boolean;
    }
  | { kind: 'heal'; amount: number; source: 'lifesteal' | 'potion' | 'kill' | 'orb' | 'soulfire' }
  | {
      kind: 'cast';
      slot: number;
      /** The chain's move it cast, and whether the press aimed it (a manual aim; else auto-aim). */
      step: number;
      aimed: boolean;
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
  /** A hold reached a new stage (1, then 2): an ability slot's, or the basic attack's (null). */
  | { kind: 'holdStage'; slot: number | null; stage: number }
  | { kind: 'buff'; form: FormId; element: ManaType; until: number }
  | { kind: 'wardBreak'; x: number; y: number; element: ManaType }
  | { kind: 'barrierBreak'; x: number; y: number }
  | {
      kind: 'beam';
      x: number;
      y: number;
      tx: number;
      ty: number;
      width: number;
      element: ManaType;
      /**
       * Display data: the ability's second element, drawn as its motif; null for
       * one element, basic attacks, ticks, monsters and reactions. The same on
       * `slash`, `explode` and `dash`.
       */
      infusion: ManaType | null;
    }
  | {
      kind: 'slash';
      x: number;
      y: number;
      dir: Vec;
      range: number;
      arc: number;
      element: ManaType;
      heft: number;
      infusion: ManaType | null;
      /** An echo's slash (an ability's `replay`): the client gives it no hit-stop or kick. */
      echo?: true;
    }
  | {
      kind: 'basic';
      x: number;
      y: number;
      tx: number;
      ty: number;
      element: ManaType;
      melee: boolean;
      heft: number;
      /** The blow of the basic chain, and the kind it struck as (a held blow's stage's). */
      step: number;
      moveKind: MoveKind;
      dir: Vec;
    }
  | { kind: 'chain'; points: Vec[]; element: ManaType }
  | {
      kind: 'explode';
      x: number;
      y: number;
      radius: number;
      element: ManaType | null;
      infusion: ManaType | null;
    }
  | {
      kind: 'reaction';
      reaction: ReactionId;
      x: number;
      y: number;
      /** How many pairs of stacks it consumed: damage reactions scale with it. */
      pairs?: number;
    }
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
      rune?: RuneRef;
      /** A material pickup's material, `amount` of it. */
      material?: MaterialRef;
      /** A pattern pickup's base id. */
      pattern?: string;
    }
  | {
      kind: 'dash';
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      infusion: ManaType | null;
    }
  | { kind: 'noMana'; slot: number }
  /** A skill paid: the mana and charge it really cost (none for the sandbox's free toggles). */
  | { kind: 'pay'; slot: number; mana: number; charge: number }
  | { kind: 'dodge'; fromX: number; fromY: number; dirX: number; dirY: number }
  | { kind: 'perfectDodge'; x: number; y: number }
  /** A rune's effect fired: its glyph flashes at the point (see the runes spec). */
  | {
      kind: 'runeFx';
      effect: 'split' | 'echo' | 'volatile';
      x: number;
      y: number;
      element: ManaType | null;
    }
  /** An interactable in reach, each step one is: what a press does to it (see the floor maps spec). */
  | { kind: 'interactPrompt'; id: string; interactable: InteractableKind; text: string }
  /** An interactable used up: a chest opened, a shrine's blessing given (see the tutorial spec's tallies). */
  | { kind: 'used'; id: string; interactable: InteractableKind }
  /** The gate was used: the client confirms (`roomsUnexplored`), then `exitFloor`. */
  | { kind: 'exitRequest'; roomsUnexplored: number }
  /** An anvil alcove opened: the client (or the bot) offers `alcoveOffers`. */
  | { kind: 'alcoveOpen'; id: string }
  | { kind: 'seal'; roomId: number }
  | { kind: 'unseal'; roomId: number }
  /** A room's last foe died. */
  | { kind: 'roomCleared'; roomId: number }
  /** The exit unfound after `ai.exitHintSeconds`: the compass points at it. */
  | { kind: 'exitHint'; x: number; y: number }
  /** A prop broke (see the room objects spec). */
  | { kind: 'propBreak'; id: number; prop: string; x: number; y: number }
  /** A hazard was set off: it bursts after `fuse` seconds (its telegraph). */
  | {
      kind: 'hazardPrime';
      id: number;
      hazard: string;
      element: ManaType;
      x: number;
      y: number;
      radius: number;
      fuse: number;
    }
  /** A hazard burst: everyone within `radius` was hit. */
  | {
      kind: 'hazardBurst';
      id: number;
      hazard: string;
      element: ManaType;
      x: number;
      y: number;
      radius: number;
    }
  /** A crumbling structure crumbled: its cells are slow ground (rubble) now. */
  | { kind: 'crumble'; structure: number; cells: Vec[] }
  /** A knocked-back foe met a wall or cover. */
  | { kind: 'wallSlam'; id: number; x: number; y: number }
  /** A charger's dash met a wall or cover: it is stunned. */
  | { kind: 'chargeStun'; id: number; x: number; y: number }
  | { kind: 'cleared' }
  | { kind: 'revive'; amount: number }
  | { kind: 'heroDeath' };

export interface LootContext {
  nextUid: number;
  /** Total Find in percentage points (gear + the door's `find`). The door's drop multipliers are `world.door`'s. */
  find: number;
  legendaryBoost: number;
  /** The patterns the hero knows: a pattern drop teaches one it doesn't. */
  patterns: string[];
  /**
   * Foes of this depth (by id) that already dropped gear or a pattern this dive
   * (`DiveState.dropsGiven`): a replayed floor's foe drops neither again.
   * `dropLoot` and `dropMaterials` add to it; `bankWorld` keeps it on the dive.
   */
  dropsGiven: number[];
  /** The hero's pair, primary first (empty before the choice): drops lean toward it. */
  pair: ManaType[];
}

export interface WorldPending {
  items: GearItem[];
  scrap: number;
  kills: number;
  reactions: ReactionId[];
  /** Runes picked up, banked into the floor's haul. */
  runes: RuneRef[];
  /** Material pickups: bars, flux, shards, essences, Mana Dust and Links (scrap and runes ride `scrap` and `runes`). */
  haul: Haul;
  /** Patterns picked up, learned when they bank. */
  patterns: string[];
  /** What happened for the quests' objectives, applied when the world banks (see the quests spec). */
  questEvents: QuestEvent[];
  /** Interactables used since the last bank: `DiveState.used` takes them (see the floor maps spec). */
  used: string[];
  /** Dive blessings taken since the last bank: `DiveState.diveBuffs` takes them. */
  diveBuffs: Buff[];
  /**
   * The world hasn't banked yet: its first bank starts the dive's haul afresh, so
   * a floor replayed from its seed (left for the Anvil mid-floor) loses its
   * unbanked haul instead of collecting it twice.
   */
  newFloor: boolean;
}

/** How `spawnDummies` places a group: one; five in a line going up (lances, chains); or five in a clump (areas). */
export type DummyLayout = 'single' | 'row' | 'clump';

/** Training Grounds rules (see `arpg/sandbox.ts`); each is checked where its rule lives. */
export interface SandboxToggles {
  /** Mana is topped up every tick. */
  infiniteMana: boolean;
  /** Abilities set no cooldown (nor charge lockout), and charge refills as a charge-paid one lands. */
  noCooldowns: boolean;
  /** Hits take no life (their `heroHit` says `blocked`), so the hero never dies. */
  invulnerable: boolean;
}

/** A move or a blow to repeat at `at` (Echo; see the runes spec). */
export interface Echo {
  at: number;
  /** An ability's: its slot, the move as it landed, and its landing point. */
  slot: number | null;
  ability: ResolvedAbility | null;
  aim: Vec | null;
  /** A blow's: its step in the basic chain, the stage it struck at (null: not held), and its way. */
  blow: number | null;
  stage: number | null;
  dir: Vec | null;
}

/** An ability press waiting to fire (see `ArpgWorld.queuedCasts`). */
export interface QueuedCast {
  cast: AbilityCast;
  until: number;
}

export interface ArpgWorld {
  t: number;
  accumulator: number;
  rng: SeededRNG;
  lootRng: SeededRNG;
  /** Rune drops' own stream, so item drops roll as they did before runes. */
  runeRng: SeededRNG;
  /** Material drops' own stream (scrap pickups too), so gear, rune, orb and mote rolls stay as they were. */
  materialRng: SeededRNG;
  depth: number;
  biomeId: string;
  element: ManaType;
  door: DoorDef | null;
  /** The floor's grid, rooms and doors (see the floor maps spec): `width` and `height` are its size. */
  map: FloorMap;
  width: number;
  height: number;
  /** Each cell's fog: 0 unseen, 1 seen, 2 in sight now (the open room's: all 2). */
  fog: Uint8Array;
  /** Moves on whenever `fog` changes: the minimap redraws its fog then. */
  fogVersion: number;
  /** When `fogTick` next runs (an `ai.fogEvery` mark). */
  fogAt: number;
  /** The exit hint has fired. */
  exitHinted: boolean;
  /**
   * The flow fields toward the hero (`flowTick`), one per clearance class (`large`:
   * big foes', `huge`: a boss's, built only while one stands): steps by cell, null until
   * built; rebuilt at `nextAt`.
   */
  flow: {
    small: Uint16Array | null;
    large: Uint16Array | null;
    huge: Uint16Array | null;
    nextAt: number;
  };
  /** The room whose doors are closing, since when (they wait `ai.sealGrace` for the doorway), or null. */
  sealing: { roomId: number; since: number } | null;
  /** A shrine's prayer under way (`interactTick`): its interactable, where and when it began, its end. */
  channel: { id: string; x: number; y: number; start: number; until: number } | null;
  /** The hero took the exit (`exitFloor`): a generated floor ends on it, the open room on `cleared`. */
  exited: boolean;
  hero: HeroEntity;
  monsters: MonsterEntity[];
  projectiles: Projectile[];
  zones: Zone[];
  drops: Drop[];
  /** The floor's props and hazards (see the room objects spec): none off a furnished floor. */
  props: PropEntity[];
  hazards: HazardEntity[];
  /** Broken props' drops' own stream, so every other roll stays as it was. */
  propRng: SeededRNG;
  /** The pack director (`directorTick`): when it next runs. */
  director: { nextAt: number };
  nextId: number;
  loot: LootContext;
  /** Rewards collected since the last bank into the profile. */
  pending: WorldPending;
  totalMonsters: number;
  bossId: number | null;
  /**
   * Ability presses waiting to fire, at most one per slot, in the order they
   * were pressed. Each is dropped after its `until`: the end of whatever held
   * it (a wind-up, a hold, a dash, its slot's beat), plus the buffer.
   */
  queuedCasts: QueuedCast[];
  /** Moves and blows waiting to repeat (Echo), in the order they were queued. */
  echoes: Echo[];
  /** A press of the slot whose hold runs: its release, for the next step. */
  queuedRelease: AbilityCast | null;
  /**
   * The slot whose hold was dropped (a dodge, `cancelHold`, a changed chain) or
   * fired by itself at `holdMax` while its button stayed held: until the button
   * lets go, its release is swallowed and no new hold starts.
   */
  holdDropped: number | null;
  /** A manual attack tap waiting for the weapon (see `queuedCasts`). */
  queuedAttack: { until: number; aim: Vec | null } | null;
  queuedPotion: boolean;
  queuedDodge: boolean;
  /** An interact press waiting for `interactTick`. */
  queuedInteract: boolean;
  kills: number;
  bossKilled: boolean;
  cleared: boolean;
  clearedAt: number;
  heroDead: boolean;
  /** A potion was drunk on this floor: a `clearFloor` objective's `noPotion` (see the quests spec). */
  potionDrunk: boolean;
  /** The hero took damage on this floor: `noDamage`. */
  hurt: boolean;
  /** The Training Grounds' toggles, or null in a dive. Change them with `setSandboxToggles`. */
  sandbox: SandboxToggles | null;
  /** A hand-built floor's id (`tutorial.json → floors`), or null (see the tutorial spec). */
  tutorialFloor: string | null;
  /** The guided start on this floor: its step and the floor's tallies, or null (off, done or skipped). */
  tutorial: WorldTutorial | null;
}
