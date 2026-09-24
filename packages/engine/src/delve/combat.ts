import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { FightEvent, FightState, HeroStats, MonsterInstance } from '../types/delve.js';
import { armorReduction } from './hero-stats.js';

/**
 * Delve combat: an event-driven 1v1 simulation.
 *
 * Every scheduled action (hero swing, monster swing, burn tick, regen tick)
 * has an absolute timestamp. `stepFight` processes all actions up to `t + dt`
 * in timestamp order, so results are identical regardless of how the caller
 * chunks time — the client can drive it from requestAnimationFrame at any
 * playback speed and stay deterministic.
 */

const BURN_TICK = 0.5;
const REGEN_TICK = 1;
const OPENING_DELAY = 0.4;

export interface CreateFightOptions {
  hero: HeroStats;
  monster: MonsterInstance;
  heroHpFrac: number;
  depth: number;
  /** False once Phoenix Plume has been spent this dive. */
  phoenixAvailable: boolean;
}

export function createFight(_registry: DataRegistry, opts: CreateFightOptions, rng: SeededRNG): FightState {
  const hasRegen = opts.monster.traits.includes('regenerating');
  return {
    t: 0,
    rng,
    depth: opts.depth,
    hero: opts.hero,
    monster: opts.monster,
    heroHp: Math.max(1, opts.hero.maxHp * Math.min(1, opts.heroHpFrac)),
    monsterHp: opts.monster.maxHp,
    heroNextAttack: OPENING_DELAY,
    monsterNextAttack: OPENING_DELAY + opts.monster.attackInterval * 0.75,
    attackCount: 0,
    slamCharge: 0,
    burnDps: 0,
    burnUntil: 0,
    burnNextTick: Infinity,
    chillUntil: 0,
    regenNextTick: hasRegen ? REGEN_TICK : Infinity,
    bulwarkUsed: false,
    phoenixAvailable: opts.phoenixAvailable,
    phoenixUsed: false,
    over: false,
    winner: null,
  };
}

export function slamChargeMax(registry: DataRegistry, f: FightState): number {
  const base = registry.getDelveBalance().slam.chargeMax;
  return Math.max(1, Math.round(base * (f.hero.legendaries.seismic_slam ? 2 / 3 : 1)));
}

export function isSlamReady(registry: DataRegistry, f: FightState): boolean {
  return !f.over && f.slamCharge >= slamChargeMax(registry, f);
}

function enrageMultiplier(registry: DataRegistry, t: number): number {
  const m = registry.getDelveBalance().monster;
  if (t < m.enrageSeconds) return 1;
  return Math.pow(2, 1 + Math.floor((t - m.enrageSeconds) / m.enrageInterval));
}

export function isEnraged(registry: DataRegistry, f: FightState): boolean {
  return enrageMultiplier(registry, f.t) > 1;
}

function chillSlowPct(registry: DataRegistry, hero: HeroStats): number {
  return (hero.coldDamage > 0 ? registry.getDelveBalance().elements.chillSlow : 0) + (hero.legendaries.frostbite ?? 0);
}

function killMonster(f: FightState, events: FightEvent[]): void {
  f.monsterHp = 0;
  f.over = true;
  f.winner = 'hero';
  events.push({ kind: 'death', t: f.t, target: 'monster' });
  if (f.hero.healOnKill > 0) {
    const amount = Math.min(f.hero.maxHp - f.heroHp, f.hero.maxHp * f.hero.healOnKill);
    if (amount > 0) {
      f.heroHp += amount;
      events.push({ kind: 'heal', t: f.t, target: 'hero', amount, source: 'kill' });
    }
  }
}

function checkHeroDeath(f: FightState, events: FightEvent[]): void {
  if (f.heroHp > 0 || f.over) return;
  const phoenix = f.hero.legendaries.phoenix_plume ?? 0;
  if (phoenix > 0 && f.phoenixAvailable && !f.phoenixUsed) {
    f.phoenixUsed = true;
    f.heroHp = f.hero.maxHp * (phoenix / 100);
    events.push({ kind: 'revive', t: f.t, amount: f.heroHp });
    return;
  }
  f.heroHp = 0;
  f.over = true;
  f.winner = 'monster';
  events.push({ kind: 'death', t: f.t, target: 'hero' });
}

/** Damage the monster; returns true when it died. */
function damageMonster(f: FightState, amount: number, events: FightEvent[]): boolean {
  f.monsterHp -= amount;
  if (f.monsterHp <= 0) {
    killMonster(f, events);
    return true;
  }
  return false;
}

function healHero(f: FightState, amount: number, source: 'lifesteal' | 'potion', events: FightEvent[]): void {
  const healed = Math.min(f.hero.maxHp - f.heroHp, amount);
  if (healed <= 0) return;
  f.heroHp += healed;
  events.push({ kind: 'heal', t: f.t, target: 'hero', amount: healed, source });
}

/** Executioner multiplier against a low-life monster. */
function executeMult(f: FightState): number {
  const exec = f.hero.legendaries.executioner ?? 0;
  return exec > 0 && f.monsterHp / f.monster.maxHp < 0.3 ? 1 + exec / 100 : 1;
}

function dealHeroHit(
  registry: DataRegistry,
  f: FightState,
  events: FightEvent[],
  mult: number,
  extra?: 'twin',
): void {
  const bal = registry.getDelveBalance();
  const h = f.hero;
  const L = h.legendaries;
  const crit = f.rng.next() < h.critChance;
  const scale = h.damageMult * (crit ? h.critMultiplier : 1) * executeMult(f) * mult;
  const armored = f.monster.traits.includes('armored') ? 1 - bal.monster.traits.armoredReduction : 1;

  const phys = h.weaponDamage * scale * armored;
  const fire = h.fireDamage * scale;
  const cold = h.coldDamage * scale;
  const light = h.lightningDamage * scale;
  const total = phys + fire + cold + light;

  let element: 'fire' | 'cold' | 'lightning' | undefined;
  const elemTotal = fire + cold + light;
  if (elemTotal >= total * 0.4) {
    element = fire >= cold && fire >= light ? 'fire' : cold >= light ? 'cold' : 'lightning';
  }

  events.push({ kind: 'hit', t: f.t, source: 'hero', amount: total, crit, element, extra });
  if (damageMonster(f, total, events)) return;

  // Sustain
  healHero(f, total * h.lifesteal + h.lifeOnHit, 'lifesteal', events);

  // Spiked monsters bite back
  if (f.monster.traits.includes('spiked')) {
    const reflect = total * bal.monster.traits.spikedFraction;
    f.heroHp -= reflect;
    events.push({ kind: 'thorns', t: f.t, source: 'monster', amount: reflect });
    checkHeroDeath(f, events);
    if (f.over) return;
  }

  // Burn (fire rider + Emberheart)
  const ember = L.emberheart ?? 0;
  if (h.fireDamage > 0 || ember > 0) {
    const newDps =
      (fire * bal.elements.burnFraction) / bal.elements.burnDuration + (ember > 0 ? (total * ember) / 100 / 3 : 0);
    const duration = Math.max(h.fireDamage > 0 ? bal.elements.burnDuration : 0, ember > 0 ? 3 : 0);
    const active = f.t < f.burnUntil;
    f.burnDps = Math.max(active ? f.burnDps : 0, newDps);
    f.burnUntil = Math.max(f.burnUntil, f.t + duration);
    if (f.burnNextTick === Infinity) f.burnNextTick = f.t + BURN_TICK;
  }

  // Chill (cold rider + Frostbite)
  if (chillSlowPct(registry, h) > 0) {
    if (f.t >= f.chillUntil) events.push({ kind: 'chill', t: f.t });
    f.chillUntil = f.t + bal.elements.chillDuration;
  }

  // Lightning chain
  if (h.lightningDamage > 0 && f.rng.next() < bal.elements.chainChance / 100) {
    const amount = h.lightningDamage * h.damageMult * executeMult(f);
    events.push({ kind: 'hit', t: f.t, source: 'hero', amount, crit: false, element: 'lightning', extra: 'chain' });
    if (damageMonster(f, amount, events)) return;
  }

  // Stormcaller
  const storm = L.stormcaller ?? 0;
  if (storm > 0 && f.rng.next() < storm / 100) {
    const amount = h.weaponDamage * h.damageMult * 1.5 * executeMult(f);
    events.push({ kind: 'hit', t: f.t, source: 'hero', amount, crit: false, element: 'lightning', extra: 'storm' });
    damageMonster(f, amount, events);
  }
}

function heroAttack(registry: DataRegistry, f: FightState, events: FightEvent[]): void {
  const bal = registry.getDelveBalance();
  const h = f.hero;
  f.attackCount++;
  f.slamCharge = Math.min(slamChargeMax(registry, f), f.slamCharge + 1);
  dealHeroHit(registry, f, events, 1);
  const twin = h.legendaries.twin_fang ?? 0;
  if (!f.over && twin > 0 && f.attackCount % 3 === 0) dealHeroHit(registry, f, events, twin / 100, 'twin');
  if (f.over) return;

  const hpFrac = Math.max(0, Math.min(1, f.heroHp / h.maxHp));
  const berserk = 1 + ((h.legendaries.berserker ?? 0) / 100) * (1 - hpFrac);
  f.heroNextAttack = f.t + Math.max(bal.hero.minAttackInterval, h.attackInterval / berserk);
}

function monsterAttack(registry: DataRegistry, f: FightState, events: FightEvent[]): void {
  const bal = registry.getDelveBalance();
  const h = f.hero;
  const m = f.monster;
  const dodged = f.rng.next() < h.dodge;

  if (dodged) {
    events.push({ kind: 'hit', t: f.t, source: 'monster', amount: 0, crit: false, dodged: true });
  } else if ((h.legendaries.bulwark ?? 0) > 0 && !f.bulwarkUsed) {
    f.bulwarkUsed = true;
    events.push({ kind: 'hit', t: f.t, source: 'monster', amount: 0, crit: false, blocked: true });
  } else {
    const dmg = m.damage * enrageMultiplier(registry, f.t) * (1 - armorReduction(bal, h.armor, f.depth));
    f.heroHp -= dmg;
    events.push({ kind: 'hit', t: f.t, source: 'monster', amount: dmg, crit: false });

    if (m.traits.includes('vampiric')) {
      const heal = Math.min(m.maxHp - f.monsterHp, dmg * bal.monster.traits.vampiricFraction);
      if (heal > 0) {
        f.monsterHp += heal;
        events.push({ kind: 'heal', t: f.t, target: 'monster', amount: heal, source: 'vampiric' });
      }
    }

    const reflect = h.thorns + dmg * ((h.legendaries.thornmail ?? 0) / 100);
    if (reflect > 0) {
      events.push({ kind: 'thorns', t: f.t, source: 'hero', amount: reflect });
      if (damageMonster(f, reflect, events)) return;
    }
    checkHeroDeath(f, events);
    if (f.over) return;
  }

  const chilled = f.t < f.chillUntil;
  const slow = chilled ? 1 + chillSlowPct(registry, h) / 100 : 1;
  f.monsterNextAttack = f.t + m.attackInterval * slow;
}

function burnTick(f: FightState, events: FightEvent[]): void {
  const amount = f.burnDps * BURN_TICK;
  if (amount > 0) {
    events.push({ kind: 'burn', t: f.t, amount });
    if (damageMonster(f, amount, events)) return;
  }
  if (f.t + BURN_TICK <= f.burnUntil + 1e-9) {
    f.burnNextTick = f.t + BURN_TICK;
  } else {
    f.burnNextTick = Infinity;
    f.burnDps = 0;
  }
}

function regenTick(registry: DataRegistry, f: FightState, events: FightEvent[]): void {
  const amount = Math.min(
    f.monster.maxHp - f.monsterHp,
    f.monster.maxHp * registry.getDelveBalance().monster.traits.regenPerSecond,
  );
  if (amount > 0) {
    f.monsterHp += amount;
    events.push({ kind: 'heal', t: f.t, target: 'monster', amount, source: 'regen' });
  }
  f.regenNextTick = f.t + REGEN_TICK;
}

/** Advance the fight by `dt` seconds. Mutates `f`; returns what happened. */
export function stepFight(registry: DataRegistry, f: FightState, dt: number): FightEvent[] {
  const events: FightEvent[] = [];
  if (f.over || dt <= 0) return events;
  const end = f.t + dt;
  let guard = 0;
  while (!f.over && guard++ < 100_000) {
    const next = Math.min(f.heroNextAttack, f.burnNextTick, f.monsterNextAttack, f.regenNextTick);
    if (next > end) break;
    f.t = next;
    if (f.heroNextAttack === next) heroAttack(registry, f, events);
    else if (f.burnNextTick === next) burnTick(f, events);
    else if (f.monsterNextAttack === next) monsterAttack(registry, f, events);
    else regenTick(registry, f, events);
  }
  if (!f.over) f.t = end;
  return events;
}

/** Player-activated heavy strike. No-op (empty events) unless fully charged. */
export function triggerSlam(registry: DataRegistry, f: FightState): FightEvent[] {
  if (!isSlamReady(registry, f)) return [];
  const bal = registry.getDelveBalance();
  const h = f.hero;
  const events: FightEvent[] = [];
  const crit = f.rng.next() < h.critChance;
  const armored = f.monster.traits.includes('armored') ? 1 - bal.monster.traits.armoredReduction : 1;
  const seismic = 1 + (h.legendaries.seismic_slam ?? 0) / 100;
  const amount =
    h.weaponDamage * h.damageMult * bal.slam.damageMult * seismic * (crit ? h.critMultiplier : 1) * executeMult(f) * armored;
  f.slamCharge = 0;
  events.push({ kind: 'slam', t: f.t, amount, crit });
  if (damageMonster(f, amount, events)) return events;
  f.monsterNextAttack = Math.max(f.monsterNextAttack, f.t) + bal.slam.stunSeconds;
  return events;
}

/** Heal the hero by a fraction of max life (potions). */
export function healHeroInFight(f: FightState, fraction: number): FightEvent | null {
  const events: FightEvent[] = [];
  healHero(f, f.hero.maxHp * fraction, 'potion', events);
  return events[0] ?? null;
}

/** Swap in new hero stats mid-fight (gear changed), keeping the life fraction. */
export function refreshFightHero(f: FightState, hero: HeroStats): void {
  const frac = f.heroHp / f.hero.maxHp;
  f.hero = hero;
  f.heroHp = Math.max(1, hero.maxHp * frac);
}

export interface RunFightOptions {
  autoSlam?: boolean;
  /** Drink when life falls below this fraction (callback decides if a potion exists). */
  onLowLife?: (f: FightState) => void;
  maxSeconds?: number;
  step?: number;
}

/** Headless helper: run a fight to completion (tests, autopilot, skip button). */
export function runFightToEnd(registry: DataRegistry, f: FightState, opts: RunFightOptions = {}): FightEvent[] {
  const step = opts.step ?? 0.25;
  const maxSeconds = opts.maxSeconds ?? 600;
  const events: FightEvent[] = [];
  while (!f.over && f.t < maxSeconds) {
    events.push(...stepFight(registry, f, step));
    if (f.over) break;
    if (opts.autoSlam && isSlamReady(registry, f)) events.push(...triggerSlam(registry, f));
    opts.onLowLife?.(f);
  }
  return events;
}
