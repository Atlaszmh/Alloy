import type { DataRegistry } from '../data/registry.js';
import type { ArpgInput, ArpgWorld, Vec } from '../types/arpg.js';
import { makeCtx } from './combat.js';
import { dirTo, dist } from './geometry.js';
import { nearestMonster, slotReady } from './skills.js';

/**
 * A simple arena bot: walks to the nearest foe (keeping range with bolt
 * weapons), steps out of telegraphed slams, drinks at low life, grabs nearby
 * loot and casts whatever spell is ready. Drives the pacing tests.
 */
export function botInput(registry: DataRegistry, world: ArpgWorld): ArpgInput {
  const ctx = makeCtx(registry, world, []);
  const h = world.hero;
  const input: ArpgInput = { move: { x: 0, y: 0 } };

  if (h.hp < h.stats.maxHp * 0.4 && h.potions > 0) input.potion = true;

  // Step out of any telegraphed slam.
  for (const z of world.zones) {
    if (z.owner !== 'monster' || z.dead) continue;
    if (dist(h.x, h.y, z.x, z.y) < z.radius + h.radius + 0.6) {
      const away = dirTo(z.x, z.y, h.x, h.y);
      input.move = away.x === 0 && away.y === 0 ? { x: 1, y: 0 } : away;
      return input;
    }
  }

  const target = nearestMonster(ctx, h.x, h.y, 60);
  if (!target) {
    const drop = world.drops.find((d) => !d.dead);
    if (drop) input.move = dirTo(h.x, h.y, drop.x, drop.y);
    return input;
  }

  const gap = dist(h.x, h.y, target.x, target.y) - target.radius;
  const w = h.stats.weapon;
  let move: Vec = { x: 0, y: 0 };
  if (w.kind === 'melee') {
    if (gap > w.range * 0.8) move = dirTo(h.x, h.y, target.x, target.y);
  } else if (gap > w.range * 0.8) move = dirTo(h.x, h.y, target.x, target.y);
  else if (gap < 2.5) {
    const away = dirTo(target.x, target.y, h.x, h.y);
    move = away;
  }

  // Detour for loot when the coast is clear.
  const threat = nearestMonster(ctx, h.x, h.y, 4);
  if (!threat) {
    const item = world.drops.find((d) => !d.dead && d.kind === 'item' && dist(h.x, h.y, d.x, d.y) < 6);
    if (item) move = dirTo(h.x, h.y, item.x, item.y);
  }
  input.move = move;

  if (gap < 8) {
    for (let slot = 0; slot < h.skillSlots.length; slot++) {
      if (slotReady(ctx, slot)) {
        input.cast = slot;
        break;
      }
    }
  }
  return input;
}
