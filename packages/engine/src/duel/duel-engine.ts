import type { DerivedStats, Element } from '../types/derived-stats.js';
import { ALL_ELEMENTS } from '../types/derived-stats.js';
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
import { calculatePhysicalDamage, calculateElementalDamage, calculateDOTDamage } from './damage-calc.js';
import { extractTriggers, evaluateTrigger } from './trigger-system.js';
import { createCombatLog } from './combat-log.js';

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
  const maxTicks = balance.maxDuelTicks;
  const ticksPerSecond = balance.ticksPerSecond;

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
  let tickCount = 0;

  for (let tick = 0; tick < maxTicks; tick++) {
    tickCount = tick;

    // 1. Process DOTs for both gladiators
    for (let p = 0; p < 2; p++) {
      const g = gladiators[p] as GladiatorRuntime;
      const attackerIdx = p === 0 ? 1 : 0;
      const attackerStats = gladiators[attackerIdx].stats;

      for (let d = g.activeDOTs.length - 1; d >= 0; d--) {
        const dot = g.activeDOTs[d];
        const damage = calculateDOTDamage(dot, g.stats, attackerStats);
        if (damage > 0) {
          const oldHP = g.currentHP;
          g.currentHP = Math.max(0, g.currentHP - damage);
          log.addEvent(tick, { type: 'dot_tick', target: g.playerId, element: dot.element, damage });
          log.addEvent(tick, {
            type: 'hp_change',
            player: g.playerId,
            oldHP,
            newHP: g.currentHP,
            maxHP: g.maxHP,
          });
        }
        dot.remainingTicks--;
        if (dot.remainingTicks <= 0) {
          g.activeDOTs.splice(d, 1);
        }
      }
    }

    // Check death after DOTs
    const dotDeath = checkDeath(gladiators, rng, log, tick);
    if (dotDeath !== null) {
      winner = dotDeath;
      break;
    }

    // 2. HP regeneration for both gladiators
    for (let p = 0; p < 2; p++) {
      const g = gladiators[p] as GladiatorRuntime;
      if (g.stats.hpRegen > 0 && g.currentHP < g.maxHP && g.currentHP > 0) {
        const oldHP = g.currentHP;
        g.currentHP = Math.min(g.maxHP, g.currentHP + g.stats.hpRegen);
        if (g.currentHP !== oldHP) {
          log.addEvent(tick, {
            type: 'hp_change',
            player: g.playerId,
            oldHP,
            newHP: g.currentHP,
            maxHP: g.maxHP,
          });
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
          attacker.cooldowns.set(key, val - 1);
        } else {
          attacker.cooldowns.delete(key);
        }
      }

      // Decrement attack timer
      attacker.attackTimer--;

      if (attacker.attackTimer <= 0) {
        // Check stun
        if (attacker.stunTimer > 0) {
          attacker.stunTimer--;
          attacker.attackTimer = attacker.stats.attackInterval;
          continue;
        }

        // Roll dodge
        if (rng.nextBool(defender.stats.dodgeChance)) {
          log.addEvent(tick, { type: 'dodge', dodger: defender.playerId });
          attacker.attackTimer = attacker.stats.attackInterval;
          continue;
        }

        // Roll block
        const effectiveBlockChance = Math.max(0, defender.stats.blockChance - attacker.stats.blockBreakChance);
        if (rng.nextBool(effectiveBlockChance)) {
          const rawTotal = calculateTotalDamage(attacker.stats, defender.stats);
          log.addEvent(tick, { type: 'block', blocker: defender.playerId, blockedDamage: rawTotal });

          // Process on_block triggers for defender
          fireTriggers(triggers[defenderIdx], 'on_block', defender, attacker, rng, log, tick);

          attacker.attackTimer = attacker.stats.attackInterval;
          continue;
        }

        // Calculate damage
        let physDmg = calculatePhysicalDamage(attacker.stats, defender.stats);
        let totalDamage = physDmg;

        // Elemental damage
        const elemDamages: { element: Element; damage: number }[] = [];
        for (const elem of ALL_ELEMENTS) {
          const eDmg = calculateElementalDamage(attacker.stats, defender.stats, elem);
          if (eDmg > 0) {
            elemDamages.push({ element: elem, damage: eDmg });
            totalDamage += eDmg;
          }
        }

        // Roll crit
        const effectiveCritChance = Math.max(0, getBuffedStat(attacker, 'critChance') - getBuffedStat(defender, 'critAvoidance'));
        const isCrit = rng.nextBool(effectiveCritChance);
        if (isCrit) {
          totalDamage *= attacker.stats.critMultiplier;
          physDmg *= attacker.stats.critMultiplier;
          for (const ed of elemDamages) {
            ed.damage *= attacker.stats.critMultiplier;
          }
        }

        // Emit attack event (physical)
        if (physDmg > 0) {
          log.addEvent(tick, {
            type: 'attack',
            attacker: attacker.playerId,
            damage: physDmg,
            damageType: 'physical',
            isCrit,
          });
        }
        // Emit elemental attack events
        for (const ed of elemDamages) {
          log.addEvent(tick, {
            type: 'attack',
            attacker: attacker.playerId,
            damage: ed.damage,
            damageType: ed.element,
            isCrit,
          });
        }

        // Apply barrier absorption
        let damageToHP = totalDamage;
        if (defender.barrier > 0 && damageToHP > 0) {
          const absorbed = Math.min(defender.barrier, damageToHP);
          defender.barrier -= absorbed;
          damageToHP -= absorbed;
          log.addEvent(tick, {
            type: 'barrier_absorb',
            player: defender.playerId,
            absorbed,
            remaining: defender.barrier,
          });
        }

        // Apply damage to HP
        if (damageToHP > 0) {
          const oldHP = defender.currentHP;
          defender.currentHP = Math.max(0, defender.currentHP - damageToHP);
          log.addEvent(tick, {
            type: 'hp_change',
            player: defender.playerId,
            oldHP,
            newHP: defender.currentHP,
            maxHP: defender.maxHP,
          });
        }

        // Process on-hit triggers (attacker side)
        fireTriggers(triggers[attackerIdx], 'on_hit', attacker, defender, rng, log, tick);
        if (isCrit) {
          fireTriggers(triggers[attackerIdx], 'on_crit', attacker, defender, rng, log, tick);
        }

        // Process on-taking-damage triggers (defender side)
        fireTriggers(triggers[defenderIdx], 'on_taking_damage', defender, attacker, rng, log, tick);

        // Apply lifesteal
        const lifesteal = getBuffedStat(attacker, 'lifestealPercent');
        if (lifesteal > 0 && totalDamage > 0) {
          const healed = totalDamage * lifesteal;
          if (healed > 0) {
            const oldHP = attacker.currentHP;
            attacker.currentHP = Math.min(attacker.maxHP, attacker.currentHP + healed);
            log.addEvent(tick, { type: 'lifesteal', player: attacker.playerId, healed });
            if (attacker.currentHP !== oldHP) {
              log.addEvent(tick, {
                type: 'hp_change',
                player: attacker.playerId,
                oldHP,
                newHP: attacker.currentHP,
                maxHP: attacker.maxHP,
              });
            }
          }
        }

        // Apply thorns
        if (defender.stats.thornsDamage > 0) {
          const thornsDmg = defender.stats.thornsDamage;
          const oldHP = attacker.currentHP;
          attacker.currentHP = Math.max(0, attacker.currentHP - thornsDmg);
          log.addEvent(tick, { type: 'thorns', reflector: defender.playerId, damage: thornsDmg });
          log.addEvent(tick, {
            type: 'hp_change',
            player: attacker.playerId,
            oldHP,
            newHP: attacker.currentHP,
            maxHP: attacker.maxHP,
          });
        }

        // Check on-low-HP triggers
        updateLowHP(attacker, defender, triggers[attackerIdx], rng, log, tick);
        updateLowHP(defender, attacker, triggers[defenderIdx], rng, log, tick);

        // Reset attack timer
        attacker.attackTimer = attacker.stats.attackInterval;
      }
    }

    // 4. Check death
    const deathResult = checkDeath(gladiators, rng, log, tick);
    if (deathResult !== null) {
      winner = deathResult;
      break;
    }
  }

  // Post-simulation: timeout tiebreak
  let wasTiebreak = false;
  if (winner === null) {
    tickCount = maxTicks;
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
    finalHP: [gladiators[0].currentHP, gladiators[1].currentHP],
    tickCount,
    duration: tickCount / ticksPerSecond,
    wasTiebreak,
  });
}

/**
 * Calculate total raw damage (physical + all elemental) for block events.
 */
function calculateTotalDamage(attacker: DerivedStats, defender: DerivedStats): number {
  let total = calculatePhysicalDamage(attacker, defender);
  for (const elem of ALL_ELEMENTS) {
    total += calculateElementalDamage(attacker, defender, elem);
  }
  return total;
}

/**
 * Check if either gladiator is dead. Emit death events and return the winner.
 */
function checkDeath(
  gladiators: [GladiatorRuntime, GladiatorRuntime],
  rng: SeededRNG,
  log: ReturnType<typeof createCombatLog>,
  tick: number,
): 0 | 1 | null {
  const dead0 = gladiators[0].currentHP <= 0;
  const dead1 = gladiators[1].currentHP <= 0;

  if (!dead0 && !dead1) return null;

  if (dead0) log.addEvent(tick, { type: 'death', player: 0 });
  if (dead1) log.addEvent(tick, { type: 'death', player: 1 });

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
 * Process active buffs: decrement remaining ticks and remove expired ones.
 */
function processBuffs(gladiator: GladiatorRuntime): void {
  for (let i = gladiator.activeBuffs.length - 1; i >= 0; i--) {
    const buff = gladiator.activeBuffs[i];
    buff.remainingTicks--;
    if (buff.remainingTicks <= 0) {
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
  tick: number,
): void {
  for (const trigger of triggerDefs) {
    const effect = evaluateTrigger(trigger, condition, owner, rng);
    if (effect) {
      applyTriggerEffect(effect, owner, _opponent, log, tick);
      log.addEvent(tick, {
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
  tick: number,
): void {
  switch (effect.kind) {
    case 'apply_dot': {
      opponent.activeDOTs.push({
        element: effect.element,
        damagePerTick: effect.dps,
        remainingTicks: effect.durationTicks,
        sourceAffixId: 'trigger',
        stacks: 1,
      });
      log.addEvent(tick, {
        type: 'dot_apply',
        target: opponent.playerId,
        element: effect.element,
        dps: effect.dps,
        durationTicks: effect.durationTicks,
      });
      break;
    }
    case 'bonus_damage': {
      const oldHP = opponent.currentHP;
      opponent.currentHP = Math.max(0, opponent.currentHP - effect.amount);
      log.addEvent(tick, {
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
      log.addEvent(tick, {
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
      opponent.stunTimer += effect.durationTicks;
      log.addEvent(tick, {
        type: 'stun',
        target: opponent.playerId,
        durationTicks: effect.durationTicks,
      });
      break;
    }
    case 'stat_buff': {
      owner.activeBuffs.push({
        stat: effect.stat,
        value: effect.value,
        remainingTicks: effect.durationTicks,
        sourceId: 'trigger',
      });
      break;
    }
    case 'reflect_damage': {
      // Reflect damage is handled as a buff; actual reflection is processed elsewhere
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
  tick: number,
): void {
  const isNowLow = gladiator.currentHP > 0 && gladiator.currentHP / gladiator.maxHP < 0.3;
  if (isNowLow && !gladiator.isLowHP) {
    gladiator.isLowHP = true;
    for (const trigger of triggerDefs) {
      const effect = evaluateTrigger(trigger, 'on_low_hp', gladiator, rng);
      if (effect) {
        applyTriggerEffect(effect, gladiator, opponent, log, tick);
        log.addEvent(tick, {
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
