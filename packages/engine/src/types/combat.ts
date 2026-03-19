import type { DerivedStats, Element } from './derived-stats.js';

// --- Gladiator Runtime State (used during duel simulation) ---

export interface ActiveDOT {
  element: Element;
  damagePerTick: number;
  remainingTicks: number;
  sourceAffixId: string;
  stacks: number;
}

export interface ActiveBuff {
  stat: keyof DerivedStats;
  value: number;
  remainingTicks: number;
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
  cooldowns: Map<string, number>; // triggerId -> ticks until available
  attackTimer: number; // Ticks until next attack
  stunTimer: number; // Ticks remaining stunned (0 = not stunned)
  isLowHP: boolean; // Cached: currentHP / maxHP < 0.3
  reflectMultiplier: number;
  reflectTicksRemaining: number;
}

// --- Tick Events (discriminated union for combat log) ---

export type TickEvent =
  | {
      type: 'attack';
      attacker: 0 | 1;
      damage: number;
      damageType: 'physical' | Element;
      isCrit: boolean;
    }
  | { type: 'block'; blocker: 0 | 1; blockedDamage: number }
  | { type: 'dodge'; dodger: 0 | 1 }
  | { type: 'dot_apply'; target: 0 | 1; element: Element; dps: number; durationTicks: number }
  | { type: 'dot_tick'; target: 0 | 1; element: Element; damage: number }
  | { type: 'lifesteal'; player: 0 | 1; healed: number }
  | { type: 'thorns'; reflector: 0 | 1; damage: number }
  | { type: 'barrier_absorb'; player: 0 | 1; absorbed: number; remaining: number }
  | { type: 'trigger_proc'; player: 0 | 1; triggerId: string; effectDescription: string }
  | { type: 'synergy_proc'; player: 0 | 1; synergyId: string; effectDescription: string }
  | { type: 'stun'; target: 0 | 1; durationTicks: number }
  | { type: 'hp_change'; player: 0 | 1; oldHP: number; newHP: number; maxHP: number }
  | { type: 'death'; player: 0 | 1 };

// --- Combat Log ---

export interface DuelResult {
  round: number;
  winner: 0 | 1; // Individual duels always have a winner
  finalHP: [number, number];
  tickCount: number;
  duration: number; // In seconds (tickCount / ticksPerSecond)
  wasTiebreak: boolean;
  p0DamageDealt: number;
  p1DamageDealt: number;
}

export interface CombatLog {
  seed: number;
  ticks: { tick: number; events: TickEvent[] }[];
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
  | { kind: 'apply_dot'; element: Element; dps: number; durationTicks: number }
  | { kind: 'bonus_damage'; amount: number; damageType: 'physical' | Element }
  | { kind: 'heal'; amount: number; isPercent: boolean }
  | { kind: 'gain_barrier'; amount: number }
  | { kind: 'stun'; durationTicks: number }
  | {
      kind: 'stat_buff';
      stat: keyof DerivedStats;
      value: number;
      durationTicks: number;
    }
  | { kind: 'reflect_damage'; multiplier: number; durationTicks: number };

export interface TriggerDef {
  affixId: string;
  condition: TriggerCondition;
  chance: number; // 0-1
  cooldownTicks: number; // 0 = no cooldown
  effect: TriggerEffect;
}
