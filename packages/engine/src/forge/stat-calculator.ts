import type { StatModifier } from '../types/affix.js';
import type { BalanceConfig } from '../types/balance.js';
import type { DerivedStats } from '../types/derived-stats.js';
import type { ForgedItem, Loadout } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import { ALL_ELEMENTS, createEmptyDerivedStats } from '../types/derived-stats.js';

// ---- Internal types ----

interface ModifierBuckets {
  flat: Map<string, number>;
  percent: Map<string, number>;
  override: Map<string, number>;
}

// ---- Stat key aliases: data keys that map to DerivedStats fields ----
// Some affix data uses different keys than DerivedStats. We map them here.
const STAT_KEY_ALIASES: Record<string, string> = {
  attackSpeed: 'attackInterval', // attackSpeed percent is inverted for attackInterval
  critDamage: 'critMultiplier',
  lifesteal: 'lifestealPercent',
  blockBreak: 'blockBreakChance',
  dotDamageMultiplier: 'dotMultiplier',
};

// Keys that are handled by the duel engine, not stat calc
function shouldSkipKey(key: string): boolean {
  if (key.startsWith('compound.')) return true;
  if (key.startsWith('synergy.')) return true;
  // Keys that don't map to any DerivedStats field
  const skipKeys = [
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
    'weaponDamage',
    'maxHp',
    'elementalDamage', // bare elementalDamage without dot notation (from synergies)
    'elementalResist',
  ];
  return skipKeys.includes(key);
}

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

  // Check aliases for top-level keys
  const topKey = stat.split('.')[0];
  if (STAT_KEY_ALIASES[topKey]) {
    const rest = stat.includes('.') ? '.' + stat.split('.').slice(1).join('.') : '';
    return STAT_KEY_ALIASES[topKey] + rest;
  }

  return stat;
}

/** Expand allElementalDamage / allResistances to individual element keys. */
function expandSpecialKey(key: string): string[] {
  if (key === 'allElementalDamage') {
    return ALL_ELEMENTS.map((e) => `elementalDamage.${e}`);
  }
  if (key === 'allResistances') {
    return ALL_ELEMENTS.map((e) => `resistances.${e}`);
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
function collectAffixIds(loadout: Loadout): string[] {
  const ids: string[] = [];
  for (const item of [loadout.weapon, loadout.armor]) {
    for (const slot of item.slots) {
      if (!slot) continue;
      switch (slot.kind) {
        case 'single':
          ids.push(slot.orb.affixId);
          break;
        case 'compound':
          ids.push(slot.orbs[0].affixId);
          ids.push(slot.orbs[1].affixId);
          break;
        case 'upgraded':
          ids.push(slot.orb.affixId);
          break;
      }
    }
  }
  return ids;
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
  attackSpeed: 'attackInterval', // inverted
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

      // attackSpeed scaling is special: positive value means faster attacks = lower interval
      if (scaleKey === 'attackSpeed') {
        // attackSpeed: percent reduction of attack interval
        buckets.percent.set(
          'attackInterval',
          (buckets.percent.get('attackInterval') ?? 0) + (-scaleValue),
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

export function calculateStats(loadout: Loadout, registry: DataRegistry): DerivedStats {
  const balance = registry.getBalance();
  const buckets = createBuckets();

  // Step 1: Start with base values
  const stats = createEmptyDerivedStats();
  stats.maxHP = balance.baseHP;
  stats.critMultiplier = balance.baseCritMultiplier;

  // Step 2: Apply base item inherent bonuses
  const weaponDef = registry.getBaseItem(loadout.weapon.baseItemId);
  const armorDef = registry.getBaseItem(loadout.armor.baseItemId);

  for (const mod of weaponDef.inherentBonuses) {
    addToBucket(buckets, mod);
  }
  for (const mod of armorDef.inherentBonuses) {
    addToBucket(buckets, mod);
  }

  // Step 3: Apply base stat scaling
  applyBaseStatScaling(buckets, loadout.weapon, 'weapon', balance);
  applyBaseStatScaling(buckets, loadout.armor, 'armor', balance);

  // Step 4: Iterate weapon equipped slots
  applyEquippedSlots(buckets, loadout.weapon, 'weapon', registry);

  // Step 5: Iterate armor equipped slots
  applyEquippedSlots(buckets, loadout.armor, 'armor', registry);

  // Step 6: Detect active synergies
  const affixIds = collectAffixIds(loadout);
  const synergies = registry.getAllSynergies();
  for (const synergy of synergies) {
    if (isSynergyActive(synergy.requiredAffixes, affixIds)) {
      for (const mod of synergy.bonusEffects) {
        addToBucket(buckets, mod);
      }
    }
  }

  // Step 7: Apply modifier ordering (flat, then percent, then override)
  applyBucketsToStats(stats, buckets);

  // Step 8: Apply caps/floors
  applyCaps(stats, balance);

  // Step 9: Return frozen DerivedStats
  return Object.freeze(stats);
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

    switch (slot.kind) {
      case 'single': {
        const affixDef = registry.getAffix(slot.orb.affixId);
        const tierData = affixDef.tiers[slot.orb.tier];
        for (const mod of tierData[effectKey]) {
          addToBucket(buckets, mod);
        }
        break;
      }
      case 'compound': {
        const compoundDef = registry.getCombinationById(slot.compoundId);
        if (compoundDef) {
          for (const mod of compoundDef[effectKey]) {
            addToBucket(buckets, mod);
          }
        }
        break;
      }
      case 'upgraded': {
        const affixDef = registry.getAffix(slot.orb.affixId);
        const tierData = affixDef.tiers[slot.upgradedTier];
        for (const mod of tierData[effectKey]) {
          addToBucket(buckets, mod);
        }
        break;
      }
    }
  }
}

/** Check if all required affixes are present in the collected affix IDs. */
function isSynergyActive(requiredAffixes: string[], collectedIds: string[]): boolean {
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

/** Clamp stats to their allowed ranges. */
function applyCaps(stats: DerivedStats, balance: BalanceConfig): void {
  stats.critChance = clamp(stats.critChance, 0, 0.95);
  stats.dodgeChance = clamp(stats.dodgeChance, 0, 0.75);
  stats.blockChance = clamp(stats.blockChance, 0, 0.75);
  stats.attackInterval = Math.max(stats.attackInterval, balance.minAttackInterval);

  for (const el of ALL_ELEMENTS) {
    stats.resistances[el] = clamp(stats.resistances[el], 0, 0.90);
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}
