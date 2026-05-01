import type { DerivedStats, Element } from '../types/derived-stats.js';
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
import { createGladiator, effectiveMaxHP } from './gladiator.js';
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

        // Read element amplifier on the DOT's target (this gladiator).
        // Amplifier accelerates ticks (tickMultiplier > 1 → shorter effective
        // interval) and scales per-tick damage (stackMultiplier > 1).
        const amp = g.elementAmplifiers[dot.element];
        const stackMul = amp?.stackMultiplier ?? 1.0;
        const tickMul = amp?.tickMultiplier ?? 1.0;
        const effectiveTickInterval = dot.tickInterval / tickMul;

        // Advance accumulator
        dot.accumulator = Math.round((dot.accumulator + STEP_DURATION) * 10) / 10;

        // Fire DOT when accumulator reaches the (amplifier-adjusted) interval
        if (dot.accumulator >= effectiveTickInterval) {
          dot.accumulator = 0;

          const sourcePlayer = gladiators[dot.sourcePlayerId];
          const breakdown = calculateDOTBreakdown(
            dot.element,
            dot.damagePerSecond,
            dot.stacks,
            g.stats,
            sourcePlayer.stats.elementalPenetration,
            sourcePlayer.stats.dotMultiplier,
            stackMul,
          );
          const damage = breakdown.netDamage;
          if (damage > 0) {
            const oldHP = g.currentHP;
            g.currentHP = Math.max(0, g.currentHP - damage);
            const actualDotDmg = oldHP - g.currentHP;
            if (dot.sourcePlayerId === 0) p0Damage += actualDotDmg; else p1Damage += actualDotDmg;
            log.addEvent(time, {
              type: 'dot_tick',
              target: g.playerId,
              breakdown,
              sourceAffixId: dot.sourceAffixId,
            });
            log.addEvent(time, {
              type: 'hp_change',
              player: g.playerId,
              oldHP,
              newHP: g.currentHP,
              maxHP: effectiveMaxHP(g),
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

    // Tick stat-buff durations globally so debuffs/buffs decay the same on
    // both gladiators regardless of who attacks this step. Was previously
    // ticked only on the active attacker's turn, which let buffs on the
    // slower/stunned gladiator overstay their declared duration.
    for (const g of gladiators) {
      processBuffs(g);
    }

    // Update low-HP cache after DOT damage so on_low_hp triggers fire even
    // when the gladiator never attacks this step (e.g. they're stunned and
    // their DOT brings them below 30%).
    for (let p = 0; p < 2; p++) {
      const self = gladiators[p];
      const opp = gladiators[p === 0 ? 1 : 0];
      updateLowHP(self, opp, triggers[p], rng, log, time);
    }

    // 2. HP regeneration for both gladiators
    for (let p = 0; p < 2; p++) {
      const g = gladiators[p] as GladiatorRuntime;
      if (g.stats.hpRegen > 0 && g.currentHP < effectiveMaxHP(g) && g.currentHP > 0) {
        g.regenAccumulator = Math.round((g.regenAccumulator + STEP_DURATION) * 10) / 10;
        if (g.regenAccumulator >= g.regenInterval) {
          g.regenAccumulator = 0;
          const rawHeal = g.stats.hpRegen;
          const effectiveHeal = Math.min(rawHeal, effectiveMaxHP(g) - g.currentHP);
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
              maxHP: effectiveMaxHP(g),
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

      // (Active buffs are now ticked globally at step start — see above.)

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
          attacker.attackTimer = getBuffedStat(attacker, 'attackSpeed') * attacker.slowDebuffMultiplier;
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
          attacker.attackTimer = getBuffedStat(attacker, 'attackSpeed') * attacker.slowDebuffMultiplier;
          continue;
        }

        if (isBlocked) {
          // Process on_block triggers for defender (damageContext = blocked amount)
          fireTriggers(triggers[defenderIdx], 'on_block', defender, attacker, rng, log, time, breakdown.blocked);
        }

        // Emit single attack event with breakdown
        log.addEvent(time, { type: 'attack', attacker: attacker.playerId, breakdown });

        // Also emit legacy block event for backward compatibility
        if (isBlocked) {
          log.addEvent(time, { type: 'block', blocker: defender.playerId, blockedDamage: breakdown.blocked });
        }

        // Apply barrier absorption: permanent pool first, then temporary
        // shields in FIFO (oldest first) so player-built barriers aren't
        // pre-consumed by short-lived triggered shields.
        let damageToHP = breakdown.totalNet;
        let totalAbsorbed = 0;
        if (defender.barrier > 0 && damageToHP > 0) {
          const absorbed = Math.min(defender.barrier, damageToHP);
          defender.barrier -= absorbed;
          damageToHP -= absorbed;
          totalAbsorbed += absorbed;
        }
        if (damageToHP > 0 && defender.temporaryBarriers.length > 0) {
          for (const tb of defender.temporaryBarriers) {
            if (damageToHP <= 0) break;
            const absorbed = Math.min(tb.amount, damageToHP);
            tb.amount -= absorbed;
            damageToHP -= absorbed;
            totalAbsorbed += absorbed;
          }
          // Sweep emptied entries
          defender.temporaryBarriers = defender.temporaryBarriers.filter((tb) => tb.amount > 0);
        }
        if (totalAbsorbed > 0) {
          breakdown.barrierAbsorbed = totalAbsorbed;
          log.addEvent(time, {
            type: 'barrier_absorb',
            player: defender.playerId,
            absorbed: totalAbsorbed,
            remaining: defender.barrier + defender.temporaryBarriers.reduce((s, tb) => s + tb.amount, 0),
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
            maxHP: effectiveMaxHP(defender),
          });
        }

        // Process on-hit triggers (attacker side, damageContext = net damage that landed)
        {
          const hpBefore0 = gladiators[0].currentHP;
          const hpBefore1 = gladiators[1].currentHP;
          fireTriggers(triggers[attackerIdx], 'on_hit', attacker, defender, rng, log, time, breakdown.totalNet);
          if (isCrit) {
            fireTriggers(triggers[attackerIdx], 'on_crit', attacker, defender, rng, log, time, breakdown.totalNet);
          }
          // Attribute trigger damage from attacker to defender
          const defDmg = Math.max(0, (defenderIdx === 0 ? hpBefore0 : hpBefore1) - (defenderIdx === 0 ? gladiators[0].currentHP : gladiators[1].currentHP));
          if (attackerIdx === 0) p0Damage += defDmg; else p1Damage += defDmg;
        }

        // Process on-taking-damage triggers (defender side, damageContext = net damage taken)
        {
          const hpBefore0 = gladiators[0].currentHP;
          const hpBefore1 = gladiators[1].currentHP;
          fireTriggers(triggers[defenderIdx], 'on_taking_damage', defender, attacker, rng, log, time, breakdown.totalNet);
          // Defender's triggers deal damage to attacker (bonus_damage)
          const atkDmg = Math.max(0, (attackerIdx === 0 ? hpBefore0 : hpBefore1) - (attackerIdx === 0 ? gladiators[0].currentHP : gladiators[1].currentHP));
          if (defenderIdx === 0) p0Damage += atkDmg; else p1Damage += atkDmg;
        }

        // Apply lifesteal (integer percentage -> fraction)
        const lifesteal = getBuffedStat(attacker, 'lifestealPercent');
        if (lifesteal > 0 && damageToHP > 0) {
          const rawHeal = Math.round(damageToHP * lifesteal / 100);
          if (rawHeal > 0) {
            const effectiveHeal = Math.min(rawHeal, effectiveMaxHP(attacker) - attacker.currentHP);
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
                maxHP: effectiveMaxHP(attacker),
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
            maxHP: effectiveMaxHP(attacker),
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
              maxHP: effectiveMaxHP(attacker),
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

        // Reset attack timer:
        //   slowFactor — defender's permanent slow aura (defensive stat)
        //   attacker.slowDebuffMultiplier — slow debuff applied TO the attacker
        //                                   (e.g. by frostbite via apply_slow)
        const slowFactor = 1 + (defender.stats.slowPercent ?? 0) / 100;
        attacker.attackTimer =
          getBuffedStat(attacker, 'attackSpeed') * slowFactor * attacker.slowDebuffMultiplier;
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

    // Tick down slow debuffs
    for (const g of gladiators) {
      if (g.slowDebuffRemaining > 0) {
        g.slowDebuffRemaining = Math.round((g.slowDebuffRemaining - STEP_DURATION) * 10) / 10;
        if (g.slowDebuffRemaining <= 0) {
          g.slowDebuffMultiplier = 1.0;
        }
      }
    }

    // Tick down maxHP debuffs; restore baseline on expiry. currentHP is NOT
    // refilled — players must heal back to the new effective max themselves.
    for (const g of gladiators) {
      if (g.maxHpDebuffRemaining > 0) {
        g.maxHpDebuffRemaining = Math.round((g.maxHpDebuffRemaining - STEP_DURATION) * 10) / 10;
        if (g.maxHpDebuffRemaining <= 0) {
          g.maxHpDebuffMultiplier = 1.0;
        }
      }
    }

    // Tick down element amplifiers; remove expired entries
    for (const g of gladiators) {
      for (const elem of Object.keys(g.elementAmplifiers) as Element[]) {
        const amp = g.elementAmplifiers[elem];
        if (!amp) continue;
        amp.remaining = Math.round((amp.remaining - STEP_DURATION) * 10) / 10;
        if (amp.remaining <= 0) {
          delete g.elementAmplifiers[elem];
        }
      }
    }

    // Tick down temporary barriers; sweep expired entries
    for (const g of gladiators) {
      if (g.temporaryBarriers.length === 0) continue;
      for (const tb of g.temporaryBarriers) {
        tb.remaining = Math.round((tb.remaining - STEP_DURATION) * 10) / 10;
      }
      g.temporaryBarriers = g.temporaryBarriers.filter((tb) => tb.remaining > 0 && tb.amount > 0);
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
    const hp0Pct = gladiators[0].currentHP / effectiveMaxHP(gladiators[0]);
    const hp1Pct = gladiators[1].currentHP / effectiveMaxHP(gladiators[1]);
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
    const hp0Pct = gladiators[0].currentHP / effectiveMaxHP(gladiators[0]);
    const hp1Pct = gladiators[1].currentHP / effectiveMaxHP(gladiators[1]);
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
 * Get a stat value including any active buff contributions. Additive buffs
 * are summed onto the base; multiplicative buffs are composed (product),
 * with the additive total scaled by the product. Order: (base + sum_add) * prod_mul.
 */
function getBuffedStat(gladiator: GladiatorRuntime, stat: keyof DerivedStats): number {
  let value = gladiator.stats[stat] as number;
  let mul = 1;
  for (const buff of gladiator.activeBuffs) {
    if (buff.stat !== stat) continue;
    if (buff.kind === 'add') value += buff.value;
    else mul *= buff.multiplier;
  }
  return value * mul;
}

/**
 * Fire triggers for a given condition.
 *
 * `damageContext` is the relevant damage figure for the in-flight event:
 * - on_hit / on_crit / on_taking_damage → breakdown.totalNet (damage that landed)
 * - on_block → breakdown.blocked (amount the block prevented)
 * - on_low_hp → undefined (no in-flight attack)
 * Effects without scaled-damage semantics ignore the value.
 */
function fireTriggers(
  triggerDefs: TriggerDef[],
  condition: TriggerCondition,
  owner: GladiatorRuntime,
  _opponent: GladiatorRuntime,
  rng: SeededRNG,
  log: ReturnType<typeof createCombatLog>,
  time: number,
  damageContext?: number,
): void {
  for (const trigger of triggerDefs) {
    const effects = evaluateTrigger(trigger, condition, owner, rng);
    if (!effects) continue;
    for (const effect of effects) {
      applyTriggerEffect(effect, owner, _opponent, log, time, damageContext);
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
 *
 * `damageContext` carries the in-flight attack's net damage for triggers
 * fired from on_hit / on_crit / on_taking_damage (breakdown.totalNet) and the
 * blocked amount for on_block. Effects that don't read it (most kinds) ignore
 * the value.
 *
 * Exported for testing only — callers in production go through `fireTriggers`.
 */
export function applyTriggerEffect(
  effect: TriggerEffect,
  owner: GladiatorRuntime,
  opponent: GladiatorRuntime,
  log: ReturnType<typeof createCombatLog>,
  time: number,
  damageContext?: number,
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
        maxHP: effectiveMaxHP(opponent),
      });
      break;
    }
    case 'bonus_damage_scaled': {
      const amount = Math.max(0, (damageContext ?? 0) * effect.multiplier);
      if (amount <= 0) break;
      const oldHP = opponent.currentHP;
      opponent.currentHP = Math.max(0, opponent.currentHP - amount);
      log.addEvent(time, {
        type: 'hp_change',
        player: opponent.playerId,
        oldHP,
        newHP: opponent.currentHP,
        maxHP: effectiveMaxHP(opponent),
      });
      break;
    }
    case 'damage_current_hp': {
      const amount = Math.max(0, opponent.currentHP * effect.fraction);
      if (amount <= 0) break;
      const oldHP = opponent.currentHP;
      opponent.currentHP = Math.max(0, opponent.currentHP - amount);
      log.addEvent(time, {
        type: 'hp_change',
        player: opponent.playerId,
        oldHP,
        newHP: opponent.currentHP,
        maxHP: effectiveMaxHP(opponent),
      });
      break;
    }
    case 'reduce_max_hp': {
      // Stack-by-replacement: latest debuff wins. Clamp currentHP to the new
      // effective max so the HP bar visibly shrinks.
      const clamped = Math.max(0, Math.min(1, 1 - effect.fraction));
      opponent.maxHpDebuffMultiplier = clamped;
      opponent.maxHpDebuffRemaining = effect.duration;
      const newMax = effectiveMaxHP(opponent);
      if (opponent.currentHP > newMax) {
        const oldHP = opponent.currentHP;
        opponent.currentHP = newMax;
        log.addEvent(time, {
          type: 'hp_change',
          player: opponent.playerId,
          oldHP,
          newHP: opponent.currentHP,
          maxHP: newMax,
        });
      }
      break;
    }
    case 'heal': {
      const healAmount = effect.isPercent ? effectiveMaxHP(owner) * effect.amount : effect.amount;
      const oldHP = owner.currentHP;
      owner.currentHP = Math.min(effectiveMaxHP(owner), owner.currentHP + healAmount);
      log.addEvent(time, {
        type: 'hp_change',
        player: owner.playerId,
        oldHP,
        newHP: owner.currentHP,
        maxHP: effectiveMaxHP(owner),
      });
      break;
    }
    case 'gain_barrier': {
      const barrierAmount = effect.isPercent ? effectiveMaxHP(owner) * effect.amount : effect.amount;
      if (barrierAmount <= 0) break;
      const isTemporary = (effect.duration ?? 0) > 0;
      if (isTemporary) {
        owner.temporaryBarriers.push({
          amount: barrierAmount,
          remaining: effect.duration!,
          sourceId: 'trigger',
        });
      } else {
        owner.barrier += barrierAmount;
      }
      // Surface barrier grants in the combat log so reactive_shield / bastion /
      // phoenix_embers etc. are visible to the player. Reuse `barrier_absorb`
      // event with absorbed=0 + remaining=current total — UIs that already
      // render barrier_absorb get this for free.
      log.addEvent(time, {
        type: 'barrier_absorb',
        player: owner.playerId,
        absorbed: 0,
        remaining: owner.barrier + owner.temporaryBarriers.reduce((s, tb) => s + tb.amount, 0),
      });
      break;
    }
    case 'stun': {
      // Replacement (Math.max), not stack. Avoids permastun under spam procs —
      // mirrors apply_slow / reduce_max_hp stack-by-replacement convention.
      opponent.stunTimer = Math.max(opponent.stunTimer, effect.duration);
      log.addEvent(time, {
        type: 'stun',
        target: opponent.playerId,
        duration: effect.duration,
      });
      break;
    }
    case 'stat_buff_add': {
      owner.activeBuffs.push({
        kind: 'add',
        stat: effect.stat,
        value: effect.value,
        remaining: effect.duration,
        sourceId: 'trigger',
      });
      break;
    }
    case 'stat_buff_mul': {
      owner.activeBuffs.push({
        kind: 'mul',
        stat: effect.stat,
        multiplier: effect.multiplier,
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
    case 'apply_slow': {
      // Stack-by-replacement: a fresh slow overwrites prior magnitude and
      // refreshes duration. Avoids unbounded slow stacking from spam triggers.
      opponent.slowDebuffMultiplier = effect.multiplier;
      opponent.slowDebuffRemaining = effect.duration;
      break;
    }
    case 'amplify_dot_element': {
      // Stack-by-replacement: a fresh amplifier overwrites prior values.
      opponent.elementAmplifiers[effect.element] = {
        stackMultiplier: effect.stackMultiplier,
        tickMultiplier: effect.tickMultiplier,
        remaining: effect.duration,
      };
      break;
    }
    case 'compound_dot': {
      // Compound reference implementation (Ignite).
      // Emit a compound_trigger event so the UI can surface a named callout
      // ("IGNITE!") distinct from the generic trigger_proc row, then push a
      // DOT onto the defender in the same shape as apply_dot.
      //
      // Scale convention:
      //   effect.damagePerSecond — raw DPS from buildCompoundEffect (scale-1)
      //   effect.dotMultiplier   — recipe param (scale-1, e.g. 2.0 = 2x)
      //   stats.dotMultiplier    — gladiator-level, scale-100 (100 = 1.0x),
      //                            applied later inside calculateDOTBreakdown.
      // We pre-multiply DPS by the recipe multiplier here so the stored DOT
      // reflects the compound's intrinsic potency.
      const dps = effect.damagePerSecond * effect.dotMultiplier;
      log.addEvent(time, {
        type: 'compound_trigger',
        player: owner.playerId,
        compoundId: effect.compoundId,
        displayName: `${effect.compoundId.toUpperCase()}!`,
      });
      opponent.activeDOTs.push({
        element: effect.element,
        damagePerSecond: dps,
        remaining: effect.duration,
        tickInterval: effect.tickInterval,
        accumulator: 0,
        sourceAffixId: `compound:${effect.compoundId}`,
        stacks: 1,
        sourcePlayerId: owner.playerId,
      });
      log.addEvent(time, {
        type: 'dot_apply',
        target: opponent.playerId,
        element: effect.element,
        dps,
        duration: effect.duration,
      });
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
  const isNowLow = gladiator.currentHP > 0 && gladiator.currentHP / effectiveMaxHP(gladiator) < 0.3;
  if (isNowLow && !gladiator.isLowHP) {
    gladiator.isLowHP = true;
    for (const trigger of triggerDefs) {
      const effects = evaluateTrigger(trigger, 'on_low_hp', gladiator, rng);
      if (!effects) continue;
      for (const effect of effects) {
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
