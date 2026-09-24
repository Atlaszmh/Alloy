import type { DataRegistry } from '../data/registry.js';
import type { SkillDef } from '../types/arpg.js';
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
};

const POWER_STATS: Record<ManaType, HeroStatKey> = {
  fire: 'firePower',
  frost: 'frostPower',
  storm: 'stormPower',
  earth: 'earthPower',
  shadow: 'shadowPower',
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
        element: weaponItem!.mana,
      }
    : { baseId: null, kind: 'melee', range: 1.4, arc: 90, speed: 0, element: null };
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
    attackInterval: Math.max(bal.hero.minAttackInterval, baseInterval / (1 + totals.attackSpeedPct / 100)),
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

// ── Mana & spells ──────────────────────────────────────────────────────────

export interface ManaPools {
  max: ManaMap;
  regen: ManaMap;
}

/** Pool size and regen per mana type. Types with no attunement have no pool. */
export function manaPools(stats: HeroStats, registry: DataRegistry): ManaPools {
  const m = registry.getDelveBalance().mana;
  const max = emptyManaMap();
  const regen = emptyManaMap();
  for (const t of MANA_TYPES) {
    const a = stats.attunement[t];
    if (a <= 0) continue;
    max[t] = m.basePool + m.poolPerAttune * a;
    regen[t] = (m.baseRegen + m.regenPerAttune * a) * stats.manaRegenMult;
  }
  return { max, regen };
}

export function isSkillUnlocked(skill: SkillDef, attunement: ManaMap, registry: DataRegistry): boolean {
  const need = skill.elements.length > 1 ? registry.getDelveBalance().mana.comboThreshold : 1;
  return skill.elements.every((e) => attunement[e] >= need);
}

export function unlockedSkills(attunement: ManaMap, registry: DataRegistry): SkillDef[] {
  return registry.getArpgData().skills.filter((s) => isSkillUnlocked(s, attunement, registry));
}

/** Mana cost of a spell after Manaweaver. */
export function skillCost(skill: SkillDef, stats: HeroStats): Partial<ManaMap> {
  const discount = 1 - (stats.legendaries.manaweaver ?? 0) / 100;
  const cost: Partial<ManaMap> = {};
  for (const [k, v] of Object.entries(skill.cost) as [ManaType, number][]) cost[k] = v * discount;
  return cost;
}

/** Damage multiplier from attunement in the spell's element(s). */
export function attunementPower(skill: SkillDef, attunement: ManaMap, registry: DataRegistry): number {
  const per = registry.getDelveBalance().mana.powerPerAttune;
  const avg = skill.elements.reduce((s, e) => s + attunement[e], 0) / skill.elements.length;
  return 1 + per * avg;
}

/**
 * The spells actually usable on the action bar: slotted spells that are
 * unlocked. When the bar is empty (fresh profile), the strongest unlocked
 * spells fill it.
 */
export function effectiveSkillSlots(
  slots: (string | null)[],
  attunement: ManaMap,
  registry: DataRegistry,
): (string | null)[] {
  return slots.map((id) => {
    if (!id) return null;
    const skill = registry.findSkill(id);
    return skill && isSkillUnlocked(skill, attunement, registry) ? id : null;
  });
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

const TARGETS: Record<SkillDef['kind'], number> = {
  projectile: 1.8,
  nova: 3,
  chain: 3,
  dash: 1,
  ground: 3,
  line: 2.5,
  brand: 3,
  burst: 3,
  summon: 1,
};

/** Rough damage per second a spell adds when cast as often as mana and cooldown allow. */
function spellDps(skill: SkillDef, stats: HeroStats, registry: DataRegistry): number {
  const pools = manaPools(stats, registry);
  const critFactor = 1 + stats.critChance * (stats.critMultiplier - 1);
  const elemPower = skill.elements.reduce((s, e) => s + stats.elementPower[e], 0) / skill.elements.length;
  const hit =
    stats.weaponDamage *
    stats.damageMult *
    critFactor *
    (1 + elemPower) *
    attunementPower(skill, stats.attunement, registry);
  let perCast = hit * skill.power * TARGETS[skill.kind];
  if (skill.duration && skill.tick && skill.tickPower) {
    perCast += hit * skill.tickPower * (skill.duration / skill.tick) * (skill.kind === 'summon' ? 1 : TARGETS[skill.kind]);
  } else if (skill.kind === 'summon' && skill.duration && skill.tick) {
    perCast += hit * skill.power * (skill.duration / skill.tick);
  }
  const cost = skillCost(skill, stats);
  let interval = skill.cooldown * stats.cooldownMult;
  for (const [mana, amount] of Object.entries(cost) as [ManaType, number][]) {
    const regen = pools.regen[mana];
    if (regen <= 0) return 0;
    interval = Math.max(interval, amount / regen);
  }
  return perCast / interval;
}

/**
 * Heuristic DPS / effective-HP estimate against the reference monster, used
 * for Power and item comparisons. Spells on the bar (or the best unlocked
 * ones) count toward DPS, so attunement and mana matter.
 */
export function estimateCombat(
  stats: HeroStats,
  registry: DataRegistry,
  depth: number,
  skillSlots?: (string | null)[],
): CombatEstimate {
  const bal = registry.getDelveBalance();
  const ref = referenceMonster(registry, depth);
  const L = stats.legendaries;

  const critFactor = 1 + stats.critChance * (stats.critMultiplier - 1);
  const weaponElem = stats.weapon.element ? stats.elementPower[stats.weapon.element] : 0;
  const cleave = stats.weapon.kind === 'melee' ? 1 + (stats.weapon.arc / 360) * 1.5 : 1;
  let dps = (stats.weaponDamage * stats.damageMult * critFactor * (1 + weaponElem) * cleave) / stats.attackInterval;
  if (L.twin_fang) dps *= 1 + L.twin_fang / 100 / 3;

  const unlocked = unlockedSkills(stats.attunement, registry);
  let spells: SkillDef[];
  if (skillSlots && skillSlots.some(Boolean)) {
    spells = effectiveSkillSlots(skillSlots, stats.attunement, registry)
      .filter((id): id is string => !!id)
      .map((id) => registry.getSkill(id));
  } else {
    spells = unlocked
      .map((s) => ({ s, d: spellDps(s, stats, registry) }))
      .sort((a, b) => b.d - a.d)
      .slice(0, 3)
      .map((x) => x.s);
  }
  // Spells share the hero's time and mana; count them at partial efficiency.
  for (const s of spells) dps += spellDps(s, stats, registry) * 0.6;

  const mitigation = (1 - armorReduction(bal, stats.armor, depth)) * (1 - stats.dodge);
  dps += stats.thorns / ref.interval;
  const sustain = dps * stats.lifesteal;
  const phoenix = 1 + ((L.phoenix_plume ?? 0) / 100) * 0.5;
  const ehp =
    (stats.maxHp * phoenix) / Math.max(0.05, mitigation) + sustain * 8 + stats.healOnKill * stats.maxHp * 3;

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
  /** Spell ids this swap would unlock / lock. */
  skillsGained: string[];
  skillsLost: string[];
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
  skillSlots?: (string | null)[],
): ItemComparison {
  const replaced = equipped[item.slot];
  const next = { ...equipped, [item.slot]: item };
  const beforeStats = computeHeroStats(equipped, registry);
  const afterStats = computeHeroStats(next, registry);
  const before = estimateCombat(beforeStats, registry, depth, skillSlots);
  const after = estimateCombat(afterStats, registry, depth, skillSlots);

  const attunementDelta: Partial<ManaMap> = {};
  for (const m of MANA_TYPES) {
    const d = afterStats.attunement[m] - beforeStats.attunement[m];
    if (d !== 0) attunementDelta[m] = d;
  }
  const had = new Set(unlockedSkills(beforeStats.attunement, registry).map((s) => s.id));
  const will = new Set(unlockedSkills(afterStats.attunement, registry).map((s) => s.id));

  return {
    replaced: replaced && replaced.uid !== item.uid ? replaced : undefined,
    power: before.power,
    newPower: after.power,
    powerPct: pct(before.power, after.power),
    dpsPct: pct(before.dps, after.dps),
    ehpPct: pct(before.ehp, after.ehp),
    attunementDelta,
    skillsGained: [...will].filter((id) => !had.has(id)),
    skillsLost: [...had].filter((id) => !will.has(id)),
  };
}

/** Total hero Power for a loadout at a depth. */
export function heroPower(
  equipped: EquippedGear,
  registry: DataRegistry,
  depth: number,
  skillSlots?: (string | null)[],
): number {
  return estimateCombat(computeHeroStats(equipped, registry), registry, depth, skillSlots).power;
}
