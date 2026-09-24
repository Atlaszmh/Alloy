import type { DataRegistry } from '../data/registry.js';
import type { DelveBalance, HeroStats } from '../types/delve.js';
import type { EquippedGear, GearItem, HeroStatKey, StatRoll } from '../types/gear.js';
import { GEAR_SLOTS } from '../types/gear.js';

export interface ItemStatLine extends StatRoll {
  source: 'implicit' | 'affix';
}

/** Multiplier an item's upgrade level applies to all of its stats. */
export function upgradeMultiplier(registry: DataRegistry, upgrade: number): number {
  return 1 + registry.getDelveBalance().forge.upgradeStep * upgrade;
}

/** Stat lines of an item with its forge upgrade applied. */
export function itemStatLines(item: GearItem, registry: DataRegistry): ItemStatLine[] {
  const mult = upgradeMultiplier(registry, item.upgrade);
  return [
    ...item.implicits.map((s) => ({ ...s, value: s.value * mult, source: 'implicit' as const })),
    ...item.affixes.map((s) => ({ ...s, value: s.value * mult, source: 'affix' as const })),
  ];
}

function emptyTotals(): Record<HeroStatKey, number> {
  return {
    damage: 0,
    fireDamage: 0,
    coldDamage: 0,
    lightningDamage: 0,
    damagePct: 0,
    attackSpeedPct: 0,
    critChance: 0,
    critDamage: 0,
    maxHp: 0,
    hpPct: 0,
    armor: 0,
    dodge: 0,
    lifesteal: 0,
    lifeOnHit: 0,
    healOnKill: 0,
    thorns: 0,
    magicFind: 0,
    scrapFind: 0,
  };
}

export function computeHeroStats(equipped: EquippedGear, registry: DataRegistry): HeroStats {
  const bal = registry.getDelveBalance();
  const totals = emptyTotals();
  const legendaries: Record<string, number> = {};

  for (const slot of GEAR_SLOTS) {
    const item = equipped[slot];
    if (!item) continue;
    for (const line of itemStatLines(item, registry)) totals[line.stat] += line.value;
    if (item.legendary) {
      const { id, value } = item.legendary;
      legendaries[id] = Math.max(legendaries[id] ?? 0, value);
    }
  }

  const weapon = equipped.weapon;
  const baseInterval = weapon
    ? (registry.getGearBase(weapon.baseId).attackInterval ?? bal.hero.unarmedInterval)
    : bal.hero.unarmedInterval;

  const glass = legendaries.glass_cannon ?? 0;
  const bulwark = legendaries.bulwark ?? 0;
  const lucky = legendaries.lucky_charm ?? 0;

  return {
    maxHp: (bal.hero.baseHp + totals.maxHp) * (1 + totals.hpPct / 100) * (glass > 0 ? 0.8 : 1),
    armor: totals.armor * (1 + bulwark / 100),
    weaponDamage: (weapon ? 0 : bal.hero.unarmedDamage) + totals.damage,
    fireDamage: totals.fireDamage,
    coldDamage: totals.coldDamage,
    lightningDamage: totals.lightningDamage,
    damageMult: 1 + (totals.damagePct + glass) / 100,
    attackInterval: Math.max(bal.hero.minAttackInterval, baseInterval / (1 + totals.attackSpeedPct / 100)),
    critChance: Math.min(bal.hero.critCap, bal.hero.baseCritChance + totals.critChance) / 100,
    critMultiplier: (bal.hero.baseCritMultiplier + totals.critDamage) / 100,
    dodge: Math.min(bal.hero.dodgeCap, totals.dodge) / 100,
    lifesteal: totals.lifesteal / 100,
    lifeOnHit: totals.lifeOnHit,
    healOnKill: totals.healOnKill / 100,
    thorns: totals.thorns,
    magicFind: totals.magicFind + lucky,
    scrapFind: totals.scrapFind,
    legendaries,
  };
}

/** Fraction of monster damage absorbed by armor at a depth. */
export function armorReduction(bal: DelveBalance, armor: number, depth: number): number {
  const k = bal.hero.armorK * Math.pow(bal.growth.monsterDmg, Math.max(0, depth - 1));
  const raw = armor / (armor + k);
  return Math.min(bal.hero.armorCap / 100, raw);
}

/** Average normal monster at a depth — the yardstick for Power. */
export function referenceMonster(registry: DataRegistry, depth: number): { hp: number; damage: number; interval: number } {
  const bal = registry.getDelveBalance();
  const d = Math.max(0, depth - 1);
  const ramp = bal.monster.earlyRamp[depth - 1] ?? 1;
  return {
    hp: bal.monster.baseHp * Math.pow(bal.growth.monsterHp, d) * ramp,
    damage: bal.monster.baseDmg * Math.pow(bal.growth.monsterDmg, d) * ramp,
    interval: 1.25,
  };
}

export interface CombatEstimate {
  dps: number;
  ehp: number;
  power: number;
}

/**
 * Heuristic DPS / effective-HP estimate against the reference monster.
 * Legendary powers are folded in approximately so comparisons feel right.
 */
export function estimateCombat(stats: HeroStats, registry: DataRegistry, depth: number): CombatEstimate {
  const bal = registry.getDelveBalance();
  const ref = referenceMonster(registry, depth);
  const L = stats.legendaries;

  const critFactor = 1 + stats.critChance * (stats.critMultiplier - 1);
  const physHit = stats.weaponDamage * stats.damageMult;
  const elemHit = (stats.fireDamage + stats.coldDamage + stats.lightningDamage) * stats.damageMult;
  const avgHit = (physHit + elemHit) * critFactor;
  const aps = 1 / stats.attackInterval;

  let dps = avgHit * aps;
  // Elemental riders
  dps += stats.fireDamage * stats.damageMult * bal.elements.burnFraction * aps;
  dps += stats.lightningDamage * stats.damageMult * critFactor * (bal.elements.chainChance / 100) * aps;
  // Legendary offense
  if (L.twin_fang) dps *= 1 + L.twin_fang / 100 / 3;
  if (L.emberheart) dps *= 1 + L.emberheart / 100;
  if (L.stormcaller) dps += physHit * 1.5 * critFactor * (L.stormcaller / 100) * aps;
  if (L.executioner) dps *= 1 + 0.25 * (L.executioner / 100);
  if (L.berserker) dps *= 1 + 0.3 * (L.berserker / 100);
  // Slam: one heavy hit every chargeMax attacks
  const seismic = L.seismic_slam ?? 0;
  const chargeMax = bal.slam.chargeMax * (seismic > 0 ? 2 / 3 : 1);
  dps *= 1 + (bal.slam.damageMult * (1 + seismic / 100)) / chargeMax;

  // Defense
  const incomingRaw = ref.damage / ref.interval;
  let mitigation = (1 - armorReduction(bal, stats.armor, depth)) * (1 - stats.dodge);
  const slowPct = (stats.coldDamage > 0 ? bal.elements.chillSlow : 0) + (L.frostbite ?? 0);
  mitigation /= 1 + slowPct / 100;
  const incoming = incomingRaw * mitigation;

  // Thorns count as damage
  dps += stats.thorns / ref.interval + incoming * ((L.thornmail ?? 0) / 100);

  const sustain = dps * stats.lifesteal + stats.lifeOnHit * aps;
  const phoenix = 1 + ((L.phoenix_plume ?? 0) / 100) * 0.5;
  const ehp =
    (stats.maxHp * phoenix) / Math.max(0.05, mitigation) + sustain * 8 + stats.healOnKill * stats.maxHp * 2;

  return { dps, ehp, power: Math.round(Math.sqrt(Math.max(0, dps) * Math.max(0, ehp)) * 10) };
}

export interface ItemComparison {
  replaced?: GearItem;
  power: number;
  newPower: number;
  /** Fractional change, 0.1 = +10% */
  powerPct: number;
  dpsPct: number;
  ehpPct: number;
}

function pct(from: number, to: number): number {
  if (from <= 0) return to > 0 ? 1 : 0;
  return (to - from) / from;
}

/** How equipping `item` (in its slot) would change the hero. */
export function compareItem(
  equipped: EquippedGear,
  item: GearItem,
  registry: DataRegistry,
  depth: number,
): ItemComparison {
  const replaced = equipped[item.slot];
  const before = estimateCombat(computeHeroStats(equipped, registry), registry, depth);
  const after = estimateCombat(computeHeroStats({ ...equipped, [item.slot]: item }, registry), registry, depth);
  return {
    replaced: replaced && replaced.uid !== item.uid ? replaced : undefined,
    power: before.power,
    newPower: after.power,
    powerPct: pct(before.power, after.power),
    dpsPct: pct(before.dps, after.dps),
    ehpPct: pct(before.ehp, after.ehp),
  };
}

/** Total hero Power for a loadout at a depth. */
export function heroPower(equipped: EquippedGear, registry: DataRegistry, depth: number): number {
  return estimateCombat(computeHeroStats(equipped, registry), registry, depth).power;
}
