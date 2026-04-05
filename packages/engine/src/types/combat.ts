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

export interface ActiveBuff {
  stat: keyof DerivedStats;
  value: number;
  remaining: number; // seconds
  sourceId: string;
}

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
}

// --- Combat Events (discriminated union for combat log) ---

export type CombatEvent =
  | { type: 'attack'; attacker: 0 | 1; breakdown: DamageBreakdown }
  | { type: 'dot_tick'; target: 0 | 1; breakdown: DotTickBreakdown }
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
  | 'on_taking_damage'
  | 'on_low_hp'
  | 'on_kill';

export type TriggerEffect =
  | { kind: 'apply_dot'; element: Element; dps: number; duration: number }
  | { kind: 'bonus_damage'; amount: number; damageType: 'physical' | Element }
  | { kind: 'heal'; amount: number; isPercent: boolean }
  | { kind: 'gain_barrier'; amount: number }
  | { kind: 'stun'; duration: number }
  | {
      kind: 'stat_buff';
      stat: keyof DerivedStats;
      value: number;
      duration: number;
    }
  | { kind: 'reflect_damage'; multiplier: number; duration: number };

export interface TriggerDef {
  affixId: string;
  condition: TriggerCondition;
  chance: number; // 0-1
  cooldown: number; // seconds (0 = no cooldown)
  effect: TriggerEffect;
}
