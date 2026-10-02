import {
  FLUX_GRADES,
  METAL_IDS,
  type AffixFamily,
  type DataRegistry,
  type Haul,
  type HeroStatKey,
  type MaterialRef,
  type MaterialsPouch,
  type MetalId,
  type RunePouch,
  type RuneTier,
} from '@alloy/engine';
import { RARITY_COLOR, RARITY_LABEL } from '../format';
import { FAMILY_STYLE, TIER_NUMERAL, runeName } from '../runes/rune-style';

/** Each metal's colour (its bars on the floor, its swatches), rust up to void. */
export const METAL_COLOR: Record<MetalId, string> = {
  rusty: '#b86f50',
  iron: '#8b9bb4',
  steel: '#c0cbdc',
  mithril: '#a8e6f0',
  adamant: '#3e8948',
  starforged: '#fee761',
  voidforged: '#8f5ac8',
};

/** Each affix family's colour: a shard wears its affix's. */
export const AFFIX_FAMILY_COLOR: Record<AffixFamily, string> = {
  offense: '#e43b44',
  defense: '#0099db',
  sustain: '#63c74d',
  utility: '#feae34',
  element: '#b07cff',
};

export const DUST_COLOR = '#2ce8f5';
export const LINKS_COLOR = '#1fb5a8';
export const SCRAP_COLOR = '#fcd34d';

const numeral = (tier: number) => TIER_NUMERAL[tier as RuneTier] ?? String(tier);

/**
 * A material's colour: a bar its metal's, a flux its grade's rarity, a shard its affix family's,
 * an essence legendary orange, Mana Dust cyan and Links teal.
 */
export function materialColor(registry: DataRegistry, ref: MaterialRef): string {
  switch (ref.kind) {
    case 'metal':
      return METAL_COLOR[ref.metal];
    case 'flux':
      return RARITY_COLOR[ref.grade];
    case 'shard':
      return AFFIX_FAMILY_COLOR[registry.getCraftingData().families[ref.stat]];
    case 'essence':
      return RARITY_COLOR.legendary;
    case 'dust':
      return DUST_COLOR;
    case 'links':
      return LINKS_COLOR;
  }
}

/** An affix's label; "Damage %" where a flat affix shares it (as the Forge tab writes it). */
function affixLabel(registry: DataRegistry, stat: HeroStatKey): string {
  const def = registry.getGearAffix(stat);
  if (!def) return stat;
  const shared = registry
    .getDelveData()
    .affixes.some((a) => a.stat !== stat && a.label === def.label);
  return shared && def.unit === 'pct' ? `${def.label} %` : def.label;
}

/**
 * A material's name, as the Forge tab writes it: "Iron bar", "Magic flux", "Crit Chance II",
 * "Twin Fang essence", "Mana Dust", "Links".
 */
export function materialLabel(registry: DataRegistry, ref: MaterialRef): string {
  switch (ref.kind) {
    case 'metal':
      return `${registry.getCraftingData().metals.find((m) => m.id === ref.metal)?.name ?? ref.metal} bar`;
    case 'flux':
      return `${RARITY_LABEL[ref.grade]} flux`;
    case 'shard':
      return `${affixLabel(registry, ref.stat)} ${numeral(ref.tier)}`;
    case 'essence':
      return `${registry.getLegendary(ref.essence).name} essence`;
    case 'dust':
      return 'Mana Dust';
    case 'links':
      return 'Links';
  }
}

/** One line of a haul: what it is, its colour and how many. */
export interface HaulRow {
  key: string;
  /** A bar, flux or shard; an essence; a rune; or scrap, Mana Dust or Links. */
  group: 'material' | 'essence' | 'rune' | 'currency';
  name: string;
  color: string;
  count: number;
}

/**
 * A haul's (or a pouch's) entries above zero, grouped and in order: bars, flux, shards,
 * essences, runes, then scrap, Mana Dust and Links.
 */
export function haulRows(registry: DataRegistry, haul: MaterialsPouch & Partial<Haul>): HaulRow[] {
  const rows: HaulRow[] = [];
  const add = (ref: MaterialRef, count = 0, group: HaulRow['group'] = 'material') => {
    if (count > 0)
      rows.push({
        key: JSON.stringify(ref),
        group,
        name: materialLabel(registry, ref),
        color: materialColor(registry, ref),
        count,
      });
  };
  for (const metal of METAL_IDS) add({ kind: 'metal', metal }, haul.metals[metal]);
  for (const grade of FLUX_GRADES) add({ kind: 'flux', grade }, haul.flux[grade]);
  for (const [stat, tiers] of Object.entries(haul.shards))
    tiers?.forEach((n, i) => add({ kind: 'shard', stat: stat as HeroStatKey, tier: i + 1 }, n));
  for (const [essence, n] of Object.entries(haul.essences))
    add({ kind: 'essence', essence }, n, 'essence');
  for (const [id, tiers] of Object.entries(haul.runes ?? {})) {
    const def = registry.findRune(id);
    tiers.forEach((n, i) => {
      if (!def || n <= 0) return;
      const rune = { id, tier: (i + 1) as RuneTier };
      const name = runeName(registry, rune);
      rows.push({
        key: `rune:${id}:${rune.tier}`,
        group: 'rune',
        name,
        color: FAMILY_STYLE[def.family].color,
        count: n,
      });
    });
  }
  if (haul.scrap)
    rows.push({
      key: 'scrap',
      group: 'currency',
      name: 'Scrap',
      color: SCRAP_COLOR,
      count: haul.scrap,
    });
  add({ kind: 'dust' }, haul.dust, 'currency');
  add({ kind: 'links' }, haul.links, 'currency');
  return rows;
}

const total = (xs: (number | undefined)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

/** How many materials a pouch or a haul holds: bars, flux, shards and essences. */
export function materialCount(m: MaterialsPouch): number {
  return total([
    ...Object.values(m.metals),
    ...Object.values(m.flux),
    ...Object.values(m.shards).flat(),
    ...Object.values(m.essences),
  ]);
}

/** How many runes a rune pouch holds, every tier. */
export function runeCount(pouch: RunePouch): number {
  return total(Object.values(pouch).flat());
}
