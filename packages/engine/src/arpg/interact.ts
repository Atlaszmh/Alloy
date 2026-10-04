import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { ArpgWorld, MonsterEntity, MonsterKind } from '../types/arpg.js';
import type { MaterialRef } from '../types/crafting.js';
import type { Interactable, ShrineDef } from '../types/floor-map.js';
import { applyBuffs, manaPool } from '../delve/hero-stats.js';
import { shardTiersOf } from '../loot/materials.js';
import type { SimCtx } from './combat.js';
import { dist } from './geometry.js';
import { snapToWalkable } from './grid.js';
import { offFootprints } from './objects-base.js';
import { essenceAllowed, rollMaterialDrops } from './material-drops.js';
import { tutorialExitHeld } from './tutorial.js';
import { tutorialChest } from './tutorial-floor.js';

/**
 * Using what the rooms hold, and the floor's flow (see the floor maps spec's
 * "Interacting, special rooms and the exit"). Each hook is a no-op on the open room.
 */

/** How far the hero may drift (a separation push, a wall's push-out) before a prayer counts as moved. */
const PRAYER_SLIP = 0.05;

/** Each kind's name in its prompt (a shrine's is its own, with its blessing); the verb is the client's. */
const NAMES = { chest: 'Chest', alcove: 'Anvil', gate: 'Exit gate' };

/** The alcove each world's hero last opened (`alcoveOpen`): `takeAlcove` acts on it. */
const opened = new WeakMap<ArpgWorld, string>();

/** The id of the alcove last opened on `world`, or null. */
export function openedAlcove(world: ArpgWorld): string | null {
  return opened.get(world) ?? null;
}

/** The interactable `id` on the world's map. */
function interactableOf(world: ArpgWorld, id: string): Interactable | undefined {
  return world.map.rooms.find((r) => r.interactable?.id === id)?.interactable;
}

function shrineOf(registry: DataRegistry, it: Interactable): ShrineDef | undefined {
  return registry.getDelveData().shrines.find((s) => s.id === it.shrine);
}

/** A boss of the floor still stands, or the guided start holds it (see the tutorial spec): its gate stays shut. */
function gateShut(world: ArpgWorld): boolean {
  return world.monsters.some((m) => !m.dead && m.kind === 'boss') || tutorialExitHeld(world);
}

/** The nearest interactable the hero can use from where it stands, if any. */
function inReach(world: ArpgWorld, radius: number): Interactable | null {
  const h = world.hero;
  let best: Interactable | null = null;
  let bestD = radius;
  for (const room of world.map.rooms) {
    const it = room.interactable;
    if (!it || it.used || (it.kind === 'gate' && gateShut(world))) continue;
    const d = dist(h.x, h.y, it.x, it.y);
    if (d <= bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

/** One use a dive: on the world's interactable and, for the bank, in `pending.used` (a `used` event). */
function use(ctx: SimCtx, it: Interactable): void {
  it.used = true;
  ctx.world.pending.used.push(it.id);
  ctx.events.push({ kind: 'used', id: it.id, interactable: it.kind });
}

/**
 * The interactable in reach (`ai.interactRadius`): its `interactPrompt` each
 * step, and an interact press (`ArpgWorld.queuedInteract`) acting on it: a
 * chest bursts (`drops.vault`); a shrine starts a prayer (`channel`,
 * `ai.shrineChannel`) that a move, a dodge or a hit breaks and that blesses
 * at its end (`applyShrine`); an alcove opens (`alcoveOpen`); the gate asks
 * to leave (`exitRequest`), shut on a boss floor while the boss stands. A
 * press with nothing in reach is dropped.
 */
export function interactTick(ctx: SimCtx): void {
  const { world, bal, registry, events } = ctx;
  const pressed = world.queuedInteract;
  world.queuedInteract = false;
  if (world.map.open) return;
  const h = world.hero;
  const t = world.t;

  const prayer = world.channel;
  if (prayer) {
    const broke =
      dist(h.x, h.y, prayer.x, prayer.y) > PRAYER_SLIP ||
      (!!h.dodge && t < h.dodge.until) ||
      h.lastHitAt >= prayer.start;
    if (broke) world.channel = null;
    else if (t >= prayer.until) {
      world.channel = null;
      const it = interactableOf(world, prayer.id);
      const shrine = it && shrineOf(registry, it);
      if (it && !it.used && shrine) {
        use(ctx, it);
        applyShrine(registry, world, shrine);
      }
    }
    return;
  }

  const it = inReach(world, bal.ai.interactRadius);
  if (!it) return;
  const shrine = it.kind === 'shrine' ? shrineOf(registry, it) : undefined;
  const text =
    it.kind === 'shrine' ? (shrine ? `${shrine.name}: ${shrine.text}` : 'Shrine') : NAMES[it.kind];
  events.push({ kind: 'interactPrompt', id: it.id, interactable: it.kind, text });
  if (!pressed) return;
  switch (it.kind) {
    case 'chest':
      use(ctx, it);
      openChest(ctx, it);
      break;
    case 'shrine':
      world.channel = { id: it.id, x: h.x, y: h.y, start: t, until: t + bal.ai.shrineChannel };
      break;
    case 'alcove':
      opened.set(world, it.id);
      events.push({ kind: 'alcoveOpen', id: it.id });
      break;
    case 'gate':
      events.push({
        kind: 'exitRequest',
        roomsUnexplored: world.map.rooms.filter((r) => !r.revealed).length,
      });
      break;
  }
}

/**
 * A vault chest's haul (`drops.vault`): flux and shards by the floor's depth,
 * the door and Find, the shards `shardTierUp` tiers up, and an essence at
 * `essenceChance` × the door's `essence` × Lucky Charm's boost; never gear.
 */
export function rollVault(
  registry: DataRegistry,
  world: ArpgWorld,
  rng: SeededRNG,
): { material: MaterialRef; amount: number }[] {
  const vault = registry.getDelveBalance().drops.vault;
  const loot = world.loot;
  // ponytail: rolls the vault's table through a foe's roll (`drops[kind]` reads `drops.vault`);
  // give `rollMaterialDrops` a table argument if a third caller ever needs this.
  const { materials } = rollMaterialDrops(
    registry,
    {
      depth: world.depth,
      kind: 'vault' as unknown as MonsterKind,
      biomeId: world.biomeId,
      biomeMana: world.element,
      door: world.door,
      find: loot.find,
      legendaryBoost: loot.legendaryBoost,
      patterns: loot.patterns,
    },
    rng,
  );
  const haul = materials.map(({ material, amount }) =>
    material.kind === 'shard'
      ? {
          material: {
            ...material,
            tier: Math.min(
              shardTiersOf(registry, material.stat).length,
              material.tier + vault.shardTierUp,
            ),
          },
          amount,
        }
      : { material, amount },
  );
  const essence = vault.essenceChance * (world.door?.mods.essence ?? 1) * loot.legendaryBoost;
  if (rng.next() < Math.min(1, essence) && essenceAllowed(registry, world.depth)) {
    const legendaries = registry.getDelveData().legendaries;
    const id = legendaries[rng.nextInt(0, legendaries.length - 1)].id;
    haul.push({ material: { kind: 'essence', essence: id }, amount: 1 });
  }
  return haul;
}

/** The chest bursts its haul around it, on `world.materialRng` (a hand-built floor's: its set drops). */
function openChest(ctx: SimCtx, it: Interactable): void {
  if (tutorialChest(ctx, it)) return;
  const { world, registry } = ctx;
  const rng = world.materialRng;
  for (const { material, amount } of rollVault(registry, world, rng)) {
    const angle = rng.next() * Math.PI * 2;
    const r = 0.6 + rng.next() * 0.9;
    const at = snapToWalkable(world.map, it.x + Math.cos(angle) * r, it.y + Math.sin(angle) * r, 1);
    // Off every prop's and hazard's footprint (see the room objects spec).
    const { x, y } = offFootprints(world, it, at);
    const id = world.nextId++;
    world.drops.push({
      id,
      kind: 'material',
      x,
      y,
      material,
      amount,
      born: world.t,
      vacuum: false,
      dead: false,
    });
    ctx.events.push({ kind: 'drop', dropId: id, x, y, dropKind: 'material' });
  }
}

/**
 * A shrine's blessing on the world's hero (`interactTick` records the use): a
 * potion refill fills the flasks; its Find goes on `world.loot.find`; the rest
 * is a blessing (none for a refill alone). A floor blessing goes on
 * `floorBuffs`; a dive blessing on `diveBuffs` and `baseStats`, and into
 * `pending.diveBuffs` for the bank. The stats are `applyBuffs` over
 * `baseStats` and the pool resizes in place.
 */
export function applyShrine(registry: DataRegistry, world: ArpgWorld, shrine: ShrineDef): void {
  const h = world.hero;
  const { effect } = shrine;
  if (effect.potions) h.potions = registry.getDelveBalance().dive.maxPotions;
  world.loot.find += effect.find ?? 0;
  if (Object.keys(effect).every((k) => k === 'potions')) return;
  const buff = { shrine: shrine.id, effect };
  if (shrine.duration === 'dive') {
    h.diveBuffs.push(buff);
    world.pending.diveBuffs.push(buff);
    h.baseStats = applyBuffs(h.baseStats, [buff]);
  } else h.floorBuffs.push(buff);
  h.stats = applyBuffs(h.baseStats, h.floorBuffs);
  const pool = manaPool(h.stats, registry);
  h.manaMax = pool.max;
  h.manaRegen = pool.regen;
  h.mana = Math.min(h.mana, pool.max);
}

/** Take the exit: `world.exited` (the client after its confirm, the bot at once). */
export function exitFloor(world: ArpgWorld): void {
  world.exited = true;
}

/**
 * `killMonster`'s room hook: when a room's last foe dies, the room is cleared
 * (`roomCleared`) and its foes' drops are pulled to the hero (`ai.roomVacuum`).
 */
export function onMonsterKilled(ctx: SimCtx, m: MonsterEntity): void {
  const { world, bal, events } = ctx;
  if (m.roomId === null || world.monsters.some((o) => !o.dead && o.roomId === m.roomId)) return;
  const room = world.map.rooms.find((r) => r.id === m.roomId);
  if (!room || room.cleared) return;
  room.cleared = true;
  if (bal.ai.roomVacuum) for (const d of world.drops) if (d.roomId === m.roomId) d.vacuum = true;
  events.push({ kind: 'roomCleared', roomId: room.id });
}
