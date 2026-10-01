import type { DataRegistry } from '../data/registry.js';
import {
  ABILITY_SLOTS,
  type AbilitySlot,
  type Blow,
  type Chains,
  type ResolvedAbility,
  type ResolvedChain,
} from '../types/ability.js';
import {
  NEUTRAL,
  chainMove,
  defaultBasic,
  defaultChains,
  holdFull,
  mergeKnobs,
  moveBeat,
  resolveChain,
  stepBonus,
} from '../arpg/abilities/resolve.js';
import { heroChains, movesetTransfer } from '../loot/moveset.js';
import { runeKnobs } from '../loot/runes.js';
import type { DelveBalance, HeroStats, HeroWeapon, ManaPair } from '../types/delve.js';
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

/** The element an `*Attune` stat feeds, if it is one. */
export function attuneElement(stat: HeroStatKey): ManaType | undefined {
  return ATTUNE_STATS[stat];
}

/** The pair's elements: the primary, then a bound secondary that differs from it (none before the choice). */
export function pairElements(pair: ManaPair | undefined): ManaType[] {
  if (!pair?.primary) return [];
  return pair.secondary && pair.secondary !== pair.primary
    ? [pair.primary, pair.secondary]
    : [pair.primary];
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

/** Attunement one item grants per element: its mana's base plus its `*Attune` lines (Prism aside). */
export function itemAttunement(registry: DataRegistry, item: GearItem): ManaMap {
  const att = emptyManaMap();
  att[item.mana] += itemAffinityAttunement(registry, item);
  for (const line of [...item.implicits, ...item.affixes]) {
    const mana = ATTUNE_STATS[line.stat];
    if (mana) att[mana] += Math.round(line.value);
  }
  return att;
}

/** What goes on top of the gear: the Training Grounds' toggles, and the hero's pair (see `pairExtra`). */
export interface HeroStatsExtra {
  /** Legendary id → value, merged with the gear's (the higher wins). */
  legendaries?: Record<string, number>;
  /** Attunement added per element. */
  attunement?: Partial<ManaMap>;
  /**
   * The hero's pair: its attunement powers basic blows, and with no `basic`
   * the blows are the weapon's default chain on it (see `defaultBasic`). A
   * secondary equal to the primary counts as unbound.
   */
  pair?: ManaPair;
  /** The two-element limit: with a pair primary, attunement counts only for the pair's elements. */
  filterAttunement?: boolean;
  /** The hero's basic chain (see the moves and chains spec). */
  basic?: Blow[];
}

/** Total attunement per mana type from equipped gear (plus any `extra`); filtered to the pair on request. */
export function computeAttunement(
  equipped: EquippedGear,
  registry: DataRegistry,
  extra: HeroStatsExtra = {},
): ManaMap {
  const att = emptyManaMap();
  const pair = pairElements(extra.pair);
  const counts = (m: ManaType) => !extra.filterAttunement || pair.length === 0 || pair.includes(m);
  // Prism: the best of the gear's and the extra's, never both.
  let prism = Math.round(extra.legendaries?.prism ?? 0);
  for (const slot of GEAR_SLOTS) {
    const item = equipped[slot];
    if (!item) continue;
    const a = itemAttunement(registry, item);
    for (const m of MANA_TYPES) att[m] += a[m];
    if (item.legendary?.id === 'prism') prism = Math.max(prism, Math.round(item.legendary.value));
  }
  for (const m of MANA_TYPES)
    att[m] = counts(m) ? att[m] + (extra.attunement?.[m] ?? 0) + prism : 0;
  return att;
}

export function hasMastery(registry: DataRegistry, attunement: ManaMap, mana: ManaType): boolean {
  return attunement[mana] >= registry.getDelveBalance().mana.masteryThreshold;
}

function emptyTotals(): Record<HeroStatKey, number> {
  return Object.fromEntries(HERO_STAT_KEYS.map((k) => [k, 0])) as Record<HeroStatKey, number>;
}

export function computeHeroStats(
  equipped: EquippedGear,
  registry: DataRegistry,
  extra: HeroStatsExtra = {},
): HeroStats {
  const bal = registry.getDelveBalance();
  const totals = emptyTotals();
  const legendaries: Record<string, number> = { ...extra.legendaries };

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

  const attunement = computeAttunement(equipped, registry, extra);
  const [primary = null, secondary = null] = pairElements(extra.pair);
  const weaponItem = equipped.weapon;
  const weaponBase = weaponItem ? registry.getGearBase(weaponItem.baseId) : null;
  const armed = weaponBase?.attack ? weaponBase : null;
  // The basic chain: the hero's, else the weapon's default on the pair (with no pair yet, the
  // weapon's mana, else fire). Each blow is its kind's row, powered by its element's attunement.
  const feel = armed?.feel ?? bal.hero.feel;
  const chain =
    extra.basic ??
    defaultBasic(registry, armed?.id ?? null, primary ?? weaponItem?.mana ?? 'fire', secondary);
  const perAttune = bal.pair.basicPowerPerAttune;
  const blows = chain.map((b) => {
    const row = feel[b.kind];
    // Its runes: those that fit the weapon and act on its kind (a Pierce does nothing on a row
    // that bursts). Without any, it keeps the shared NEUTRAL.
    const on = { weapon: armed?.id ?? null, kind: b.kind, explode: (row.explode ?? 0) > 0 };
    const socketed = runeKnobs(registry, b.runes, on);
    return {
      ...row,
      kind: b.kind,
      element: b.element,
      attunePower: primary ? 1 + perAttune * attunement[b.element] : 1,
      knobs: socketed.knobs.length > 0 ? mergeKnobs(...socketed.knobs) : NEUTRAL,
      runes: socketed.active,
    };
  });
  const weapon: HeroWeapon = armed?.attack
    ? {
        baseId: armed.id,
        kind: armed.attack.kind,
        range: armed.attack.range,
        arc: armed.attack.arc ?? 90,
        speed: armed.attack.speed ?? 12,
        pierce: armed.attack.pierce ?? false,
        sway: armed.sway ?? 'alternate',
        feel,
        blows,
      }
    : {
        baseId: null,
        kind: 'melee',
        range: 1.4,
        arc: 90,
        speed: 0,
        pierce: false,
        sway: 'alternate',
        feel,
        blows,
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
    tempo: armed?.tempo ?? bal.hero.tempo,
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

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The move Power values at step `i` of a chain: a hold move at its full charge (stage 2). */
export function valuedMove(chain: ResolvedChain, i: number): ResolvedAbility {
  return chain.moves[i].kind === 'hold' ? chainMove(chain, i, 2) : chain.moves[i];
}

/**
 * Damage of one use of a chain, averaged over its moves (each with its step
 * bonus, a hold at full charge), counting jumps, lingering ground and repeats.
 */
export function damagePerUse(
  chain: ResolvedChain,
  hit: number,
  stats: HeroStats,
  bal: DelveBalance,
): number {
  return mean(
    chain.moves.map((_, i) => {
      const ab = valuedMove(chain, i);
      const targets = TARGETS[ab.form.id] * (1 + (ab.knobs.area - 1) * 0.5);
      const repeats =
        ab.form.id === 'barrage'
          ? ab.count
          : ab.form.id === 'maelstrom'
            ? ab.duration / ab.tick
            : 1;
      let jumps = 0;
      for (let i = 1; i <= ab.knobs.chain; i++) jumps += Math.pow(bal.abilities.chainPower, i);
      const zone = ab.knobs.zone
        ? (ab.knobs.zone.seconds / 0.5) * ab.knobs.zone.tickPower * targets
        : 0;
      const step = stepBonus(bal, ab.index).power;
      const perHit = hit * ab.power * step * (1 + stats.elementPower[ab.element]);
      return perHit * (targets + jumps + zone) * repeats;
    }),
  );
}

/**
 * Seconds between uses, averaged over the chain's moves, when used as often as
 * its cooldowns, its payment and its cadence allow. The cadence is a move's
 * wind-up plus its beat (see the chain feel spec). A hold is valued at full
 * charge: its wind-up is the longer of its charge (`holdTime` × the tempo) and
 * its stage-2 wind-up, and its cooldown counts from its landing.
 */
export function useInterval(
  bal: DelveBalance,
  chain: ResolvedChain,
  tempo: number,
  manaIncome: number,
  chargeRate: number,
): number {
  return mean(
    chain.moves.map((move, i) => {
      const ab = valuedMove(chain, i);
      const hold = move.kind === 'hold';
      const windup = hold ? Math.max(holdFull(bal, tempo), ab.castTime) : ab.castTime;
      const cooldown = hold ? windup + ab.cooldown : ab.cooldown + ab.channel;
      const pay =
        chain.payment === 'charge'
          ? ab.chargeNeed / Math.max(0.1, chargeRate)
          : ab.cost / Math.max(0.1, manaIncome);
      const cadence = windup + moveBeat(bal, ab, tempo);
      return Math.max(cooldown, pay, cadence);
    }),
  );
}

/**
 * Heuristic DPS / effective-HP estimate against the reference monster, used
 * for Power and item comparisons. The basic attack, the Primary and the
 * Ultimate count toward DPS (sharing mana and time); the Defensive counts
 * toward survival. A skill left out of `chains` counts nothing.
 */
export function estimateCombat(
  stats: HeroStats,
  registry: DataRegistry,
  depth: number,
  chains: Partial<Pick<Chains, AbilitySlot>> = defaultChains(
    registry,
    stats.weapon.blows[0].element,
    stats.weapon.baseId,
  ),
): CombatEstimate {
  const bal = registry.getDelveBalance();
  const ref = referenceMonster(registry, depth);
  const L = stats.legendaries;

  const critFactor = 1 + stats.critChance * (stats.critMultiplier - 1);
  const hit = stats.weaponDamage * stats.damageMult * critFactor;
  const melee = stats.weapon.kind === 'melee';
  const cleave = melee ? 1 + (stats.weapon.arc / 360) * 1.5 : stats.weapon.pierce ? 1.4 : 1;
  // Each blow's power × its element's power, over the chain's time.
  const blows = stats.weapon.blows;
  const stringTime = blows.reduce((a, s) => a + s.time, 0);
  const strikeInterval = (stats.attackInterval * stringTime) / blows.length;
  const value = (b: (typeof blows)[number]) => b.attunePower * (1 + stats.elementPower[b.element]);
  // Twin Fang: one extra hit on the last blow, at its value (×1.5 melee, ×1 ranged).
  const twin = ((L.twin_fang ?? 0) / 100) * (melee ? 1.5 : 1);
  const stringValue =
    blows.reduce((a, b) => a + b.power * value(b), 0) + twin * value(blows[blows.length - 1]);
  let dps = (hit * cleave * (stringValue / stringTime)) / stats.attackInterval;

  const [primary, defensive, ultimate] = ABILITY_SLOTS.map((slot) => {
    const chain = chains[slot];
    return chain ? resolveChain(registry, stats, slot, chain) : null;
  });
  const pool = manaPool(stats, registry);
  const manaIncome = pool.regen + bal.mana.basicAttackGain / strikeInterval;
  const unit = Math.max(1, stats.weaponDamage * stats.damageMult);
  const every = (chain: ResolvedChain, income: number, rate: number) =>
    useInterval(bal, chain, stats.tempo, income, rate);
  const primaryDps = primary
    ? damagePerUse(primary, hit, stats, bal) / every(primary, manaIncome * 0.7, dps / unit)
    : 0;
  // Abilities share the hero's time and mana; count them at partial efficiency.
  dps += primaryDps * 0.75;
  const chargeRate = dps / unit;
  if (ultimate)
    dps +=
      (damagePerUse(ultimate, hit, stats, bal) / every(ultimate, manaIncome * 0.3, chargeRate)) *
      0.8;

  let mitigation = (1 - armorReduction(bal, stats.armor, depth)) * (1 - stats.dodge);
  let bonusLife = 0;
  if (defensive) {
    const guardEvery = every(defensive, manaIncome * 0.3, chargeRate);
    // The Defensive's effect: its first move's (a hold's at full charge).
    const guard = valuedMove(defensive, 0);
    const guardFor = guard.form.id === 'blink' ? bal.abilities.defend.blinkSeconds : guard.duration;
    const uptime = Math.min(1, guardFor / Math.max(guardFor, guardEvery));
    if (guard.form.id === 'armor') mitigation *= 1 - Math.min(0.75, guard.effect) * uptime;
    if (guard.elements.includes('earth'))
      mitigation *= 1 - bal.abilities.defend.earthReduction * uptime;
    if (guard.form.id === 'ward') bonusLife += stats.maxHp * guard.effect * uptime * 2;
    if (guard.form.id === 'surge') dps *= 1 + guard.effect * uptime;
    if (guard.form.id === 'blink') mitigation *= 1 - 0.3 * uptime;
    dps += (damagePerUse(defensive, hit, stats, bal) / Math.max(1, guardEvery)) * 0.5;
  }

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

/** The extra that applies a profile's pair (its power and the two-element limit) and its basic chain. */
export function pairExtra(pair?: ManaPair, basic?: Blow[]): HeroStatsExtra {
  return { ...(pair ? { pair, filterAttunement: true } : {}), basic };
}

/** No pair: before the choice, or a caller that counts every element. */
const NO_PAIR: ManaPair = { primary: null, secondary: null };

/** A loadout's stats and combat estimate, with the chains its weapon carries (`heroChains`). */
function estimateLoadout(
  equipped: EquippedGear,
  registry: DataRegistry,
  depth: number,
  pair: ManaPair | undefined,
): { stats: HeroStats; estimate: CombatEstimate } {
  const chains = heroChains(registry, equipped, pair ?? NO_PAIR);
  const stats = computeHeroStats(equipped, registry, pairExtra(pair, chains.basic));
  return { stats, estimate: estimateCombat(stats, registry, depth, chains) };
}

/**
 * How a weapon is valued: `home`, with the equipped weapon's moveset moved
 * onto it (`movesetTransfer`); `asIs`, with its own, as it would fight if
 * equipped now.
 */
export type WeaponValue = 'home' | 'asIs';

/**
 * How equipping `item` (in its slot) would change the hero. A weapon is valued
 * as `value` says (a home by default); unarmed, there is no moveset to move,
 * so as it is.
 */
export function compareItem(
  equipped: EquippedGear,
  item: GearItem,
  registry: DataRegistry,
  depth: number,
  /** The hero's pair (its basics and the two-element limit); none counts every element. */
  pair?: ManaPair,
  value: WeaponValue = 'home',
): ItemComparison {
  const replaced = equipped[item.slot];
  const worn = equipped.weapon;
  const home = value === 'home' && item.slot === 'weapon' && worn && worn.uid !== item.uid;
  const candidate = home
    ? { ...item, moveset: movesetTransfer(registry, worn, item).moveset }
    : item;
  const next = { ...equipped, [item.slot]: candidate };
  const { stats: beforeStats, estimate: before } = estimateLoadout(equipped, registry, depth, pair);
  const { stats: afterStats, estimate: after } = estimateLoadout(next, registry, depth, pair);

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

/** Total hero Power for a loadout at a depth, with the chains its weapon carries. */
export function heroPower(
  equipped: EquippedGear,
  registry: DataRegistry,
  depth: number,
  /** The hero's pair (its basics and the two-element limit); none counts every element. */
  pair?: ManaPair,
): number {
  return estimateLoadout(equipped, registry, depth, pair).estimate.power;
}
