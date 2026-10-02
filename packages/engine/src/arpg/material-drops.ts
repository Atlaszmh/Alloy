import type { DataRegistry } from '../data/registry.js';
import { weightedPick } from '../loot/item-generator.js';
import { metalAt, shardTiersOf } from '../loot/materials.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { Drop, MonsterEntity, MonsterKind } from '../types/arpg.js';
import {
  FLUX_GRADES,
  type DropEntry,
  type DropsBalance,
  type MaterialRef,
  type MetalId,
} from '../types/crafting.js';
import type { DoorDef } from '../types/delve.js';
import type { ManaType } from '../types/mana.js';
import type { SimCtx } from './combat.js';

/**
 * A slain foe's materials (see the crafting spec's drop tables): the rolls
 * (`rollMaterialDrops`, pure) and the pickups that burst onto the floor
 * (`dropMaterials`), all on the world's own stream.
 */

/** What a foe's material rolls read: the floor, the door, the hero's Find and what it knows. */
export interface MaterialDropContext {
  depth: number;
  kind: MonsterKind;
  biomeId: string;
  /** The biome's element: its `*Power` and `*Attune` shards weigh `drops.biomeElementWeight`. */
  biomeMana: ManaType;
  /** The door taken into the floor (its multipliers and shard leanings), or null. */
  door: DoorDef | null;
  /** Total Find in percentage points (gear + the door's `find`). */
  find: number;
  /** Lucky Charm's: multiplies the essence chance. */
  legendaryBoost: number;
  /** The first boss's guarantee holds: a boss drops a fitting essence and an epic flux. */
  firstEssence: boolean;
  /** The patterns the hero knows: a pattern drop is one it doesn't. */
  patterns: string[];
}

export interface MaterialDrops {
  /** One per pickup: a bar, flux or shard each; Mana Dust and Links one pickup of their count. */
  materials: { material: MaterialRef; amount: number }[];
  /** A pattern the hero doesn't know, or null. */
  pattern: string | null;
}

/** The bar a floor at `depth` drops: its item level's metal, the next one up at `drops.metalUpChance`. */
function rollMetal(registry: DataRegistry, depth: number, rng: SeededRNG): MetalId {
  const metals = registry.getCraftingData().metals;
  const at = metals.indexOf(metalAt(registry, depth));
  const up = rng.next() < registry.getDelveBalance().drops.metalUpChance ? 1 : 0;
  return metals[Math.min(metals.length - 1, at + up)].id;
}

/**
 * A tier (1 up) a floor at `depth` drops: one of those `depths` reach (at most
 * `max`), weighted by `drops.tierWeights`, then one up at chance `up`, at most `max`.
 */
function rollTier(
  registry: DataRegistry,
  depths: number[],
  depth: number,
  max: number,
  up: number,
  rng: SeededRNG,
): number {
  const { tierWeights } = registry.getDelveBalance().drops;
  const reached = Math.min(max, Math.max(1, depths.filter((d) => depth >= d).length));
  const tiers = Array.from({ length: reached }, (_, i) => i + 1);
  const tier = weightedPick(tiers, (t) => tierWeights[t - 1] ?? 0, rng);
  return Math.min(max, tier + (rng.next() < up ? 1 : 0));
}

/** A shard: its affix by weight × the biome's and the door's family leanings (× the biome element's), its tier by depth. */
function rollShard(
  registry: DataRegistry,
  ctx: MaterialDropContext,
  up: number,
  rng: SeededRNG,
): MaterialRef {
  const drops = registry.getDelveBalance().drops;
  const { families } = registry.getCraftingData();
  const biome = drops.biomeShardWeights[ctx.biomeId] ?? {};
  const door = (ctx.door && drops.doors[ctx.door.id]) ?? {};
  const own: string[] = [`${ctx.biomeMana}Power`, `${ctx.biomeMana}Attune`];
  const affix = weightedPick(
    registry.getDelveData().affixes,
    (a) =>
      a.weight *
      (biome[families[a.stat]] ?? 1) *
      (door[families[a.stat]] ?? 1) *
      (own.includes(a.stat) ? drops.biomeElementWeight : 1),
    rng,
  );
  const max = shardTiersOf(registry, affix.stat).length;
  const tier = rollTier(registry, drops.shardTierDepths, ctx.depth, max, up, rng);
  return { kind: 'shard', stat: affix.stat, tier };
}

/**
 * A slain foe's materials by its kind's table (`balance.json → delve.drops`):
 * each entry drops at its chance × the door's `materials` (flux × its `flux`
 * too), at most 1, then a uniform count. Bars are the floor's metal; flux
 * grades and shard tiers come by depth (`fluxGradeDepths`, `shardTierDepths`),
 * one up at Find's chance (`drops.find`) or the door's `shardTier`. A boss
 * drops an essence at `essenceChance` × the door's `essence` × Lucky Charm's
 * boost, or, while the first boss's guarantee holds, one whose legendary fits a
 * known pattern's slot and an epic flux. Elites and bosses may drop a pattern
 * the hero doesn't know (`patternChance`).
 */
export function rollMaterialDrops(
  registry: DataRegistry,
  ctx: MaterialDropContext,
  rng: SeededRNG,
): MaterialDrops {
  const drops = registry.getDelveBalance().drops;
  const mods = ctx.door?.mods ?? {};
  // Every row a kind's table may hold: one it lacks never drops.
  const table: Partial<DropsBalance['elite'] & DropsBalance['boss']> = drops[ctx.kind];
  const count = (e: DropEntry | undefined, mult = 1): number =>
    e && rng.next() < Math.min(1, e.chance * (mods.materials ?? 1) * mult)
      ? rng.nextInt(e.count[0], e.count[1])
      : 0;
  const findUp = Math.min(drops.find.cap, (ctx.find / 100) * drops.find.perPoint);
  const up = 1 - (1 - findUp) * (1 - (mods.shardTier ?? 0));
  const materials: MaterialDrops['materials'] = [];
  const one = (material: MaterialRef) => materials.push({ material, amount: 1 });

  for (let n = count(table.bars); n > 0; n--)
    one({ kind: 'metal', metal: rollMetal(registry, ctx.depth, rng) });
  for (let n = count(table.flux, mods.flux ?? 1); n > 0; n--) {
    const grade = rollTier(registry, drops.fluxGradeDepths, ctx.depth, FLUX_GRADES.length, up, rng);
    one({ kind: 'flux', grade: FLUX_GRADES[grade - 1] });
  }
  for (let n = count(table.shards); n > 0; n--) one(rollShard(registry, ctx, up, rng));
  const dust = count(table.dust);
  if (dust > 0) materials.push({ material: { kind: 'dust' }, amount: dust });
  const links = count(table.links);
  if (links > 0) materials.push({ material: { kind: 'links' }, amount: links });

  if (ctx.kind === 'boss') {
    const legendaries = registry.getDelveData().legendaries;
    if (ctx.firstEssence) {
      const slots = registry
        .getDelveData()
        .bases.filter((b) => ctx.patterns.includes(b.id))
        .map((b) => b.slot);
      const fits = legendaries.filter((l) => l.slots.some((s) => slots.includes(s)));
      const pool = fits.length > 0 ? fits : legendaries;
      one({ kind: 'essence', essence: pool[rng.nextInt(0, pool.length - 1)].id });
      one({ kind: 'flux', grade: 'epic' });
    } else {
      const chance = (table.essenceChance ?? 0) * (mods.essence ?? 1) * ctx.legendaryBoost;
      if (rng.next() < Math.min(1, chance))
        one({ kind: 'essence', essence: legendaries[rng.nextInt(0, legendaries.length - 1)].id });
    }
  }

  let pattern: string | null = null;
  if (table.patternChance !== undefined && rng.next() < table.patternChance) {
    const unknown = registry.getDelveData().bases.filter((b) => !ctx.patterns.includes(b.id));
    if (unknown.length > 0) pattern = unknown[rng.nextInt(0, unknown.length - 1)].id;
  }
  return { materials, pattern };
}

/**
 * A slain foe's materials, scrap and pattern burst onto the floor on
 * `world.materialRng` (so gear, rune, orb and mote rolls are untouched): its
 * kill scrap split into `drops.scrapPickups[kind]` pickups (each at least 1),
 * every material and the pattern their own. A boss that takes the first
 * essence's guarantee clears it for the floor; a dropped pattern won't drop
 * again this floor, nor any from a foe that already gave gear or a pattern
 * this dive (`given`: a replayed floor; see `LootContext.dropsGiven`).
 * `killMonster` calls it inside its `!world.sandbox` guard.
 */
export function dropMaterials(ctx: SimCtx, m: MonsterEntity, scrap: number, given = false): void {
  const { world, registry } = ctx;
  const rng = world.materialRng;
  const loot = world.loot;
  const firstEssence = m.kind === 'boss' && loot.firstEssence;
  const rolled = rollMaterialDrops(
    registry,
    {
      depth: world.depth,
      kind: m.kind,
      biomeId: world.biomeId,
      biomeMana: world.element,
      door: world.door,
      find: loot.find,
      legendaryBoost: loot.legendaryBoost,
      firstEssence,
      patterns: loot.patterns,
    },
    rng,
  );
  if (firstEssence) loot.firstEssence = false;

  const spawn = (extra: Pick<Drop, 'kind' | 'amount' | 'material' | 'pattern'>) => {
    const angle = rng.next() * Math.PI * 2;
    const r = 0.6 + rng.next() * 0.9;
    const x = Math.max(1, Math.min(world.width - 1, m.x + Math.cos(angle) * r));
    const y = Math.max(1, Math.min(world.height - 1, m.y + Math.sin(angle) * r));
    const id = world.nextId++;
    world.drops.push({ id, x, y, ...extra, born: world.t, vacuum: world.cleared, dead: false });
    ctx.events.push({ kind: 'drop', dropId: id, x, y, dropKind: extra.kind });
  };

  const pieces = Math.min(registry.getDelveBalance().drops.scrapPickups[m.kind], scrap);
  for (let i = 0; i < pieces; i++) {
    const amount = Math.floor(scrap / pieces) + (i < scrap % pieces ? 1 : 0);
    spawn({ kind: 'scrap', amount });
  }
  for (const { material, amount } of rolled.materials)
    spawn({ kind: 'material', amount, material });
  if (rolled.pattern && !given) {
    if (!loot.dropsGiven.includes(m.id)) loot.dropsGiven.push(m.id);
    loot.patterns = [...loot.patterns, rolled.pattern];
    spawn({ kind: 'pattern', amount: 1, pattern: rolled.pattern });
  }
}
