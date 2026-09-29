import type { SeededRNG } from '../rng/seeded-rng.js';
import type { DoorDef, HeroStats, MonsterAi, MonsterTrait } from './delve.js';
import type { GearItem, Rarity } from './gear.js';
import type { ManaType } from './mana.js';
import type {
  AbilityCast,
  AbilitySlot,
  FormId,
  Knobs,
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
  /** A training dummy: where it stands, and the element it resists (null = Neutral). Null for real monsters. */
  dummy: { homeX: number; homeY: number; element: ManaType | null } | null;
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
  /** A basic shot from an Earth source: its stagger rattles (see `HitOpts.rattles`). */
  rattles?: boolean;
  /** A basic shot's stacks (see `HitOpts.stacks`). */
  stacks?: number;
  /** A Twin Fang echo: its hit pairs nothing (see `HitOpts.noReact`). */
  noReact?: boolean;
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
  /** The Primary's, Defensive's and Ultimate's chains. */
  chains: ResolvedChain[];
  /** Per slot and move: the time the move is ready again. */
  cooldowns: number[][];
  /** Per slot: charge units banked (a charge-paid chain's meter). */
  charge: number[];
  /** Per slot: the move of the last cast and when it landed (a press's move is chosen from these). */
  comboStep: number[];
  comboAt: number[];
  /** An ability winding up (every ability conjures; cast payment channels too); the hero can't walk or attack meanwhile (a forward form's step-in still moves it). */
  windup: {
    slot: number;
    aim: Vec | null;
    /** Where the press aimed (the fallback if auto-aim finds nothing at landing). */
    at: Vec;
    start: number;
    until: number;
    /** The chain's move, chosen at the press, and its hold stage (a released hold's; else 0). */
    step: number;
    stage: number;
    /** When the conjure ends (any channel follows). */
    conjureUntil: number;
    /** Charge spent at the press (refunded if a dodge cancels). */
    chargePaid: number;
  } | null;
  /**
   * A hold move charging while its button is held (see the moves and chains
   * spec): the slot, the chain's move, when it began, and what it aimed at then
   * (null: nothing in reach). Nothing is paid until it fires.
   */
  hold: { slot: number; step: number; start: number; aim: Vec | null } | null;
  /** A basic attack in its startup: the blow lands at `strikeAt`. */
  swing: {
    step: number;
    dir: Vec;
    targetId: number | null;
    start: number;
    strikeAt: number;
    /** Seconds this blow takes, startup included (its share of the attack interval). */
    cycle: number;
    /** Committed swings root the hero, lunge and leave a recovery (automatic swings on the move don't). */
    committed: boolean;
    /** A manual hold blow held at its strike point: since when (else null). */
    held: number | null;
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
  moving: boolean;
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

/** Where a hit on a monster came from (display data: the damage meter's buckets). */
export type HitSource = 'basic' | 'skill' | 'dot' | 'reaction' | 'thorns';

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
  /** The hero's pair, primary first (empty before the choice): drops lean toward it. */
  pair: ManaType[];
}

export interface WorldPending {
  items: GearItem[];
  scrap: number;
  kills: number;
  reactions: ReactionId[];
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
  /** A press of the slot whose hold runs: its release, for the next step. */
  queuedRelease: AbilityCast | null;
  /**
   * The slot whose hold was dropped (a dodge, `cancelHold`, a changed chain) or
   * fired by itself at `holdMax` while its button stayed held: until the button
   * lets go, its release is swallowed and no new hold starts.
   */
  holdDropped: number | null;
  /** A manual attack tap waiting for the weapon (see `queuedCastUntil`). */
  queuedAttack: { until: number; aim: Vec | null } | null;
  queuedPotion: boolean;
  queuedDodge: boolean;
  kills: number;
  bossKilled: boolean;
  cleared: boolean;
  clearedAt: number;
  heroDead: boolean;
  /** The Training Grounds' toggles, or null in a dive. Change them with `setSandboxToggles`. */
  sandbox: SandboxToggles | null;
}
