import type { DataRegistry, HeroStatKey, MaterialRef, RuneTier, ShardRef } from '@alloy/engine';
import { RARITY_LABEL, formatStatValue } from '../../format';
import { TIER_NUMERAL } from '../../runes/rune-style';

/** 0.4 → "40%". */
export const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** An affix's label; "Damage %" where a flat affix shares it. */
export function affixLabel(registry: DataRegistry, stat: HeroStatKey): string {
  const def = registry.getGearAffix(stat);
  if (!def) return stat;
  const shared = registry
    .getDelveData()
    .affixes.some((a) => a.stat !== stat && a.label === def.label);
  return shared && def.unit === 'pct' ? `${def.label} %` : def.label;
}

/** "Crit Chance II". */
export function shardName(registry: DataRegistry, { stat, tier }: ShardRef): string {
  return `${affixLabel(registry, stat)} ${TIER_NUMERAL[tier as RuneTier]}`;
}

/** "Iron bar", "Rare flux", "Crit Chance II", "Prism essence", "Mana Dust", "Links". */
export function materialLabel(registry: DataRegistry, ref: MaterialRef): string {
  switch (ref.kind) {
    case 'metal':
      return `${registry.getCraftingData().metals.find((m) => m.id === ref.metal)!.name} bar`;
    case 'flux':
      return `${RARITY_LABEL[ref.grade]} flux`;
    case 'shard':
      return shardName(registry, ref);
    case 'essence':
      return `${registry.getLegendary(ref.essence).name} essence`;
    case 'dust':
      return 'Mana Dust';
    case 'links':
      return 'Links';
  }
}

/** "+3 to +5", or "+4" when the ends meet. */
export function valueRange(
  registry: DataRegistry,
  stat: HeroStatKey,
  lo: number,
  hi: number,
): string {
  const [a, b] = [formatStatValue(registry, stat, lo), formatStatValue(registry, stat, hi)];
  return a === b ? a : `${a} to ${b}`;
}

/** "+3 to +5 Armor". */
export function statRange(
  registry: DataRegistry,
  stat: HeroStatKey,
  lo: number,
  hi: number,
): string {
  return `${valueRange(registry, stat, lo, hi)} ${registry.getGearAffix(stat)?.label ?? stat}`;
}
