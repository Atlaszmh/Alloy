import type { DataRegistry } from '../data/registry.js';
import { ABILITY_SLOTS, type AbilityBuilds, type ResolvedAbility } from '../types/ability.js';
import { defaultAbilities, resolveAbility } from '../arpg/abilities/resolve.js';
import type { DelveBalance, HeroStats, HeroWeapon } from '../types/delve.js';
import type { EquippedGear, GearItem, HeroStatKey, StatRoll } from '../types/gear.js';
import { GEAR_SLOTS, HERO_STAT_KEYS } from '../types/gear.js';
import { MANA_TYPES, emptyManaMap, type ManaMap, type ManaType } from '../types/mana.js';

export interface ItemStatLine extends StatRoll {
  source: 'implicit' | 'affix';
}

const ATTUNE_STATS: Record<string, ManaType> = {
  fireAttune: 'fire',
  frostAttune: 'frost',
  stormAttune: 'storm',
  earthAttune: 'earth',
  shadowAttune: 'shadow',
  natureAttune: 'nature',
};

const POWER_STATS: Record<ManaType, HeroStatKey> = {
  fire: 'firePower',
  frost: 'frostPower',
  storm: 'stormPower',
  earth: 'earthPower',
  shadow: 'shadowPower',
  nature: 'naturePower',
};

export function isAttuneStat(stat: HeroStatKey): boolean {
  return stat in ATTUNE_STATS;
}

/** Multiplier an item's upgrade level applies to its stats. */
export function upgradeMultiplier(registry: DataRegistry, upgrade: number): number {
  return 1 + registry.getDelveBalance().forge.upgradeStep * upgrade;
}

/** Stat lines of an item with its forge upgrade applied (attunement never scales). */
export function itemStatLines(item: GearItem, registry: DataRegistry): ItemStatLine[] {
  const mult = upgradeMultiplier(registry, item.upgrade);
  const scale = (s: StatRoll) => (isAttuneStat(s.stat) ? s.value : s.value * mult);
  return [
    ...item.implicits.map((s) => ({ ...s, value: scale(s), source: 'implicit' as const })),
    ...item.affixes.map((s) => ({ ...s, value: scale(s), source: 'affix' as const })),
  ];
}

/** Attunement an item grants to its own mana type. */
export function itemAffinityAttunement(registry: DataRegistry, item: GearItem): number {
  return registry.getDelveBalance().mana.attuneByRarity[item.rarity];
}

/** Total attunement per mana type from equipped gear. */
export function computeAttunement(equipped: EquippedGear, registry: DataRegistry): ManaMap {
  const att = emptyManaMap();
  let prism = 0;
  for (const slot of GEAR_SLOTS) {
    const item = equipped[slot];
    if (!item) continue;
    att[item.mana] += itemAffinityAttunement(registry, item);
    for (const line of [...item.implicits, ...item.affixes]) {
      const mana = ATTUNE_STATS[line.stat];
      if (mana) att[mana] += Math.round(line.value);
    }
    if (item.legendary?.id === 'prism') prism = Math.max(prism, Math.round(item.legendary.value));
  }
  if (prism > 0) for (const m of MANA_TYPES) att[m] += prism;
  return att;
}

export function hasMastery(registry: DataRegistry, attunement: ManaMap, mana: ManaType): boolean {
  return attunement[mana] >= registry.getDelveBalance().mana.masteryThreshold;
}

function emptyTotals(): Record<HeroStatKey, number> {
  return Object.fromEntries(HERO_STAT_KEYS.map((k) => [k, 0])) as Record<HeroStatKey, number>;
}

export function computeHeroStats(equipped: EquippedGear, registry: DataRegistry): HeroStats {
  const bal = registry.getDelveBalance();
  const totals = emptyTotals();
  const legendaries: Record<string, number> = {};

  for (const slot of GEAR_SLOTS) {
    const item = equipped[slot];
    if (!item) continue;
    for (const line of itemStatLines(item, registry)) {
      if (!isAttuneStat(line.stat)) totals[line.stat] += line.value;
    }
    if (item.legendary) {
      const { id, value } = item.legendary;
      legendaries[id] = Math.max(legendaries[id] ?? 0, value);
    }
  }

  const attunement = computeAttunement(equipped, registry);
  const weaponItem = equipped.weapon;
  const weaponBase = weaponItem ? registry.getGearBase(weaponItem.baseId) : null;
  const weapon: HeroWeapon = weaponBase?.attack
    ? {
        baseId: weaponBase.id,
        kind: weaponBase.attack.kind,
        range: weaponBase.attack.range,
        arc: weaponBase.attack.arc ?? 90,
        speed: weaponBase.attack.speed ?? 12,
        pierce: weaponBase.attack.pierce ?? false,
        element: weaponItem!.mana,
        combo: weaponBase.combo ?? bal.hero.defaultCombo,
      }
    : {
        baseId: null,
        kind: 'melee',
        range: 1.4,
        arc: 90,
        speed: 0,
        pierce: false,
        element: null,
        combo: bal.hero.defaultCombo,
      };
  const baseInterval = weaponBase?.attackInterval ?? bal.hero.unarmedInterval;

  const glass = legendaries.glass_cannon ?? 0;
  const bedrock = legendaries.bedrock ?? 0;
  const lucky = legendaries.lucky_charm ?? 0;
  const earthMastery = hasMastery(registry, attunement, 'earth');

  const elementPower = emptyManaMap();
  for (const m of MANA_TYPES) elementPower[m] = totals[POWER_STATS[m]] / 100;
  elementPower.frost += (legendaries.rimeheart ?? 0) / 100;
  elementPower.shadow += (legendaries.nightstalker ?? 0) / 100;

  return {
    maxHp:
      (bal.hero.baseHp + totals.maxHp) *
      (1 + totals.hpPct / 100) *
      (glass > 0 ? 0.8 : 1) *
      (earthMastery ? 1.2 : 1),
    armor: totals.armor * (1 + bedrock / 100) * (earthMastery ? 1.4 : 1),
    weaponDamage: (weaponItem ? 0 : bal.hero.unarmedDamage) + totals.damage,
    damageMult: 1 + (totals.damagePct + glass) / 100,
    attackInterval: Math.max(
      bal.hero.minAttackInterval,
      baseInterval / (1 + totals.attackSpeedPct / 100),
    ),
    critChance: Math.min(bal.hero.critCap, bal.hero.baseCritChance + totals.critChance) / 100,
    critMultiplier: (bal.hero.baseCritMultiplier + totals.critDamage) / 100,
    dodge: Math.min(bal.hero.dodgeCap, totals.dodge) / 100,
    lifesteal: totals.lifesteal / 100,
    healOnKill: totals.healOnKill / 100,
    thorns: totals.thorns,
    magicFind: totals.magicFind + lucky,
    scrapFind: totals.scrapFind,
    moveSpeed: bal.hero.moveSpeed * (1 + totals.moveSpeed / 100),
    cooldownMult: 1 - Math.min(bal.hero.cdrCap, totals.cooldownReduction) / 100,
    manaRegenMult: 1 + totals.manaRegen / 100,
    weapon,
    attunement,
    elementPower,
    legendaries,
  };
}

// ── Mana ───────────────────────────────────────────────────────────────────

/** The one mana pool: it grows with total attunement. */
export function manaPool(stats: HeroStats, registry: DataRegistry): { max: number; regen: number } {
  const m = registry.getDelveBalance().mana;
  const total = MANA_TYPES.reduce((sum, t) => sum + stats.attunement[t], 0);
  return {
    max: m.basePool + m.poolPerAttune * total,
    regen: (m.baseRegen + m.regenPerAttune * total) * stats.manaRegenMult,
  };
}

// ── Power estimate ─────────────────────────────────────────────────────────

/** Fraction of monster damage absorbed by armor at a depth. */
export function armorReduction(bal: DelveBalance, armor: number, depth: number): number {
  const k = bal.hero.armorK * Math.pow(bal.growth.monsterDmg, Math.max(0, depth - 1));
  const raw = armor / (armor + k);
  return Math.min(bal.hero.armorCap / 100, raw);
}

/** Average normal monster at a depth — the yardstick for Power. */
export function referenceMonster(
  registry: DataRegistry,
  depth: number,
): { hp: number; damage: number; interval: number } {
  const bal = registry.getDelveBalance();
  const d = Math.max(0, depth - 1);
  const ramp = bal.monster.earlyRamp[depth - 1] ?? 1;
  return {
    hp: bal.monster.baseHp * Math.pow(bal.growth.monsterHp, d) * ramp,
    damage: bal.monster.baseDmg * Math.pow(bal.growth.monsterDmg, d) * ramp,
    interval: 1.3,
  };
}

export interface CombatEstimate {
  dps: number;
  ehp: number;
  power: number;
}

/** Rough number of foes an ability's hit lands on. */
const TARGETS: Record<string, number> = {
  bolt: 1.6,
  volley: 1.6,
  lance: 2.2,
  burst: 2.5,
  strike: 2,
  nova: 3.5,
  barrage: 3,
  maelstrom: 3,
  ward: 2.5,
  armor: 1,
  surge: 0,
  blink: 1.5,
};

/** Damage of one use, counting combos, chains, lingering ground and repeats. */
function damagePerUse(
  ab: ResolvedAbility,
  hit: number,
  stats: HeroStats,
  bal: DelveBalance,
): number {
  const combo = ab.combo.reduce((a, b) => a + b, 0) / ab.combo.length;
  const targets = TARGETS[ab.form.id] * (1 + (ab.knobs.area - 1) * 0.5);
  const repeats =
    ab.form.id === 'barrage' ? ab.count : ab.form.id === 'maelstrom' ? ab.duration / ab.tick : 1;
  let chain = 0;
  for (let i = 1; i <= ab.knobs.chain; i++) chain += Math.pow(bal.abilities.chainPower, i);
  const zone = ab.knobs.zone
    ? (ab.knobs.zone.seconds / 0.5) * ab.knobs.zone.tickPower * targets
    : 0;
  const perHit = hit * ab.power * combo * (1 + stats.elementPower[ab.element]);
  return perHit * (targets + chain + zone) * repeats;
}

/** Seconds between uses when the ability is used as often as its payment allows. */
function useInterval(ab: ResolvedAbility, manaIncome: number, chargeRate: number): number {
  if (ab.build.payment === 'charge')
    return Math.max(ab.cooldown, ab.chargeNeed / Math.max(0.1, chargeRate));
  return Math.max(ab.cooldown + ab.channel, ab.cost / Math.max(0.1, manaIncome));
}

/**
 * Heuristic DPS / effective-HP estimate against the reference monster, used
 * for Power and item comparisons. The basic attack, the Primary and the
 * Ultimate count toward DPS (sharing mana and time); the Defensive counts
 * toward survival.
 */
export function estimateCombat(
  stats: HeroStats,
  registry: DataRegistry,
  depth: number,
  builds: AbilityBuilds = defaultAbilities(stats.weapon.element ?? 'fire'),
): CombatEstimate {
  const bal = registry.getDelveBalance();
  const ref = referenceMonster(registry, depth);
  const L = stats.legendaries;

  const critFactor = 1 + stats.critChance * (stats.critMultiplier - 1);
  const hit = stats.weaponDamage * stats.damageMult * critFactor;
  const weaponElem = stats.weapon.element ? stats.elementPower[stats.weapon.element] : 0;
  const melee = stats.weapon.kind === 'melee';
  const cleave = melee ? 1 + (stats.weapon.arc / 360) * 1.5 : stats.weapon.pierce ? 1.4 : 1;
  const combo = stats.weapon.combo;
  const stringPower = combo.reduce((a, s) => a + s.power, 0);
  const stringTime = combo.reduce((a, s) => a + s.time, 0);
  const strikeInterval = (stats.attackInterval * stringTime) / combo.length;
  let dps = (hit * (1 + weaponElem) * cleave * (stringPower / stringTime)) / stats.attackInterval;
  // Twin Fang: one extra hit per string (×1.5 melee, ×1 ranged).
  if (L.twin_fang) dps *= 1 + ((L.twin_fang / 100) * (melee ? 1.5 : 1)) / stringPower;

  const [primary, defensive, ultimate] = ABILITY_SLOTS.map((slot) =>
    resolveAbility(registry, slot, builds[slot], stats),
  );
  const pool = manaPool(stats, registry);
  const manaIncome = pool.regen + bal.mana.basicAttackGain / strikeInterval;
  const unit = Math.max(1, stats.weaponDamage * stats.damageMult);
  const primaryDps =
    damagePerUse(primary, hit, stats, bal) / useInterval(primary, manaIncome * 0.7, dps / unit);
  // Abilities share the hero's time and mana; count them at partial efficiency.
  dps += primaryDps * 0.75;
  const chargeRate = dps / unit;
  dps +=
    (damagePerUse(ultimate, hit, stats, bal) /
      useInterval(ultimate, manaIncome * 0.3, chargeRate)) *
    0.8;

  let mitigation = (1 - armorReduction(bal, stats.armor, depth)) * (1 - stats.dodge);
  let bonusLife = 0;
  const guardEvery = useInterval(defensive, manaIncome * 0.3, chargeRate);
  const guardFor =
    defensive.form.id === 'blink' ? bal.abilities.defend.blinkSeconds : defensive.duration;
  const uptime = Math.min(1, guardFor / Math.max(guardFor, guardEvery));
  if (defensive.form.id === 'armor') mitigation *= 1 - Math.min(0.75, defensive.effect) * uptime;
  if (defensive.elements.includes('earth'))
    mitigation *= 1 - bal.abilities.defend.earthReduction * uptime;
  if (defensive.form.id === 'ward') bonusLife += stats.maxHp * defensive.effect * uptime * 2;
  if (defensive.form.id === 'surge') dps *= 1 + defensive.effect * uptime;
  if (defensive.form.id === 'blink') mitigation *= 1 - 0.3 * uptime;
  dps += (damagePerUse(defensive, hit, stats, bal) / Math.max(1, guardEvery)) * 0.5;

  dps += stats.thorns / ref.interval;
  const sustain = dps * stats.lifesteal;
  const phoenix = 1 + ((L.phoenix_plume ?? 0) / 100) * 0.5;
  const ehp =
    (stats.maxHp * phoenix + bonusLife) / Math.max(0.05, mitigation) +
    sustain * 8 +
    stats.healOnKill * stats.maxHp * 3;

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
  /** Change in attunement per mana type (only non-zero entries). */
  attunementDelta: Partial<ManaMap>;
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
  builds?: AbilityBuilds,
): ItemComparison {
  const replaced = equipped[item.slot];
  const next = { ...equipped, [item.slot]: item };
  const beforeStats = computeHeroStats(equipped, registry);
  const afterStats = computeHeroStats(next, registry);
  const before = estimateCombat(beforeStats, registry, depth, builds);
  const after = estimateCombat(afterStats, registry, depth, builds);

  const attunementDelta: Partial<ManaMap> = {};
  for (const m of MANA_TYPES) {
    const d = afterStats.attunement[m] - beforeStats.attunement[m];
    if (d !== 0) attunementDelta[m] = d;
  }

  return {
    replaced: replaced && replaced.uid !== item.uid ? replaced : undefined,
    power: before.power,
    newPower: after.power,
    powerPct: pct(before.power, after.power),
    dpsPct: pct(before.dps, after.dps),
    ehpPct: pct(before.ehp, after.ehp),
    attunementDelta,
  };
}

/** Total hero Power for a loadout at a depth. */
export function heroPower(
  equipped: EquippedGear,
  registry: DataRegistry,
  depth: number,
  builds?: AbilityBuilds,
): number {
  return estimateCombat(computeHeroStats(equipped, registry), registry, depth, builds).power;
}
