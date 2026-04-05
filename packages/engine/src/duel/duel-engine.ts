import type { DerivedStats } from '../types/derived-stats.js';
import type {
  GladiatorRuntime,
  CombatLog,
  TriggerCondition,
  TriggerDef,
  TriggerEffect,
} from '../types/combat.js';
import type { Loadout } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import { createGladiator } from './gladiator.js';
import { calculateAttackBreakdown, calculateDOTBreakdown } from './damage-calc.js';
import { extractTriggers, evaluateTrigger } from './trigger-system.js';
import { createCombatLog } from './combat-log.js';

const STEPS_PER_SECOND = 10;
const STEP_DURATION = 0.1;

/**
 * Run a full duel simulation between two gladiators.
 * All randomness is driven by the provided SeededRNG for determinism.
 */
export function simulate(
  stats: [DerivedStats, DerivedStats],
  loadouts: [Loadout, Loadout],
  registry: DataRegistry,
  rng: SeededRNG,
  round: number,
): CombatLog {
  const balance = registry.getBalance();
  const maxSteps = balance.maxDuelSeconds * STEPS_PER_SECOND;

  // Initialize gladiators
  const gladiators: [GladiatorRuntime, GladiatorRuntime] = [
    createGladiator(0, stats[0]),
    createGladiator(1, stats[1]),
  ];

  // Extract triggers from loadouts
  const triggers: [TriggerDef[], TriggerDef[]] = [
    extractTriggers(loadouts[0], registry),
    extractTriggers(loadouts[1], registry),
  ];

  const log = createCombatLog(rng.getState());

  // Determine initiative order: lower attackTimer goes first
  const firstPlayer: 0 | 1 = gladiators[0].attackTimer <= gladiators[1].attackTimer ? 0 : 1;

  let winner: 0 | 1 | null = null;
  let lastStep = 0;
  let p0Damage = 0;
  let p1Damage = 0;

  for (let step = 0; step < maxSteps; step++) {
    lastStep = step;
    const time = Math.round(step * STEP_DURATION * 10) / 10;

    // 1. Process DOTs for both gladiators
    for (let p = 0; p < 2; p++) {
      const g = gladiators[p] as GladiatorRuntime;

      for (let d = g.activeDOTs.length - 1; d >= 0; d--) {
        const dot = g.activeDOTs[d];

        // Advance accumulator
        dot.accumulator = Math.round((dot.accumulator + STEP_DURATION) * 10) / 10;

        // Fire DOT when accumulator reaches tickInterval
        if (dot.accumulator >= dot.tickInterval) {
          dot.accumulator = 0;

          const sourcePlayer = gladiators[dot.sourcePlayerId];
          const breakdown = calculateDOTBreakdown(
            dot.element,
            dot.damagePerSecond,
            dot.stacks,
            g.stats,
            sourcePlayer.stats.elementalPenetration,
            sourcePlayer.stats.dotMultiplier,
          );
          const damage = breakdown.netDamage;
          if (damage > 0) {
            const oldHP = g.currentHP;
            g.currentHP = Math.max(0, g.currentHP - damage);
            const actualDotDmg = oldHP - g.currentHP;
            if (dot.sourcePlayerId === 0) p0Damage += actualDotDmg; else p1Damage += actualDotDmg;
            log.addEvent(time, { type: 'dot_tick', target: g.playerId, breakdown });
            log.addEvent(time, {
              type: 'hp_change',
              player: g.playerId,
              oldHP,
              newHP: g.currentHP,
              maxHP: g.maxHP,
            });
          }
        }

        // Decrement remaining duration
        dot.remaining = Math.round((dot.remaining - STEP_DURATION) * 10) / 10;
        if (dot.remaining <= 0) {
          g.activeDOTs.splice(d, 1);
        }
      }
    }

    // Check death after DOTs
    const dotDeath = checkDeath(gladiators, rng, log, time);
    if (dotDeath !== null) {
      winner = dotDeath;
      break;
    }

    // 2. HP regeneration for both gladiators
    for (let p = 0; p < 2; p++) {
      const g = gladiators[p] as GladiatorRuntime;
      if (g.stats.hpRegen > 0 && g.currentHP < g.maxHP && g.currentHP > 0) {
        g.regenAccumulator = Math.round((g.regenAccumulator + STEP_DURATION) * 10) / 10;
        if (g.regenAccumulator >= g.regenInterval) {
          g.regenAccumulator = 0;
          const rawHeal = g.stats.hpRegen;
          const effectiveHeal = Math.min(rawHeal, g.maxHP - g.currentHP);
          const overheal = rawHeal - effectiveHeal;
          g.currentHP += effectiveHeal;
          if (effectiveHeal > 0) {
            const oldHP = g.currentHP - effectiveHeal;
            log.addEvent(time, {
              type: 'heal',
              player: g.playerId,
              breakdown: { source: 'regen', rawHeal, effectiveHeal, overheal },
            });
            log.addEvent(time, {
              type: 'hp_change',
              player: g.playerId,
              oldHP,
              newHP: g.currentHP,
              maxHP: g.maxHP,
            });
          }
        }
      }
    }

    // 3. Process attacks — ordered by initiative
    const order: [0, 1] | [1, 0] = firstPlayer === 0 ? [0, 1] : [1, 0];

    for (const attackerIdx of order) {
      const defenderIdx: 0 | 1 = attackerIdx === 0 ? 1 : 0;
      const attacker = gladiators[attackerIdx];
      const defender = gladiators[defenderIdx];

      // Skip dead gladiators
      if (attacker.currentHP <= 0 || defender.currentHP <= 0) continue;

      // Process active buffs: decrement and remove expired
      processBuffs(attacker);

      // Decrement cooldowns
      for (const [key, val] of attacker.cooldowns) {
        if (val > 0) {
          attacker.cooldowns.set(key, Math.round((val - STEP_DURATION) * 10) / 10);
        } else {
          attacker.cooldowns.delete(key);
        }
      }

      // Handle stun timer (before attack timer)
      if (attacker.stunTimer > 0) {
        attacker.stunTimer = Math.round((attacker.stunTimer - STEP_DURATION) * 10) / 10;
        if (attacker.stunTimer < 0) attacker.stunTimer = 0;
      }

      // Decrement attack timer
      attacker.attackTimer = Math.round((attacker.attackTimer - STEP_DURATION) * 10) / 10;

      if (attacker.attackTimer <= 0) {
        // Check stun
        if (attacker.stunTimer > 0) {
          attacker.attackTimer = attacker.stats.attackSpeed;
          continue;
        }

        // Roll dodge (integer percentage -> fraction)
        const isDodged = rng.nextBool(defender.stats.dodgeChance / 100);

        // Roll block (integer percentage -> fraction)
        const effectiveBlockChance = Math.max(0, defender.stats.blockChance - attacker.stats.blockBreakChance);
        const isBlocked = !isDodged && rng.nextBool(effectiveBlockChance / 100);
        const blockAmt = isBlocked ? defender.stats.blockAmount : 0;

        // Roll crit (integer percentages -> fractions)
        const effectiveCritChance = Math.max(0, getBuffedStat(attacker, 'critChance') - getBuffedStat(defender, 'critAvoidance'));
        const isCrit = !isDodged && rng.nextBool(effectiveCritChance / 100);

        // Calculate full attack breakdown
        const breakdown = calculateAttackBreakdown(attacker.stats, defender.stats, isCrit, isDodged, blockAmt);

        if (isDodged) {
          // Emit attack event with dodged breakdown + legacy dodge event
          log.addEvent(time, { type: 'attack', attacker: attacker.playerId, breakdown });
          log.addEvent(time, { type: 'dodge', dodger: defender.playerId });
          attacker.attackTimer = attacker.stats.attackSpeed;
          continue;
        }

        if (isBlocked) {
          // Process on_block triggers for defender
          fireTriggers(triggers[defenderIdx], 'on_block', defender, attacker, rng, log, time);
        }

        // Emit single attack event with breakdown
        log.addEvent(time, { type: 'attack', attacker: attacker.playerId, breakdown });

        // Also emit legacy block event for backward compatibility
        if (isBlocked) {
          log.addEvent(time, { type: 'block', blocker: defender.playerId, blockedDamage: breakdown.blocked });
        }

        // Apply barrier absorption
        let damageToHP = breakdown.totalNet;
        if (defender.barrier > 0 && damageToHP > 0) {
          const absorbed = Math.min(defender.barrier, damageToHP);
          defender.barrier -= absorbed;
          damageToHP -= absorbed;
          breakdown.barrierAbsorbed = absorbed;
          log.addEvent(time, {
            type: 'barrier_absorb',
            player: defender.playerId,
            absorbed,
            remaining: defender.barrier,
          });
        }

        // Apply damage to HP (allow negative for tiebreak resolution)
        if (damageToHP > 0) {
          const oldHP = defender.currentHP;
          defender.currentHP -= damageToHP;
          const actualHpDmg = oldHP - Math.max(0, defender.currentHP);
          if (attackerIdx === 0) p0Damage += actualHpDmg; else p1Damage += actualHpDmg;
          log.addEvent(time, {
            type: 'hp_change',
            player: defender.playerId,
            oldHP: Math.max(0, oldHP),
            newHP: Math.max(0, defender.currentHP),
            maxHP: defender.maxHP,
          });
        }

        // Process on-hit triggers (attacker side)
        {
          const hpBefore0 = gladiators[0].currentHP;
          const hpBefore1 = gladiators[1].currentHP;
          fireTriggers(triggers[attackerIdx], 'on_hit', attacker, defender, rng, log, time);
          if (isCrit) {
            fireTriggers(triggers[attackerIdx], 'on_crit', attacker, defender, rng, log, time);
          }
          // Attribute trigger damage from attacker to defender
          const defDmg = Math.max(0, (defenderIdx === 0 ? hpBefore0 : hpBefore1) - (defenderIdx === 0 ? gladiators[0].currentHP : gladiators[1].currentHP));
          if (attackerIdx === 0) p0Damage += defDmg; else p1Damage += defDmg;
        }

        // Process on-taking-damage triggers (defender side)
        {
          const hpBefore0 = gladiators[0].currentHP;
          const hpBefore1 = gladiators[1].currentHP;
          fireTriggers(triggers[defenderIdx], 'on_taking_damage', defender, attacker, rng, log, time);
          // Defender's triggers deal damage to attacker (bonus_damage)
          const atkDmg = Math.max(0, (attackerIdx === 0 ? hpBefore0 : hpBefore1) - (attackerIdx === 0 ? gladiators[0].currentHP : gladiators[1].currentHP));
          if (defenderIdx === 0) p0Damage += atkDmg; else p1Damage += atkDmg;
        }

        // Apply lifesteal (integer percentage -> fraction)
        const lifesteal = getBuffedStat(attacker, 'lifestealPercent');
        if (lifesteal > 0 && damageToHP > 0) {
          const rawHeal = Math.round(damageToHP * lifesteal / 100);
          if (rawHeal > 0) {
            const effectiveHeal = Math.min(rawHeal, attacker.maxHP - attacker.currentHP);
            const overheal = rawHeal - effectiveHeal;
            const oldHP = attacker.currentHP;
            attacker.currentHP += effectiveHeal;
            log.addEvent(time, {
              type: 'heal',
              player: attacker.playerId,
              breakdown: { source: 'lifesteal', rawHeal, effectiveHeal, overheal },
            });
            // Legacy lifesteal event for backward compatibility
            log.addEvent(time, { type: 'lifesteal', player: attacker.playerId, healed: effectiveHeal });
            if (attacker.currentHP !== oldHP) {
              log.addEvent(time, {
                type: 'hp_change',
                player: attacker.playerId,
                oldHP,
                newHP: attacker.currentHP,
                maxHP: attacker.maxHP,
              });
            }
          }
        }

        // Apply thorns (allow negative for tiebreak resolution)
        if (defender.stats.thornsDamage > 0) {
          const thornsDmg = defender.stats.thornsDamage;
          const oldHP = attacker.currentHP;
          attacker.currentHP -= thornsDmg;
          const actualThornsDmg = oldHP - Math.max(0, attacker.currentHP);
          if (defenderIdx === 0) p0Damage += actualThornsDmg; else p1Damage += actualThornsDmg;
          log.addEvent(time, { type: 'thorns', reflector: defender.playerId, damage: thornsDmg });
          log.addEvent(time, {
            type: 'hp_change',
            player: attacker.playerId,
            oldHP: Math.max(0, oldHP),
            newHP: Math.max(0, attacker.currentHP),
            maxHP: attacker.maxHP,
          });
        }

        // Reflect damage (from reflect_damage trigger)
        if (defender.reflectMultiplier > 0 && breakdown.totalNet > 0) {
          const reflected = Math.round(breakdown.totalNet * defender.reflectMultiplier);
          if (reflected > 0) {
            const oldHP = attacker.currentHP;
            attacker.currentHP = Math.max(0, attacker.currentHP - reflected);
            const actualReflect = oldHP - attacker.currentHP;
            if (defenderIdx === 0) p0Damage += actualReflect; else p1Damage += actualReflect;
            log.addEvent(time, { type: 'thorns', reflector: defender.playerId, damage: reflected });
            log.addEvent(time, {
              type: 'hp_change',
              player: attacker.playerId,
              oldHP,
              newHP: attacker.currentHP,
              maxHP: attacker.maxHP,
            });
          }
        }

        // Check on-low-HP triggers
        {
          const hpBefore0 = gladiators[0].currentHP;
          const hpBefore1 = gladiators[1].currentHP;
          updateLowHP(attacker, defender, triggers[attackerIdx], rng, log, time);
          // Attacker's low-HP triggers may damage defender
          const defLowHpDmg = Math.max(0, (defenderIdx === 0 ? hpBefore0 : hpBefore1) - (defenderIdx === 0 ? gladiators[0].currentHP : gladiators[1].currentHP));
          if (attackerIdx === 0) p0Damage += defLowHpDmg; else p1Damage += defLowHpDmg;
        }
        {
          const hpBefore0 = gladiators[0].currentHP;
          const hpBefore1 = gladiators[1].currentHP;
          updateLowHP(defender, attacker, triggers[defenderIdx], rng, log, time);
          // Defender's low-HP triggers may damage attacker
          const atkLowHpDmg = Math.max(0, (attackerIdx === 0 ? hpBefore0 : hpBefore1) - (attackerIdx === 0 ? gladiators[0].currentHP : gladiators[1].currentHP));
          if (defenderIdx === 0) p0Damage += atkLowHpDmg; else p1Damage += atkLowHpDmg;
        }

        // Roll stun chance on hit (not dodged)
        if (attacker.stats.stunChance > 0 && defender.stunTimer <= 0) {
          if (rng.nextBool(attacker.stats.stunChance / 100)) {
            const stunDuration = 0.5; // 0.5 second stun
            defender.stunTimer += stunDuration;
            log.addEvent(time, { type: 'stun', target: defender.playerId, duration: stunDuration });
          }
        }

        // Reset attack timer (slowPercent increases effective attack speed = slower attacks)
        const slowFactor = 1 + (defender.stats.slowPercent ?? 0) / 100;
        attacker.attackTimer = attacker.stats.attackSpeed * slowFactor;
      }
    }

    // Tick down reflect buffs
    for (const g of gladiators) {
      if (g.reflectRemaining > 0) {
        g.reflectRemaining = Math.round((g.reflectRemaining - STEP_DURATION) * 10) / 10;
        if (g.reflectRemaining <= 0) {
          g.reflectMultiplier = 0;
        }
      }
    }

    // 4. Check death
    const deathResult = checkDeath(gladiators, rng, log, time);
    if (deathResult !== null) {
      winner = deathResult;
      break;
    }
  }

  // Post-simulation: timeout tiebreak
  let wasTiebreak = false;
  const duration = Math.round(lastStep * STEP_DURATION * 10) / 10;
  if (winner === null) {
    wasTiebreak = true;
    const hp0Pct = gladiators[0].currentHP / gladiators[0].maxHP;
    const hp1Pct = gladiators[1].currentHP / gladiators[1].maxHP;
    if (hp0Pct > hp1Pct) {
      winner = 0;
    } else if (hp1Pct > hp0Pct) {
      winner = 1;
    } else {
      winner = rng.nextBool(0.5) ? 0 : 1;
    }
  }

  return log.finalize({
    round,
    winner,
    finalHP: [Math.max(0, gladiators[0].currentHP), Math.max(0, gladiators[1].currentHP)],
    duration: wasTiebreak ? balance.maxDuelSeconds : duration,
    wasTiebreak,
    p0DamageDealt: p0Damage,
    p1DamageDealt: p1Damage,
  });
}

/**
 * Check if either gladiator is dead. Emit death events and return the winner.
 */
function checkDeath(
  gladiators: [GladiatorRuntime, GladiatorRuntime],
  rng: SeededRNG,
  log: ReturnType<typeof createCombatLog>,
  time: number,
): 0 | 1 | null {
  const dead0 = gladiators[0].currentHP <= 0;
  const dead1 = gladiators[1].currentHP <= 0;

  if (!dead0 && !dead1) return null;

  if (dead0) log.addEvent(time, { type: 'death', player: 0 });
  if (dead1) log.addEvent(time, { type: 'death', player: 1 });

  if (dead0 && dead1) {
    // Both die: higher HP% wins, or RNG tiebreak
    const hp0Pct = gladiators[0].currentHP / gladiators[0].maxHP;
    const hp1Pct = gladiators[1].currentHP / gladiators[1].maxHP;
    if (hp0Pct > hp1Pct) return 0;
    if (hp1Pct > hp0Pct) return 1;
    return rng.nextBool(0.5) ? 0 : 1;
  }

  return dead0 ? 1 : 0;
}

/**
 * Process active buffs: decrement remaining duration and remove expired ones.
 */
function processBuffs(gladiator: GladiatorRuntime): void {
  for (let i = gladiator.activeBuffs.length - 1; i >= 0; i--) {
    const buff = gladiator.activeBuffs[i];
    buff.remaining = Math.round((buff.remaining - STEP_DURATION) * 10) / 10;
    if (buff.remaining <= 0) {
      gladiator.activeBuffs.splice(i, 1);
    }
  }
}

/**
 * Get a stat value including any active buff contributions.
 */
function getBuffedStat(gladiator: GladiatorRuntime, stat: keyof DerivedStats): number {
  let value = gladiator.stats[stat] as number;
  for (const buff of gladiator.activeBuffs) {
    if (buff.stat === stat) {
      value += buff.value;
    }
  }
  return value;
}

/**
 * Fire triggers for a given condition.
 */
function fireTriggers(
  triggerDefs: TriggerDef[],
  condition: TriggerCondition,
  owner: GladiatorRuntime,
  _opponent: GladiatorRuntime,
  rng: SeededRNG,
  log: ReturnType<typeof createCombatLog>,
  time: number,
): void {
  for (const trigger of triggerDefs) {
    const effect = evaluateTrigger(trigger, condition, owner, rng);
    if (effect) {
      applyTriggerEffect(effect, owner, _opponent, log, time);
      log.addEvent(time, {
        type: 'trigger_proc',
        player: owner.playerId,
        triggerId: trigger.affixId,
        effectDescription: effect.kind,
      });
    }
  }
}

/**
 * Apply a trigger effect to the game state.
 */
function applyTriggerEffect(
  effect: TriggerEffect,
  owner: GladiatorRuntime,
  opponent: GladiatorRuntime,
  log: ReturnType<typeof createCombatLog>,
  time: number,
): void {
  switch (effect.kind) {
    case 'apply_dot': {
      opponent.activeDOTs.push({
        element: effect.element,
        damagePerSecond: effect.dps,
        remaining: effect.duration,
        tickInterval: 1.0,
        accumulator: 0,
        sourceAffixId: 'trigger',
        stacks: 1,
        sourcePlayerId: owner.playerId,
      });
      log.addEvent(time, {
        type: 'dot_apply',
        target: opponent.playerId,
        element: effect.element,
        dps: effect.dps,
        duration: effect.duration,
      });
      break;
    }
    case 'bonus_damage': {
      const oldHP = opponent.currentHP;
      opponent.currentHP = Math.max(0, opponent.currentHP - effect.amount);
      log.addEvent(time, {
        type: 'hp_change',
        player: opponent.playerId,
        oldHP,
        newHP: opponent.currentHP,
        maxHP: opponent.maxHP,
      });
      break;
    }
    case 'heal': {
      const healAmount = effect.isPercent ? owner.maxHP * effect.amount : effect.amount;
      const oldHP = owner.currentHP;
      owner.currentHP = Math.min(owner.maxHP, owner.currentHP + healAmount);
      log.addEvent(time, {
        type: 'hp_change',
        player: owner.playerId,
        oldHP,
        newHP: owner.currentHP,
        maxHP: owner.maxHP,
      });
      break;
    }
    case 'gain_barrier': {
      owner.barrier += effect.amount;
      break;
    }
    case 'stun': {
      opponent.stunTimer += effect.duration;
      log.addEvent(time, {
        type: 'stun',
        target: opponent.playerId,
        duration: effect.duration,
      });
      break;
    }
    case 'stat_buff': {
      owner.activeBuffs.push({
        stat: effect.stat,
        value: effect.value,
        remaining: effect.duration,
        sourceId: 'trigger',
      });
      break;
    }
    case 'reflect_damage': {
      owner.reflectMultiplier = effect.multiplier;
      owner.reflectRemaining = effect.duration;
      break;
    }
  }
}

/**
 * Check and update low-HP status, firing on_low_hp triggers if newly triggered.
 */
function updateLowHP(
  gladiator: GladiatorRuntime,
  opponent: GladiatorRuntime,
  triggerDefs: TriggerDef[],
  rng: SeededRNG,
  log: ReturnType<typeof createCombatLog>,
  time: number,
): void {
  const isNowLow = gladiator.currentHP > 0 && gladiator.currentHP / gladiator.maxHP < 0.3;
  if (isNowLow && !gladiator.isLowHP) {
    gladiator.isLowHP = true;
    for (const trigger of triggerDefs) {
      const effect = evaluateTrigger(trigger, 'on_low_hp', gladiator, rng);
      if (effect) {
        applyTriggerEffect(effect, gladiator, opponent, log, time);
        log.addEvent(time, {
          type: 'trigger_proc',
          player: gladiator.playerId,
          triggerId: trigger.affixId,
          effectDescription: effect.kind,
        });
      }
    }
  } else if (!isNowLow) {
    gladiator.isLowHP = false;
  }
}
