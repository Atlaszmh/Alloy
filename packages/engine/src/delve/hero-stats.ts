import type { DataRegistry } from '../data/registry.js';
import {
  ABILITY_SLOTS,
  type AbilitySlot,
  type Blow,
  type Chains,
  type KnobsData,
  type MoveKind,
  type ResolvedAbility,
  type ResolvedChain,
} from '../types/ability.js';
import {
  NEUTRAL,
  baseCost,
  chainMove,
  defaultBasic,
  defaultChains,
  holdFull,
  mergeKnobs,
  moveBeat,
  resolveChain,
  stepBonus,
} from '../arpg/abilities/resolve.js';
import { heroChains, moveAllPreview } from '../loot/moveset.js';
import { runeKnobs } from '../loot/runes.js';
import type { DelveBalance, HeroStats, HeroWeapon, ManaPair } from '../types/delve.js';
import type { EquippedGear, GearItem, HeroStatKey, StatRoll } from '../types/gear.js';
import { GEAR_SLOTS, HERO_STAT_KEYS } from '../types/gear.js';
import { MANA_TYPES, emptyManaMap, type ManaMap, type ManaType } from '../types/mana.js';
import type { Buff } from '../types/floor-map.js';

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
  /**
   * The dive's boons' knob partials (`diveStats`; default none, so the sandbox, the DPS Lab,
   * Power and `profileStats` see none): merged into each blow after its runes, and kept on
   * `HeroStats.boonKnobs` for the moves (see the boons spec's 2a).
   */
  boonKnobs?: KnobsData[];
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
  const boonKnobs = extra.boonKnobs ?? [];
  const blows = chain.map((b) => {
    const row = feel[b.kind];
    // Its runes: those that fit the weapon and act on its kind (a Pierce does nothing on a row
    // that bursts), then the dive's boons' knobs (never in its `runes`). Without any, it keeps
    // the shared NEUTRAL.
    const on = { weapon: armed?.id ?? null, kind: b.kind, explode: (row.explode ?? 0) > 0 };
    const socketed = runeKnobs(registry, b.runes, on);
    const parts = [...socketed.knobs, ...boonKnobs];
    return {
      ...row,
      kind: b.kind,
      element: b.element,
      attunePower: primary ? 1 + perAttune * attunement[b.element] : 1,
      knobs: parts.length > 0 ? mergeKnobs(...parts) : NEUTRAL,
      runes: socketed.active,
    };
  });
  const weapon: HeroWeapon = armed?.attack
    ? {
        baseId: armed.id,
        class: armed.class ?? null,
        style: armed.style ?? null,
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
        class: null,
        style: null,
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
    boonKnobs,
  };
}

/**
 * `stats` under boons and blessings (the boons spec §2), one pass a list (the
 * dive's, then the floor's): damage, mana regen, max life (its product floored
 * at 0.3) and tempo (× (1 − x), its product floored at 0.5) multiply per entry;
 * life regen and lifesteal add; Blood Price stops mana regen. Everything else a
 * boon does acts in the sim, not here. No entries: `stats` itself.
 */
export function applyBuffs(stats: HeroStats, buffs: readonly Buff[]): HeroStats {
  if (buffs.length === 0) return stats;
  let { damageMult, manaRegenMult, lifesteal } = stats;
  let lifeRegen = stats.lifeRegen ?? 0;
  let life = 1;
  let tempo = 1;
  for (const { effect } of buffs) {
    damageMult *= 1 + (effect.damage ?? 0);
    manaRegenMult *= effect.bloodPrice ? 0 : 1 + (effect.manaRegen ?? 0);
    lifeRegen += effect.lifeRegen ?? 0;
    lifesteal += effect.lifesteal ?? 0;
    life *= 1 + (effect.maxLife ?? 0);
    tempo *= 1 - (effect.tempo ?? 0);
  }
  return {
    ...stats,
    damageMult,
    manaRegenMult,
    lifeRegen,
    lifesteal,
    maxHp: stats.maxHp * Math.max(0.3, life),
    tempo: stats.tempo * Math.max(0.5, tempo),
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
    hp: bal.monster.baseHp * Math.pow(bal.growth.monsterHp, d) * (bal.monster.hpRamp[depth - 1] ?? 1),
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
  onslaught: 1,
  ward: 2.5,
  repel: 2.5,
  armor: 1,
  surge: 0,
  blink: 1.5,
  // The constructs spec's forms, as their kin until B1 tunes them.
  whirl: 2,
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Power's rune constants (see the runes spec): an extra shot or a shard finds
 * a foe half the time, a finitely pierced foe counts a quarter, reactions are
 * a fifth of a hit's worth (Volatile's share), and an extra stack is 5%.
 */
const EXTRA_SHOT = 0.5;
const PIERCED_FOE = 0.25;
const REACTION_SHARE = 0.2;
const PER_STACK = 0.05;

type KnobSet = ResolvedAbility['knobs'];

/** Impacts one use lands: a Barrage's or Onslaught's count, a Maelstrom's or Whirl's ticks, else 1. */
function repeatsOf(ab: ResolvedAbility): number {
  const f = ab.form.id;
  if (f === 'barrage' || f === 'onslaught') return ab.count;
  if (f === 'maelstrom' || f === 'whirl') return ab.duration / ab.tick;
  return 1;
}

/**
 * What one impact is worth, in hits: its `targets` (sized by area), a finite
 * pierce's foes (at most 3; an Earth move's endless pierce adds nothing), its
 * chain's jumps, its lingering ground and Split's shards.
 */
function reach(k: KnobSet, targets: number, bal: DelveBalance): number {
  const pierced = Number.isFinite(k.pierce) ? PIERCED_FOE * Math.min(k.pierce, 3) : 0;
  let jumps = 0;
  for (let i = 1; i <= k.chain; i++) jumps += Math.pow(bal.abilities.chainPower, i);
  const zone = k.zone ? (k.zone.seconds / 0.5) * k.zone.tickPower * targets : 0;
  const shards = k.split ? EXTRA_SHOT * k.split.count * k.split.power : 0;
  // Detonate: each foe struck blasts round itself, finding a foe half the time.
  const blasts = EXTRA_SHOT * k.detonate * targets;
  return targets + pierced + jumps + zone + shards + blasts;
}

/** What scales a whole use: Echo's repeat, Volatile's reactions and Saturate's stacks (1 without). */
function boost(k: KnobSet): number {
  return (1 + k.echo) * (1 + REACTION_SHARE * k.catalyst) * (1 + PER_STACK * k.stacksBonus);
}

/**
 * Multi-shot on a move (its per-shot cut is in its power already): a Bolt's or
 * a Lance's fan, each extra shot finding a foe half the time; a Volley's added
 * darts (in its `count`). A Barrage's are in its repeats.
 */
function shots(ab: ResolvedAbility): number {
  const extra = ab.knobs.extraShots;
  if (!extra) return 1;
  if (ab.form.id === 'volley') return ab.count / (ab.count - extra.count);
  return ab.form.id === 'bolt' || ab.form.id === 'lance' ? 1 + EXTRA_SHOT * extra.count : 1;
}

/**
 * A basic blow's runes as a factor on its hit (1 without): its power knob,
 * Multi-shot's fan at its per-shot power, its reach (Widen on a melee cleave)
 * over the plain cleave, and its boost.
 */
function blowRunes(k: KnobSet, cleave: number, bal: DelveBalance): number {
  const fan = k.extraShots ? (1 + EXTRA_SHOT * k.extraShots.count) * k.extraShots.power : 1;
  return (k.power * fan * reach(k, cleave * (1 + (k.area - 1) * 0.5), bal) * boost(k)) / cleave;
}

/**
 * Mana a use of a chain drains: each move's per foe-hit × its foe-hits (its
 * foes × its impacts), at most `drainFoes`, and at most `drainShare` of its
 * cost before its runes' load (`baseCost`), as the sim caps it.
 */
function drainPerUse(chain: ResolvedChain, bal: DelveBalance, pool = Infinity): number {
  return mean(
    // A move the pool can't pay drains nothing (`valuedChain`).
    valuedChain(chain, pool).map((ab) => {
      if (!ab) return 0;
      const hits = TARGETS[ab.form.id] * repeatsOf(ab);
      return Math.min(
        ab.knobs.manaOnHit * Math.min(hits, bal.runes.drainFoes),
        baseCost(ab) * bal.runes.drainShare,
      );
    }),
  );
}

/** Each move's Guard: the share of life it shields on landing (none from a move the pool can't pay). */
function guards(chain: ResolvedChain, pool = Infinity): number[] {
  return valuedChain(chain, pool).map((ab) => ab?.knobs.guardOnLand ?? 0);
}

/**
 * Guard's barrier on a chain as a share of life: each move's value × the
 * share of `guardSeconds` it covers between its landings (the per-use
 * interval × the chain's length); the largest.
 */
function guardShare(values: number[], interval: number, bal: DelveBalance): number {
  const between = interval * values.length;
  return Math.max(...values.map((v) => v * Math.min(1, bal.runes.guardSeconds / between)));
}

/**
 * A chain's lifesteal from its runes alone, averaged over its moves (a rune's
 * lifesteal adds; a move the pool can't pay adds none).
 */
function runeLeech(registry: DataRegistry, chain: ResolvedChain | null, pool = Infinity): number {
  if (!chain) return 0;
  return mean(
    valuedChain(chain, pool).map(
      (ab) =>
        ab?.runes.reduce(
          (sum, r) => sum + (registry.getRune(r.id).tiers[r.tier - 1].lifesteal ?? 0),
          0,
        ) ?? 0,
    ),
  );
}

/** The move Power values at step `i` of a chain: a hold move at its full charge (stage 2). */
export function valuedMove(chain: ResolvedChain, i: number): ResolvedAbility {
  return chain.moves[i].kind === 'hold' ? chainMove(chain, i, 2) : chain.moves[i];
}

/**
 * The moves Power values, in order: each at its valued stage (a hold at the highest stage
 * the pool affords, up to full charge), cut after the first move the pool can't pay,
 * which is null. With `pool` Infinity it is today's `valuedMove` for every move.
 */
export function valuedChain(chain: ResolvedChain, pool = Infinity): (ResolvedAbility | null)[] {
  const out: (ResolvedAbility | null)[] = [];
  for (const [i, move] of chain.moves.entries()) {
    // A hold lets go at the highest stage the pool pays (`releaseHold`); one whose stage 0 it
    // can't pay never starts (`startHold`), as a move over the pool is never cast.
    const stages = chain.hold[i] ?? [move];
    let s = stages.length - 1;
    while (s >= 0 && stages[s].cost > pool) s--;
    out.push(s >= 0 ? stages[s] : null);
    if (s < 0) break;
  }
  return out;
}

/**
 * Damage of one use of a chain, averaged over its moves as the pool plays them
 * (`valuedChain`: each with its step bonus, a hold at the highest stage the
 * pool affords; a move the pool can't pay deals nothing), counting jumps,
 * lingering ground and repeats, and its runes through their knobs (`reach`,
 * `shots`, `boost`).
 */
export function damagePerUse(
  chain: ResolvedChain,
  hit: number,
  stats: HeroStats,
  bal: DelveBalance,
  pool = Infinity,
): number {
  return mean(
    valuedChain(chain, pool).map((ab) => {
      if (!ab) return 0;
      const k = ab.knobs;
      const targets = TARGETS[ab.form.id] * (1 + (k.area - 1) * 0.5);
      const step = stepBonus(bal, ab.index).power;
      const perHit = hit * ab.power * step * (1 + stats.elementPower[ab.element]);
      return perHit * reach(k, targets, bal) * repeatsOf(ab) * shots(ab) * boost(k);
    }),
  );
}

/**
 * Seconds between uses, averaged over the chain's moves, when used as often as
 * its cooldowns, its payment and its cadence allow. The cadence is a move's
 * wind-up plus its beat (see the chain feel spec). A hold is valued at full
 * charge: its wind-up is the longer of its charge (`holdTime` × the tempo) and
 * its stage's wind-up, and its cooldown counts from its landing. The moves are
 * the pool's (`valuedChain`): a move it can't pay waits out the restart window
 * (`comboWindow`), and the chain starts over.
 */
export function useInterval(
  bal: DelveBalance,
  chain: ResolvedChain,
  tempo: number,
  manaIncome: number,
  chargeRate: number,
  pool = Infinity,
): number {
  return mean(
    valuedChain(chain, pool).map((ab) => {
      if (!ab) return bal.abilities.comboWindow;
      const hold = ab.kind === 'hold';
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
 * The basics' mean seconds between strikes, as Power counts them: the attack
 * interval × the blows' mean time, each blow's Quick or Heavy (`quick.beat`)
 * scaling its share. Its inverse is the attack speed the Anvil shows.
 */
export function strikeInterval(stats: HeroStats): number {
  const blows = stats.weapon.blows;
  const stringTime = blows.reduce((a, s) => a + s.time * s.knobs.quick.beat, 0);
  return (stats.attackInterval * stringTime) / blows.length;
}

/**
 * Mana a second the basics bring back at their full rate, as Power counts them
 * (see the rune costs spec): regen, `basicAttackGain` a strike, and the blows'
 * Drain (each blow's foe-hits at most `drainFoes`, capped at `drainShare` of a
 * strike's gain), over the strike interval. `estimateCombat`'s mana income
 * before its skills' Drain.
 */
export function basicIncome(registry: DataRegistry, stats: HeroStats): number {
  const bal = registry.getDelveBalance();
  // As `estimateCombat` counts the basics: its cleave and its strike interval.
  const blows = stats.weapon.blows;
  const melee = stats.weapon.kind === 'melee';
  const cleave = melee ? 1 + (stats.weapon.arc / 360) * 1.5 : stats.weapon.pierce ? 1.4 : 1;
  const interval = strikeInterval(stats);
  const income = manaPool(stats, registry).regen + bal.mana.basicAttackGain / interval;
  const blowDrain = mean(
    blows.map((b) =>
      Math.min(
        b.knobs.manaOnHit * Math.min(cleave, bal.runes.drainFoes),
        bal.mana.basicAttackGain * bal.runes.drainShare,
      ),
    ),
  );
  return income + blowDrain / interval;
}

/** A chain's mana spend a second against the build's refill (see the rune costs spec). */
export interface ManaSupport {
  /** Mana a second the chain spends, held at its cadence: each move's cost over the
   *  interval its cooldown, wind-up and beat allow (`useInterval` with mana and charge
   *  unbounded), as if the pool always paid. 0 for a charge chain. */
  spend: number;
  /** Mana a second the build brings back while it does: regen, the basics at their full
   *  rate (`basicAttackGain` a strike plus the blows' Drain, as Power counts them), and
   *  this chain's own Drain at its cadence (`drainPerUse`). */
  refill: number;
}

/**
 * A chain's mana support, for the builder's "Spends 14/s · your build refills
 * 9/s" (see the rune costs spec): its moves' mean cost (a hold's at full
 * charge) over its unbounded `useInterval`, against `basicIncome` plus its
 * own Drain over the same interval. It ignores the pool's cap.
 */
export function manaSupport(
  registry: DataRegistry,
  stats: HeroStats,
  chain: ResolvedChain,
): ManaSupport {
  const bal = registry.getDelveBalance();
  const every = useInterval(bal, chain, stats.tempo, Infinity, Infinity);
  return {
    spend: mean(chain.moves.map((_, i) => valuedMove(chain, i).cost)) / every,
    refill: basicIncome(registry, stats) + drainPerUse(chain, bal) / every,
  };
}

/** The expected hit before a move's power: weapon damage × damage multiplier × the crit factor. */
export function expectedHit(stats: HeroStats): number {
  const critFactor = 1 + stats.critChance * (stats.critMultiplier - 1);
  return stats.weaponDamage * stats.damageMult * critFactor;
}

/** One full cycle of an ability chain, as Power values it (the Skills tab's stats and rhythm). */
export interface ChainCycle {
  /** One full cycle's damage: `damagePerUse` at `expectedHit` × moves. */
  damage: number;
  /** One full cycle's seconds: the unbounded `useInterval` × moves. */
  seconds: number;
  /** Mana spent in one cycle: each move's valued cost (0 paid with charge). */
  mana: number;
  /** Each move as valued (a hold at full charge). */
  steps: {
    /** Its wind-up (conjure and channel); a hold's max(holdFull, castTime). */
    cast: number;
    /** `moveBeat` at the hero's tempo. */
    beat: number;
    kind: MoveKind;
    elements: ManaType[];
    hold: boolean;
    /** Its runes repeat it (Echo). */
    echo: boolean;
  }[];
  /** `comboWindow`: the pause after the last beat that starts the chain over. */
  restart: number;
}

/** An ability chain's cycle (never the basic chain's): `chain` is the resolved draft. */
export function chainCycle(
  registry: DataRegistry,
  stats: HeroStats,
  chain: ResolvedChain,
): ChainCycle {
  const bal = registry.getDelveBalance();
  const n = chain.moves.length;
  const moves = chain.moves.map((_, i) => valuedMove(chain, i));
  return {
    damage: damagePerUse(chain, expectedHit(stats), stats, bal) * n,
    seconds: useInterval(bal, chain, stats.tempo, Infinity, Infinity) * n,
    mana: moves.reduce((sum, ab) => sum + ab.cost, 0),
    steps: moves.map((ab) => {
      const hold = ab.kind === 'hold';
      return {
        cast: hold ? Math.max(holdFull(bal, stats.tempo), ab.castTime) : ab.castTime,
        beat: moveBeat(bal, ab, stats.tempo),
        kind: ab.kind,
        elements: ab.elements,
        hold,
        echo: ab.knobs.echo > 0,
      };
    }),
    restart: bal.abilities.comboWindow,
  };
}

/**
 * Heuristic DPS / effective-HP estimate against the reference monster, used
 * for Power and item comparisons. The basic attack, the Primary and the
 * Ultimate count toward DPS (sharing mana and time); the Defensive counts
 * toward survival. A skill left out of `chains` counts nothing. Runes count
 * through their knobs: the moves' in `damagePerUse`, the blows' in
 * `blowRunes` and their time, Drain as mana, Guard as a barrier and Leech as
 * sustain (see the runes spec).
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

  const hit = expectedHit(stats);
  const melee = stats.weapon.kind === 'melee';
  const cleave = melee ? 1 + (stats.weapon.arc / 360) * 1.5 : stats.weapon.pierce ? 1.4 : 1;
  // Each blow's power × its element's power × its runes (`blowRunes`), over the chain's time
  // (a blow's Quick or Heavy scales its share of it).
  const blows = stats.weapon.blows;
  const stringTime = blows.reduce((a, s) => a + s.time * s.knobs.quick.beat, 0);
  const interval = strikeInterval(stats);
  const value = (b: (typeof blows)[number]) => b.attunePower * (1 + stats.elementPower[b.element]);
  // Twin Fang: one extra hit on the last blow, at its value (×1.5 melee, ×1 ranged; no runes).
  const twin = ((L.twin_fang ?? 0) / 100) * (melee ? 1.5 : 1);
  const stringValue =
    blows.reduce((a, b) => a + b.power * value(b) * blowRunes(b.knobs, cleave, bal), 0) +
    twin * value(blows[blows.length - 1]);
  const basicDps = (hit * cleave * (stringValue / stringTime)) / stats.attackInterval;
  let dps = basicDps;

  const [primary, defensive, ultimate] = ABILITY_SLOTS.map((slot) => {
    const chain = chains[slot];
    return chain ? resolveChain(registry, stats, slot, chain) : null;
  });
  const pool = manaPool(stats, registry);
  const unit = Math.max(1, stats.weaponDamage * stats.damageMult);
  // Each chain as the sim plays it against the pool (`valuedChain`).
  const every = (chain: ResolvedChain, income: number, rate: number) =>
    useInterval(bal, chain, stats.tempo, income, rate, pool.max);
  // Drain: mana per foe-hit, the blows' on each strike and each skill's on each use, over its
  // interval at the income before Drain (one pass).
  const income = pool.regen + bal.mana.basicAttackGain / interval;
  const drained = (chain: ResolvedChain | null, share: number) => {
    const perUse = chain ? drainPerUse(chain, bal, pool.max) : 0;
    return perUse > 0 ? perUse / every(chain!, income * share, dps / unit) : 0;
  };
  const manaIncome =
    basicIncome(registry, stats) +
    drained(primary, 0.7) +
    drained(ultimate, 0.3) +
    drained(defensive, 0.3);
  const primaryEvery = primary ? every(primary, manaIncome * 0.7, dps / unit) : 0;
  const primaryDps = primary ? damagePerUse(primary, hit, stats, bal, pool.max) / primaryEvery : 0;
  // Abilities share the hero's time and mana; count them at partial efficiency.
  dps += primaryDps * 0.75;
  const chargeRate = dps / unit;
  const ultimateEvery = ultimate ? every(ultimate, manaIncome * 0.3, chargeRate) : 0;
  const ultimateDps = ultimate
    ? (damagePerUse(ultimate, hit, stats, bal, pool.max) / ultimateEvery) * 0.8
    : 0;
  dps += ultimateDps;

  let mitigation = (1 - armorReduction(bal, stats.armor, depth)) * (1 - stats.dodge);
  let bonusLife = 0;
  const guardEvery = defensive ? every(defensive, manaIncome * 0.3, chargeRate) : 0;
  let defensiveDps = 0;
  if (defensive) {
    // The Defensive's effect: its first move's (a hold's at the highest stage the pool affords).
    // A first move the pool can't pay is never cast: no effect at all.
    const guard = valuedChain(defensive, pool.max)[0];
    if (guard) {
      const guardFor =
        guard.form.id === 'blink' ? bal.abilities.defend.blinkSeconds : guard.duration;
      const uptime = Math.min(1, guardFor / Math.max(guardFor, guardEvery));
      if (guard.form.id === 'armor') mitigation *= 1 - Math.min(0.75, guard.effect) * uptime;
      if (guard.elements.includes('earth'))
        mitigation *= 1 - bal.abilities.defend.earthReduction * uptime;
      if (guard.form.id === 'ward') bonusLife += stats.maxHp * guard.effect * uptime * 2;
      if (guard.form.id === 'surge') dps *= 1 + guard.effect * uptime;
      if (guard.form.id === 'blink') mitigation *= 1 - 0.3 * uptime;
    }
    defensiveDps =
      (damagePerUse(defensive, hit, stats, bal, pool.max) / Math.max(1, guardEvery)) * 0.5;
    dps += defensiveDps;
  }
  // Guard: a barrier of its share of life for `guardSeconds` each time its move lands, the
  // largest counting (it never stacks), valued as a Ward's.
  const shield = Math.max(
    guardShare(
      blows.map((b) => b.knobs.guardOnLand),
      interval,
      bal,
    ),
    primary ? guardShare(guards(primary, pool.max), primaryEvery, bal) : 0,
    ultimate ? guardShare(guards(ultimate, pool.max), ultimateEvery, bal) : 0,
    defensive ? guardShare(guards(defensive, pool.max), guardEvery, bal) : 0,
  );
  bonusLife += stats.maxHp * shield * 2;

  dps += stats.thorns / ref.interval;
  // Leech: each part of the DPS heals by its runes' lifesteal (an element's own lifesteal on an
  // ability isn't counted, as before runes).
  const leech =
    basicDps * mean(blows.map((b) => b.knobs.lifesteal)) +
    primaryDps * 0.75 * runeLeech(registry, primary, pool.max) +
    ultimateDps * runeLeech(registry, ultimate, pool.max) +
    defensiveDps * runeLeech(registry, defensive, pool.max);
  const sustain = dps * stats.lifesteal + leech;
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

/**
 * The extra that applies a profile's pair (its power and the two-element limit) and its basic
 * chain, and any attunement on top (a dive's boons': `diveStats`).
 */
export function pairExtra(
  pair?: ManaPair,
  basic?: Blow[],
  attunement?: Partial<ManaMap>,
): HeroStatsExtra {
  return {
    ...(pair ? { pair, filterAttunement: true } : {}),
    basic,
    ...(attunement ? { attunement } : {}),
  };
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
 * How a weapon is valued: `home`, with the equipped weapon's constructs moved
 * onto it (`moveAllPreview`); `asIs`, with its own, as it would fight if
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
    ? { ...item, moveset: moveAllPreview(registry, worn, item).moveset }
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
