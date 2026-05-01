import type { DerivedStats, Element } from './derived-stats.js';
import type { DamageBreakdown, DotTickBreakdown, HealBreakdown } from './damage-breakdown.js';

// --- Gladiator Runtime State (used during duel simulation) ---

export interface ActiveDOT {
  element: Element;
  damagePerSecond: number;
  remaining: number;        // seconds left
  tickInterval: number;     // seconds between ticks (default 1.0)
  accumulator: number;      // seconds since last tick
  sourceAffixId: string;
  stacks: number;
  sourcePlayerId: 0 | 1;
}

/**
 * A temporary barrier shield that expires after `remaining` seconds. Sits in a
 * separate pool from the permanent `barrier` field; damage absorption consumes
 * the permanent pool first, then iterates temporary barriers in FIFO order
 * (oldest first) so player-built barriers aren't pre-consumed by short-lived
 * triggered shields.
 */
export interface TemporaryBarrier {
  amount: number;
  remaining: number; // seconds
  sourceId: string;
}

/**
 * Per-element DOT amplifier debuff applied to the target. Multiplies effective
 * stack count and accelerates tick rate for DOTs of the matching element.
 * Used by envenom (poison amplifier) and plague_carrier. Stack-by-replacement.
 */
export interface ElementAmplifier {
  stackMultiplier: number;  // 1.0 = no amplification
  tickMultiplier: number;   // 1.0 = no acceleration; > 1 = ticks faster
  remaining: number;        // seconds
}

/**
 * A conditional damage modifier that fires while the source compound is
 * equipped. Read by damage-calc at hit time: if the condition predicate
 * evaluates true against attacker/defender state, the multiplier applies
 * to the matching damage type's contribution.
 *
 * Example: blight's "+30% poison damage when target has fire DOT" becomes
 * { sourceCompoundId: 'blight', damageType: 'poison', multiplier: 1.30,
 *   condition: { kind: 'target_has_dot_element', element: 'fire' } }
 */
export interface PassiveDamageModifier {
  sourceCompoundId: string;
  damageType: 'physical' | Element;
  multiplier: number;
  condition: PassiveModifierCondition;
}

/**
 * Serializable condition predicates used by passive damage modifiers.
 * Materialized into an actual function at modifier-extract time. Adding a
 * new condition kind requires both a discriminator entry here and a case in
 * `evaluatePassiveModifierCondition` in trigger-system.ts.
 */
export type PassiveModifierCondition =
  | { kind: 'always' }
  | { kind: 'target_has_dot_element'; element: Element }
  | { kind: 'target_slowed' }
  | { kind: 'target_below_hp_pct'; pct: number }   // pct in [0,1]: target.currentHP / effectiveMaxHP < pct
  | { kind: 'self_above_hp_pct'; pct: number }     // pct in [0,1]: self.currentHP / effectiveMaxHP > pct
  | { kind: 'self_has_barrier' };

export type ActiveBuff =
  | {
      kind: 'add';
      stat: keyof DerivedStats;
      value: number;
      remaining: number; // seconds
      sourceId: string;
    }
  | {
      kind: 'mul';
      stat: keyof DerivedStats;
      multiplier: number;
      remaining: number; // seconds
      sourceId: string;
    };

export interface GladiatorRuntime {
  playerId: 0 | 1;
  currentHP: number;
  maxHP: number;
  barrier: number;
  stats: DerivedStats;
  activeDOTs: ActiveDOT[];
  activeBuffs: ActiveBuff[];
  cooldowns: Map<string, number>;    // triggerId -> seconds until available
  attackTimer: number;               // seconds until next attack
  stunTimer: number;                 // seconds remaining stunned
  isLowHP: boolean; // Cached: currentHP / maxHP < 0.3
  reflectMultiplier: number;
  reflectRemaining: number; // seconds
  regenAccumulator: number;  // seconds since last regen tick
  regenInterval: number;     // seconds between regen ticks (default 1.0)
  /**
   * Slow-debuff multiplier on this gladiator's own attackTimer reset.
   * 1.0 = no slow; > 1.0 = slower attacks. Set by `apply_slow` triggers
   * (e.g. frostbite). Distinct from `defender.stats.slowPercent`, which is
   * a permanent defensive aura.
   */
  slowDebuffMultiplier: number;
  slowDebuffRemaining: number; // seconds
  /**
   * Pool of expiring barrier shields layered on top of the permanent `barrier`
   * field. Pushed by `gain_barrier` effects with `duration > 0`.
   */
  temporaryBarriers: TemporaryBarrier[];
  /**
   * Multiplicative debuff on this gladiator's effective max HP. 1.0 = no
   * debuff. Used by `reduce_max_hp` triggers (e.g. soul_rend's "fragile" hex)
   * to shrink the HP pool for `maxHpDebuffRemaining` seconds. All meaningful
   * maxHP reads (regen cap, heal cap, low-HP threshold, %heal/%barrier calc,
   * tiebreak HP%) use `effectiveMaxHP(g)` so the debuff propagates.
   */
  maxHpDebuffMultiplier: number;
  maxHpDebuffRemaining: number; // seconds
  /**
   * Per-element DOT amplifier debuffs. Keyed by element. Damage calc reads
   * the matching amplifier when computing DOT tick damage; the DOT processing
   * loop reads it when computing effective tickInterval.
   */
  elementAmplifiers: Partial<Record<Element, ElementAmplifier>>;
  /**
   * Conditional damage modifiers contributed by equipped compounds. Read
   * at attack-time by calculateAttackBreakdown. Built once at duel start
   * by extractPassiveModifiers; immutable for the duel's duration.
   */
  passiveDamageModifiers: PassiveDamageModifier[];
  /**
   * Hits landed since the last crit. Used by flicker_strike's bespoke
   * mechanic: at threshold (compound.flicker_strike.hitInterval, default 5),
   * the next attack is forced to crit and the counter resets.
   */
  hitsSinceCrit: number;
  /**
   * sanguine_endurance bespoke state. When > 1, allows currentHP to exceed
   * effectiveMaxHP up to effectiveMaxHP * sanguineOverhealMultiplier. 1.0
   * (default) disables the lift. Set once at duel start.
   */
  sanguineOverhealMultiplier: number;
  /**
   * blood_pact bespoke state. When > 0, the maxHP gain cap (as a fraction of
   * baseMaxHP). 0 (default) disables maxHP growth from overheal. Set once at
   * duel start.
   */
  bloodPactGainCapFraction: number;
  /** baseMaxHP at duel start, captured for blood_pact cap math. */
  bloodPactBaseMaxHP: number;
  /** Running total of blood_pact maxHP gain so we don't exceed the cap. */
  bloodPactMaxHpGained: number;
}

// --- Combat Events (discriminated union for combat log) ---

export type CombatEvent =
  | { type: 'attack'; attacker: 0 | 1; breakdown: DamageBreakdown }
  | {
      type: 'dot_tick';
      target: 0 | 1;
      breakdown: DotTickBreakdown;
      /**
       * Source affix/compound id for attribution. Empty/undefined for legacy
       * DOTs. Compound DOTs use `compound:<recipeId>` (e.g. `compound:ignite`).
       */
      sourceAffixId?: string;
    }
  | { type: 'heal'; player: 0 | 1; breakdown: HealBreakdown }
  | { type: 'dot_apply'; target: 0 | 1; element: Element; dps: number; duration: number }
  /** @deprecated Use breakdown.blocked on the attack event instead */
  | { type: 'block'; blocker: 0 | 1; blockedDamage: number }
  /** @deprecated Dodge is now indicated by breakdown.dodged on the attack event */
  | { type: 'dodge'; dodger: 0 | 1 }
  /** @deprecated Use the heal event with source: 'lifesteal' instead */
  | { type: 'lifesteal'; player: 0 | 1; healed: number }
  /** @deprecated Thorns will be modelled as a triggered effect */
  | { type: 'thorns'; reflector: 0 | 1; damage: number }
  /** @deprecated Use breakdown.barrierAbsorbed on the attack event instead */
  | { type: 'barrier_absorb'; player: 0 | 1; absorbed: number; remaining: number }
  | { type: 'trigger_proc'; player: 0 | 1; triggerId: string; effectDescription: string }
  | { type: 'synergy_proc'; player: 0 | 1; synergyId: string; effectDescription: string }
  | { type: 'compound_trigger'; player: 0 | 1; compoundId: string; displayName: string }
  | { type: 'stun'; target: 0 | 1; duration: number }
  | { type: 'hp_change'; player: 0 | 1; oldHP: number; newHP: number; maxHP: number }
  | { type: 'death'; player: 0 | 1 };

// --- Combat Log ---

export interface DuelResult {
  round: number;
  winner: 0 | 1; // Individual duels always have a winner
  finalHP: [number, number];
  duration: number; // seconds
  wasTiebreak: boolean;
  p0DamageDealt: number;
  p1DamageDealt: number;
}

export interface CombatLog {
  seed: number;
  frames: { time: number; events: CombatEvent[] }[];
  result: DuelResult;
}

// --- Trigger System ---

export type TriggerCondition =
  | 'on_hit'
  | 'on_crit'
  | 'on_block'
  | 'on_dodge'
  | 'on_taking_damage'
  | 'on_low_hp';

export type TriggerEffect =
  | { kind: 'apply_dot'; element: Element; dps: number; duration: number }
  | { kind: 'bonus_damage'; amount: number; damageType: 'physical' | Element }
  | {
      /**
       * Damage equal to a fraction of the opponent's current HP at proc time.
       * Used by "siphon" / "soulrend" mechanics — damage scales with target HP
       * pool rather than attacker stats.
       */
      kind: 'damage_current_hp';
      fraction: number;
    }
  | {
      /**
       * Reduce the opponent's effective max HP by `fraction` for `duration`
       * seconds. Stack-by-replacement (latest debuff wins). Clamps currentHP
       * to the new effective max on apply.
       */
      kind: 'reduce_max_hp';
      fraction: number;
      duration: number;
    }
  | {
      /**
       * Bonus damage scaled to the in-flight attack's net damage. Used by
       * "echo" / "counter" effects on on_hit, on_crit, on_block, and
       * on_taking_damage triggers — final damage = damageContext * multiplier.
       */
      kind: 'bonus_damage_scaled';
      damageType: 'physical' | Element;
      multiplier: number;
    }
  | { kind: 'heal'; amount: number; isPercent: boolean }
  | {
      kind: 'gain_barrier';
      amount: number;
      isPercent: boolean;
      /**
       * If > 0, the barrier is pushed onto `temporaryBarriers` and expires
       * after `duration` seconds. If 0/undefined, it's added to the permanent
       * `barrier` pool (existing behavior).
       */
      duration?: number;
    }
  | { kind: 'stun'; duration: number }
  | {
      kind: 'stat_buff_add';
      stat: keyof DerivedStats;
      value: number;
      duration: number;
    }
  | {
      kind: 'stat_buff_mul';
      stat: keyof DerivedStats;
      multiplier: number;
      duration: number;
    }
  | { kind: 'reflect_damage'; multiplier: number; duration: number }
  | {
      /** Apply a slow debuff to the opponent's next attack timers. */
      kind: 'apply_slow';
      multiplier: number; // > 1.0 = slower
      duration: number;
    }
  | {
      /**
       * Amplify the opponent's DOTs of a given element. Stack-by-replacement.
       * Used by envenom-class compounds.
       */
      kind: 'amplify_dot_element';
      element: Element;
      stackMultiplier: number;  // multiplies effective stack count for damage calc
      tickMultiplier: number;   // > 1 = faster ticks
      duration: number;
    }
  | {
      kind: 'compound_dot';
      compoundId: string;         // e.g. 'ignite'
      element: Element;
      damagePerSecond: number;
      duration: number;           // seconds
      tickInterval: number;       // seconds
      dotMultiplier: number;      // recipe-declared damage multiplier (scale-1, e.g. 2.0 = 2x)
    };

export interface TriggerDef {
  affixId: string;
  condition: TriggerCondition;
  chance: number; // 0-1
  cooldown: number; // seconds (0 = no cooldown)
  /**
   * Effects applied when the trigger fires. Always at least one entry. Multi-
   * effect compounds (e.g. frostbite = DOT + slow) group their per-condition
   * blueprints into a single TriggerDef so one chance roll fires every effect
   * together — keeps proc semantics intuitive ("frostbite procs 20%" means all
   * its effects fire together 20% of the time, not each independently).
   */
  effects: TriggerEffect[];
}

// --- Compound Effect Blueprints (data-driven recipe declarations) ---
//
// A CompoundEffectShape mirrors a TriggerEffect kind but with declarative
// per-tier scaling. The trigger system materializes a concrete TriggerEffect
// from a blueprint at gem-extract time using gem.tier. Add a new shape only
// when an existing TriggerEffect kind needs different scaling rules.

export type CompoundEffectShape =
  | {
      kind: 'compound_dot';
      element: Element;
      dpsPerTier: number;
      duration: number;
      tickInterval: number;
      dotMultiplier: number;
    }
  | { kind: 'apply_dot'; element: Element; dpsPerTier: number; duration: number }
  | {
      kind: 'gain_barrier';
      amount?: number;
      amountPerTier?: number;
      /** When true, amount is treated as a fraction of owner.maxHP. */
      isPercent?: boolean;
      /** Seconds before the barrier expires; omit/0 for permanent barrier. */
      duration?: number;
    }
  | { kind: 'stun'; duration: number }
  | { kind: 'reflect_damage'; multiplier: number; duration: number }
  | { kind: 'apply_slow'; multiplier: number; duration: number }
  | {
      kind: 'amplify_dot_element';
      element: Element;
      stackMultiplier: number;
      tickMultiplier: number;
      duration: number;
    }
  | { kind: 'heal'; amount?: number; amountPerTier?: number; isPercent: boolean }
  | {
      kind: 'bonus_damage';
      damageType: 'physical' | Element;
      amount?: number;
      amountPerTier?: number;
    }
  | {
      /**
       * Echo a fraction of the in-flight attack damage as a new hit. Only
       * triggers fired with a damageContext (on_hit/on_crit/on_block/
       * on_taking_damage) carry the underlying value; for triggers without
       * damage context the effect deals 0.
       */
      kind: 'bonus_damage_scaled';
      damageType: 'physical' | Element;
      multiplier: number;
    }
  | { kind: 'damage_current_hp'; fraction: number }
  | { kind: 'reduce_max_hp'; fraction: number; duration: number }
  | {
      kind: 'stat_buff_add';
      stat: keyof DerivedStats;
      value?: number;
      valuePerTier?: number;
      duration: number;
    }
  | {
      /**
       * Multiplicative buff. For "lower-is-faster" stats (e.g. attackSpeed)
       * use multiplier < 1 to speed up. No tier-scaling in v1; per-tier
       * multipliers can be added if needed.
       */
      kind: 'stat_buff_mul';
      stat: keyof DerivedStats;
      multiplier: number;
      duration: number;
    };

export interface CompoundEffectBlueprint {
  /**
   * Trigger condition. If omitted, the trigger system infers it from the
   * recipe's chance_<x> component (e.g. chance_on_hit → 'on_hit'). Required
   * for capstone compounds with no chance_* component.
   */
  condition?: TriggerCondition;
  effect: CompoundEffectShape;
}
