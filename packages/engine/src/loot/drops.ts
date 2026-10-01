import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { MonsterKind } from '../types/arpg.js';
import type { GearItem, Rarity } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { RUNE_TIERS, type RuneRef, type RuneTier } from '../types/rune.js';
import { generateItem, rollRarity } from './item-generator.js';

export interface DropContext {
  depth: number;
  kind: MonsterKind;
  /** Total magic find in percentage points (gear + door). */
  magicFind: number;
  pity: number;
  /** Door drop multiplier (1 = normal). */
  dropMult: number;
  legendaryBoost: number;
  /** First boss kill ever: guarantee the hook legendary. */
  forceLegendary: boolean;
  nextUid: number;
  /** The biome's mana; item affinities lean toward it. */
  biomeMana?: ManaType;
  /** The hero's pair, primary first (empty before the choice): item affinities lean toward it. */
  pair: ManaType[];
}

export interface DropResult {
  items: GearItem[];
  pity: number;
  nextUid: number;
}

/** Round a fractional count up with probability equal to its fraction. */
function stochasticRound(value: number, rng: SeededRNG): number {
  const whole = Math.floor(value);
  return whole + (rng.next() < value - whole ? 1 : 0);
}

function dropCount(registry: DataRegistry, ctx: DropContext, rng: SeededRNG): number {
  const loot = registry.getDelveBalance().loot;
  switch (ctx.kind) {
    case 'normal': {
      let n = rng.next() < Math.min(1, loot.normalDropChance * ctx.dropMult) ? 1 : 0;
      if (rng.next() < Math.min(1, loot.extraDropChance * ctx.dropMult)) n++;
      return n;
    }
    case 'elite':
      return stochasticRound(rng.nextInt(loot.eliteDrops[0], loot.eliteDrops[1]) * ctx.dropMult, rng);
    case 'boss':
      return Math.max(1, stochasticRound(rng.nextInt(loot.bossDrops[0], loot.bossDrops[1]) * ctx.dropMult, rng));
  }
}

/** Luck from magic find, depth, and monster kind. */
export function dropLuck(registry: DataRegistry, ctx: Pick<DropContext, 'depth' | 'kind' | 'magicFind'>): number {
  const loot = registry.getDelveBalance().loot;
  const kindLuck = ctx.kind === 'boss' ? loot.bossLuck : ctx.kind === 'elite' ? loot.eliteLuck : 0;
  const depthLuck = Math.min(loot.maxDepthLuck, (ctx.depth - 1) * loot.luckPerDepth);
  return ctx.magicFind / 100 + depthLuck + kindLuck;
}

export function rollEncounterDrops(registry: DataRegistry, ctx: DropContext, rng: SeededRNG): DropResult {
  const loot = registry.getDelveBalance().loot;
  const count = dropCount(registry, ctx, rng);
  const luck = dropLuck(registry, ctx);
  const ilvl = ctx.kind === 'boss' ? ctx.depth + 1 : ctx.depth;

  let pity = ctx.pity;
  let nextUid = ctx.nextUid;
  const items: GearItem[] = [];
  for (let i = 0; i < count; i++) {
    let rarity: Rarity;
    if (i === 0 && ctx.forceLegendary) {
      rarity = 'legendary';
    } else {
      const minRarity = ctx.kind === 'boss' && i === 0 ? loot.bossMinRarity : undefined;
      rarity = rollRarity(registry, { luck, pity, minRarity, legendaryBoost: ctx.legendaryBoost }, rng);
    }
    pity = rarity === 'legendary' ? 0 : pity + 1;
    items.push(generateItem(registry, { uid: `g${nextUid++}`, ilvl, rarity, biomeMana: ctx.biomeMana, pair: ctx.pair }, rng));
  }
  return { items, pity, nextUid };
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
 * door's `dropMult`, at most 1 (magic find plays no part). The rune is uniform
 * over the data, its tier by depth (`runeTierAt`).
 */
export function rollRuneDrop(
  registry: DataRegistry,
  ctx: { depth: number; kind: MonsterKind; dropMult: number },
  rng: SeededRNG,
): RuneRef | null {
  const { dropChance } = registry.getDelveBalance().runes;
  const chance =
    ctx.kind === 'boss' ? dropChance.boss : Math.min(1, dropChance[ctx.kind] * ctx.dropMult);
  if (rng.next() >= chance) return null;
  const runes = registry.getRunes();
  const { id } = runes[rng.nextInt(0, runes.length - 1)];
  return { id, tier: runeTierAt(registry, ctx.depth, rng) };
}
