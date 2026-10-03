import { rollRuneDrop } from '../loot/runes.js';
import type { MonsterEntity } from '../types/arpg.js';
import type { SimCtx } from './combat.js';
import { snapToWalkable } from './grid.js';

/**
 * A slain foe's rune (see the runes spec), rolled on the world's own stream
 * (`world.runeRng`: the chance, the rune, its tier and where it lands), so
 * item drops, motes and orbs come out as they would without it. It bursts
 * onto the floor like loot, a `Drop` of kind 'rune', walked over to pick up.
 * `killMonster` calls it beside `dropLoot`, inside its `!world.sandbox` guard.
 */
export function dropRune(ctx: SimCtx, m: MonsterEntity): void {
  const { world, registry } = ctx;
  const rng = world.runeRng;
  const ctxDrop = { depth: world.depth, kind: m.kind, runes: world.door?.mods.runes ?? 1 };
  const rune = rollRuneDrop(registry, ctxDrop, rng);
  if (!rune) return;
  const angle = rng.next() * Math.PI * 2;
  const r = 0.6 + rng.next() * 0.9;
  const { x, y } = snapToWalkable(
    world.map,
    m.x + Math.cos(angle) * r,
    m.y + Math.sin(angle) * r,
    1,
  );
  const id = world.nextId++;
  world.drops.push({
    id,
    kind: 'rune',
    x,
    y,
    rune,
    amount: 1,
    born: world.t,
    vacuum: world.cleared,
    dead: false,
  });
  ctx.events.push({ kind: 'drop', dropId: id, x, y, dropKind: 'rune' });
}
