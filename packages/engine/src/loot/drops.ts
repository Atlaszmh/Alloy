import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { MonsterKind } from '../types/arpg.js';
import type { GearItem } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { RUNE_TIERS, type RuneRef, type RuneTier } from '../types/rune.js';
import { essenceAllowed } from '../arpg/material-drops.js';
import { generateItem, rollRarity } from './item-generator.js';

export interface DropContext {
  depth: number;
  kind: MonsterKind;
  /** The door's `gear`: multiplies an elite's gear chance (1 = normal). */
  gear: number;
  /** Added to an elite's gear chance (an elite den's `drops.den.gearBonus`). */
  gearBonus?: number;
  nextUid: number;
  /** The biome's mana; item affinities lean toward it. */
  biomeMana?: ManaType;
  /** The hero's pair, primary first (empty before the choice): item affinities lean toward it. */
  pair: ManaType[];
}

export interface DropResult {
  items: GearItem[];
  nextUid: number;
}

/** Round a fractional count up with probability equal to its fraction. */
export function stochasticRound(value: number, rng: SeededRNG): number {
  const whole = Math.floor(value);
  return whole + (rng.next() < value - whole ? 1 : 0);
}

/**
 * How many gear items a foe drops (see the crafting spec's drop tables): a
 * normal foe none, an elite one at (`drops.elite.gearChance` + `gearBonus`) ×
 * the door's `gear` (at most 1), a boss `drops.boss.gear`.
 */
function gearCount(registry: DataRegistry, ctx: DropContext, rng: SeededRNG): number {
  const { elite, boss } = registry.getDelveBalance().drops;
  if (ctx.kind === 'boss') return boss.gear;
  const chance = (elite.gearChance + (ctx.gearBonus ?? 0)) * ctx.gear;
  if (ctx.kind === 'elite') return rng.next() < Math.min(1, chance) ? 1 : 0;
  return 0;
}

/** Gear rarity's luck from depth and the foe's kind (Find no longer plays a part). */
export function dropLuck(registry: DataRegistry, ctx: Pick<DropContext, 'depth' | 'kind'>): number {
  const loot = registry.getDelveBalance().loot;
  const kindLuck = ctx.kind === 'boss' ? loot.bossLuck : ctx.kind === 'elite' ? loot.eliteLuck : 0;
  const depthLuck = Math.min(loot.maxDepthLuck, (ctx.depth - 1) * loot.luckPerDepth);
  return depthLuck + kindLuck;
}

/**
 * A slain foe's gear: an elite's at its chance, a boss's at least `loot.bossMinRarity` (no
 * `legendaryBoost`); epic at most where no essence may drop (`essenceAllowed`: legendaries are
 * mid to late game, see the tutorial spec), the roll's draws as before.
 */
export function rollEncounterDrops(registry: DataRegistry, ctx: DropContext, rng: SeededRNG): DropResult {
  const loot = registry.getDelveBalance().loot;
  const count = gearCount(registry, ctx, rng);
  const luck = dropLuck(registry, ctx);
  const ilvl = ctx.kind === 'boss' ? ctx.depth + 1 : ctx.depth;
  const minRarity = ctx.kind === 'boss' ? loot.bossMinRarity : undefined;

  let nextUid = ctx.nextUid;
  const items: GearItem[] = [];
  for (let i = 0; i < count; i++) {
    const rolled = rollRarity(registry, { luck, minRarity }, rng);
    const rarity = rolled === 'legendary' && !essenceAllowed(registry, ctx.depth) ? 'epic' : rolled;
    items.push(generateItem(registry, { uid: `g${nextUid++}`, ilvl, rarity, biomeMana: ctx.biomeMana, pair: ctx.pair }, rng));
  }
  return { items, nextUid };
}

/**
 * A rune's tier at `depth` (see the runes spec): the highest whose
 * `runes.tierDepths` entry the depth reaches, then one higher `runes.tierUp`
 * of the time, at most V. It draws once, whatever the depth.
 */
export function runeTierAt(registry: DataRegistry, depth: number, rng: SeededRNG): RuneTier {
  const { tierDepths, tierUp } = registry.getDelveBalance().runes;
  const reached = Math.max(1, tierDepths.filter((d) => depth >= d).length);
  const up = rng.next() < tierUp ? 1 : 0;
  return Math.min(RUNE_TIERS, reached + up) as RuneTier;
}

/**
 * A slain foe's rune, or null (see the runes spec): a boss drops one at
 * `runes.dropChance.boss`, a normal or elite foe at its kind's chance × the
 * door's `runes`, at most 1 (Find plays no part). The rune is uniform
 * over the data, its tier by depth (`runeTierAt`).
 */
export function rollRuneDrop(
  registry: DataRegistry,
  ctx: { depth: number; kind: MonsterKind; runes: number },
  rng: SeededRNG,
): RuneRef | null {
  const { dropChance } = registry.getDelveBalance().runes;
  const chance =
    ctx.kind === 'boss' ? dropChance.boss : Math.min(1, dropChance[ctx.kind] * ctx.runes);
  if (rng.next() >= chance) return null;
  const runes = registry.getRunes();
  const { id } = runes[rng.nextInt(0, runes.length - 1)];
  return { id, tier: runeTierAt(registry, ctx.depth, rng) };
}
