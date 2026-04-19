import type { StatModifier } from '../types/affix.js';
import type { BalanceConfig } from '../types/balance.js';
import type { DerivedStats } from '../types/derived-stats.js';
import type { ForgedItem, Loadout } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import type { ActiveSynergy } from '../types/synergy.js';
import { ALL_ELEMENTS, createEmptyDerivedStats } from '../types/derived-stats.js';
import { RARITY_MULTIPLIERS } from '../types/gem.js';

// ---- Public types ----

export interface StatsResult {
  stats: DerivedStats;
  activeSynergies: ActiveSynergy[];
}

// ---- Internal types ----

interface ModifierBuckets {
  flat: Map<string, number>;
  percent: Map<string, number>;
  override: Map<string, number>;
}

// ---- Stat key aliases: data keys that map to DerivedStats fields ----
// Some affix data uses different keys than DerivedStats. We map them here.
const STAT_KEY_ALIASES: Record<string, string> = {
  attackSpeed: 'attackSpeed',
  critDamage: 'critMultiplier',
  lifesteal: 'lifestealPercent',
  blockBreak: 'blockBreakChance',
  dotDamageMultiplier: 'dotMultiplier',
};

// Keys that legitimately have no DerivedStats home (applied elsewhere).
// Behavior-style synergy/compound keys stay skipped until the duel engine
// consumes them (compound.* is Chunk 3; remaining synergy.* is a P1
// follow-up that requires duel-engine integration).
function shouldSkipKey(key: string): boolean {
  // Behavior-style compound params are consumed by the trigger system
  // reading gem.outputBonusEffects directly — skip them here.
  if (key.startsWith('compound.')) return true;
  // Behavior-style synergy effects (firstHitCrit, critHealDouble, stunImmune,
  // etc.) are not yet wired into combat. P1 work.
  if (key.startsWith('synergy.')) return true;
  // Scaling/behavior keys that the duel engine applies, not the stat calc.
  const duelEngineKeys = [
    'procDamage',
    'flatDamageEffectiveness',
    'damageReduction',
    'elementalResistance',
    'barrierStrength',
    'sustainEffectiveness',
    'lifestealEffectiveness',
    'hpBonus',
    'penetration',
    'damageTakenHealedOver2s',
    'reducedCritDamageTaken',
    'physicalDamageReduction',
    'dotDamageTakenReduction',
    'dodge',
    'dotDamage',
  ];
  return duelEngineKeys.includes(key);
}

// Synergy-style bare keys → canonical DerivedStats fields / expansion tokens.
// synergies.json uses non-canonical names (maxHp vs maxHP, bare weaponDamage
// meaning "physical + all elemental", etc.). Map them before expansion.
const SYNERGY_BARE_KEY_ALIASES: Record<string, string> = {
  maxHp: 'maxHP',
  weaponDamage: '__weaponDamageAll', // expanded by expandSpecialKey
  elementalDamage: 'allElementalDamage',
  elementalResist: 'allResistances',
};

// ---- Helpers ----

function createBuckets(): ModifierBuckets {
  return {
    flat: new Map(),
    percent: new Map(),
    override: new Map(),
  };
}

function addToBucket(buckets: ModifierBuckets, mod: StatModifier): void {
  const key = resolveStatKey(mod.stat);
  if (key === null) return;

  // Expand special keys
  const expandedKeys = expandSpecialKey(key);

  for (const k of expandedKeys) {
    const bucket = buckets[mod.op];
    bucket.set(k, (bucket.get(k) ?? 0) + mod.value);
  }
}

/** Resolve aliases, return null if the key should be skipped. */
function resolveStatKey(stat: string): string | null {
  if (shouldSkipKey(stat)) return null;

  // Synergy-style bare keys map to canonical DerivedStats fields or
  // expansion tokens (see expandSpecialKey below).
  if (SYNERGY_BARE_KEY_ALIASES[stat]) {
    return SYNERGY_BARE_KEY_ALIASES[stat];
  }

  // Check aliases for top-level keys (existing behavior for dotted keys).
  const topKey = stat.split('.')[0];
  if (STAT_KEY_ALIASES[topKey]) {
    const rest = stat.includes('.') ? '.' + stat.split('.').slice(1).join('.') : '';
    return STAT_KEY_ALIASES[topKey] + rest;
  }

  return stat;
}

/** Expand allElementalDamage / allResistances / __weaponDamageAll to individual keys. */
function expandSpecialKey(key: string): string[] {
  if (key === 'allElementalDamage') {
    return ALL_ELEMENTS.map((e) => `elementalDamage.${e}`);
  }
  if (key === 'allResistances') {
    return ALL_ELEMENTS.map((e) => `resistances.${e}`);
  }
  if (key === '__weaponDamageAll') {
    // "+X weapon damage" = +X physical + +X to each elemental element.
    return ['physicalDamage', ...ALL_ELEMENTS.map((e) => `elementalDamage.${e}`)];
  }
  return [key];
}

/** Get a nested stat value using dot notation. */
function getStatValue(stats: DerivedStats, key: string): number {
  const obj = stats as unknown as Record<string, unknown>;
  if (!key.includes('.')) {
    return obj[key] as number;
  }
  const [parent, child] = key.split('.');
  const nested = obj[parent] as Record<string, number>;
  return nested[child];
}

/** Set a nested stat value using dot notation. */
function setStatValue(stats: DerivedStats, key: string, value: number): void {
  const obj = stats as unknown as Record<string, unknown>;
  if (!key.includes('.')) {
    (obj as Record<string, number>)[key] = value;
    return;
  }
  const [parent, child] = key.split('.');
  const nested = obj[parent] as Record<string, number>;
  nested[child] = value;
}

/** Check if a stat key is valid on DerivedStats. */
function isValidStatKey(stats: DerivedStats, key: string): boolean {
  const obj = stats as unknown as Record<string, unknown>;
  if (!key.includes('.')) {
    return key in obj;
  }
  const [parent, child] = key.split('.');
  const nested = obj[parent];
  if (typeof nested !== 'object' || nested === null) return false;
  return child in (nested as Record<string, unknown>);
}

/** Collect all affix IDs present across both items in a loadout. */
export function collectAffixIds(loadout: Loadout): string[] {
  const ids = new Set<string>();
  for (const item of [loadout.weapon, loadout.armor]) {
    for (const slot of item.slots) {
      if (!slot) continue;
      // Spread gem's tags (which include affixId as first entry from createGem)
      // Use Set to automatically deduplicate when same affix appears on multiple gems
      for (const tag of slot.gem.tags) {
        ids.add(tag);
      }
    }
  }
  return Array.from(ids);
}

/**
 * Compute which synergies are active for a given loadout.
 * Returns array of ActiveSynergy with isActive flag and missingCount.
 */
function computeActiveSynergies(loadout: Loadout, registry: DataRegistry): ActiveSynergy[] {
  const affixIds = collectAffixIds(loadout);
  const synergies = registry.getAllSynergies();
  return synergies.map(synergy => {
    const isActive = isSynergyActive(synergy.requiredAffixes, affixIds);
    const missingCount = isActive ? 0 : synergy.requiredAffixes.length - affixIds.filter(id => synergy.requiredAffixes.includes(id)).length;
    return {
      synergyId: synergy.id,
      isActive,
      missingCount,
    };
  });
}

// ---- Base stat scaling ----

/** Map base-stat scaling keys to DerivedStats modifier keys where possible. */
const BASE_STAT_SCALING_MAP: Record<string, string | null> = {
  // STR weapon
  physicalDamage: 'physicalDamage',
  flatDamageEffectiveness: null, // duel engine
  // STR armor
  armor: 'armor',
  damageReduction: null, // duel engine

  // INT weapon
  elementalDamage: null, // bare key, skip (generic bonus handled by duel engine)
  dotDamage: null, // duel engine
  // INT armor
  elementalResistance: null, // duel engine (generic)
  barrierStrength: null, // duel engine

  // DEX weapon
  critChance: 'critChance',
  attackSpeed: 'attackSpeed', // inverted
  penetration: null, // duel engine
  // DEX armor
  dodgeChance: 'dodgeChance',
  critAvoidance: 'critAvoidance',

  // VIT weapon
  lifestealEffectiveness: null, // duel engine
  hpBonus: null, // duel engine (or could map to maxHP? spec is unclear, skip for now)
  // VIT armor
  maxHP: 'maxHP',
  hpRegen: 'hpRegen',
  sustainEffectiveness: null, // duel engine
};

function applyBaseStatScaling(
  buckets: ModifierBuckets,
  item: ForgedItem,
  itemType: 'weapon' | 'armor',
  balance: BalanceConfig,
): void {
  if (!item.baseStats) return;

  const stats = [item.baseStats.stat1, item.baseStats.stat2];

  for (const stat of stats) {
    const scaling = balance.baseStatScaling[stat][itemType];
    for (const [scaleKey, scaleValue] of Object.entries(scaling)) {
      const mappedKey = BASE_STAT_SCALING_MAP[scaleKey];
      if (mappedKey === null || mappedKey === undefined) continue;

      // attackSpeed scaling is special: positive value means faster attacks = lower seconds
      if (scaleKey === 'attackSpeed') {
        // attackSpeed: percent reduction of attack speed (seconds)
        buckets.percent.set(
          'attackSpeed',
          (buckets.percent.get('attackSpeed') ?? 0) + (-scaleValue),
        );
      } else {
        // Determine if this should be flat or percent based on the value magnitude
        // Base stat scaling values are flat additions
        buckets.flat.set(
          mappedKey,
          (buckets.flat.get(mappedKey) ?? 0) + scaleValue,
        );
      }
    }
  }
}

// ---- Main pipeline ----

export function calculateStats(loadout: Loadout, registry: DataRegistry): StatsResult {
  const balance = registry.getBalance();
  const buckets = createBuckets();

  // Step 1: Start with base values
  const stats = createEmptyDerivedStats();
  stats.maxHP = balance.baseHP;
  stats.critMultiplier = balance.baseCritMultiplier;

  // Step 2: Apply base item stats as flat modifiers
  // Weapon attackSpeed is an override (it IS the base attack speed, not an addition)
  const weaponDef = registry.getBaseItem(loadout.weapon.baseItemId);
  const armorDef = registry.getBaseItem(loadout.armor.baseItemId);

  for (const [stat, value] of Object.entries(weaponDef.baseStats)) {
    if (stat === 'attackSpeed') {
      stats.attackSpeed = value; // Override the default with weapon's base attack speed
    } else {
      addToBucket(buckets, { stat, op: 'flat', value });
    }
  }
  for (const [stat, value] of Object.entries(armorDef.baseStats)) {
    addToBucket(buckets, { stat, op: 'flat', value });
  }

  // Step 3: Apply base stat scaling
  applyBaseStatScaling(buckets, loadout.weapon, 'weapon', balance);
  applyBaseStatScaling(buckets, loadout.armor, 'armor', balance);

  // Step 4: Iterate weapon equipped slots
  applyEquippedSlots(buckets, loadout.weapon, 'weapon', registry);

  // Step 5: Iterate armor equipped slots
  applyEquippedSlots(buckets, loadout.armor, 'armor', registry);

  // Step 6: Detect active synergies and compute activeSynergies array
  const affixIds = collectAffixIds(loadout);
  const synergies = registry.getAllSynergies();
  for (const synergy of synergies) {
    if (isSynergyActive(synergy.requiredAffixes, affixIds)) {
      for (const mod of synergy.bonusEffects) {
        addToBucket(buckets, mod);
      }
    }
  }

  // Compute active synergies for reporting
  const activeSynergies = computeActiveSynergies(loadout, registry);

  // TODO: Synergy additive bonuses from gem tags (placeholder for future implementation)

  // Step 7: Apply modifier ordering (flat, then percent, then override)
  applyBucketsToStats(stats, buckets);

  // Step 8: Apply caps/floors
  applyCaps(stats, balance);

  // Step 9: Return frozen DerivedStats with activeSynergies
  return {
    stats: Object.freeze(stats),
    activeSynergies,
  };
}

function applyEquippedSlots(
  buckets: ModifierBuckets,
  item: ForgedItem,
  itemType: 'weapon' | 'armor',
  registry: DataRegistry,
): void {
  const effectKey = itemType === 'weapon' ? 'weaponEffect' : 'armorEffect';

  for (const slot of item.slots) {
    if (!slot) continue;

    const gem = slot.gem;
    const affixDef = registry.getAffix(gem.affixId);
    // Clamp tier to valid AffixTier range (1-4) for legacy data lookup
    const lookupTier = Math.min(gem.tier, 4) as 1 | 2 | 3 | 4;
    const tierData = affixDef.tiers[lookupTier];

    // Rarity multiplier: common = 1.0, magic = 1.25, rare = 1.5, epic = 2.0, legendary = 3.0
    const rarityMult = RARITY_MULTIPLIERS[gem.rarity];

    // Apply base affix effects scaled by rarity multiplier
    for (const mod of tierData[effectKey]) {
      addToBucket(buckets, {
        stat: mod.stat,
        op: mod.op,
        value: mod.value * rarityMult,
      });
    }

    // Apply outputBonusEffects if present (recipe bonus), also scaled by rarity
    if (gem.outputBonusEffects) {
      for (const mod of gem.outputBonusEffects) {
        addToBucket(buckets, {
          stat: mod.stat,
          op: mod.op,
          value: mod.value * rarityMult,
        });
      }
    }
  }
}

/** Check if all required affixes are present in the collected affix IDs. */
export function isSynergyActive(requiredAffixes: string[], collectedIds: string[]): boolean {
  // Count occurrences in collected
  const countMap = new Map<string, number>();
  for (const id of collectedIds) {
    countMap.set(id, (countMap.get(id) ?? 0) + 1);
  }

  // Count required occurrences
  const requiredCount = new Map<string, number>();
  for (const id of requiredAffixes) {
    requiredCount.set(id, (requiredCount.get(id) ?? 0) + 1);
  }

  for (const [id, needed] of requiredCount) {
    if ((countMap.get(id) ?? 0) < needed) return false;
  }
  return true;
}

/** Apply flat, then percent, then override modifiers to the stats object. */
function applyBucketsToStats(stats: DerivedStats, buckets: ModifierBuckets): void {
  // Flat first
  for (const [key, value] of buckets.flat) {
    if (!isValidStatKey(stats, key)) continue;
    const current = getStatValue(stats, key);
    setStatValue(stats, key, current + value);
  }

  // Percent second (multiplicative on current total)
  for (const [key, value] of buckets.percent) {
    if (!isValidStatKey(stats, key)) continue;
    const current = getStatValue(stats, key);
    setStatValue(stats, key, current * (1 + value));
  }

  // Override last
  for (const [key, value] of buckets.override) {
    if (!isValidStatKey(stats, key)) continue;
    setStatValue(stats, key, value);
  }
}

/** Clamp stats to their allowed ranges using integer-scale caps from balance config. */
function applyCaps(stats: DerivedStats, balance: BalanceConfig): void {
  const caps = balance.statCaps;

  if (caps.critChance) {
    stats.critChance = clamp(stats.critChance, caps.critChance.min, caps.critChance.max);
  }
  if (caps.dodgeChance) {
    stats.dodgeChance = clamp(stats.dodgeChance, caps.dodgeChance.min, caps.dodgeChance.max);
  }
  if (caps.blockChance) {
    stats.blockChance = clamp(stats.blockChance, caps.blockChance.min, caps.blockChance.max);
  }

  stats.attackSpeed = Math.max(stats.attackSpeed, balance.minAttackSpeed);

  for (const el of ALL_ELEMENTS) {
    const capKey = `${el}Resistance`;
    if (caps[capKey]) {
      stats.resistances[el] = clamp(stats.resistances[el], caps[capKey].min, caps[capKey].max);
    }
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}
