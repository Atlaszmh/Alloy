import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { MonsterKind } from '../types/delve.js';
import type { GearItem, Rarity } from '../types/gear.js';
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
  return ctx.magicFind / 100 + (ctx.depth - 1) * loot.luckPerDepth + kindLuck;
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
    items.push(generateItem(registry, { uid: `g${nextUid++}`, ilvl, rarity }, rng));
  }
  return { items, pity, nextUid };
}
