import { makeCtx } from '../../src/arpg/combat.js';
import { directorTick } from '../../src/arpg/pack.js';
import { stepWorld } from '../../src/arpg/step.js';
import type { DataRegistry } from '../../src/data/registry.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity, Vec } from '../../src/types/arpg.js';
import type { DelveBalance } from '../../src/types/delve.js';
import { arena, bal, registry, STEP } from './arena.js';
import { onMap } from './maps.js';

/** The default data with every job of `delve.ai.pack` switched on, then `pack`'s changes. */
export function withPack(pack: Partial<DelveBalance['ai']['pack']>): DataRegistry {
  const p = bal.ai.pack;
  const on = {
    ...p,
    ring: { on: true },
    flank: { ...p.flank, on: true },
    cover: { ...p.cover, on: true },
    charge: { ...p.charge, on: true },
    ambush: { ...p.ambush, on: true },
  };
  const next = { ...bal, ai: { ...bal.ai, pack: { ...on, ...pack } } };
  return Object.assign(Object.create(registry) as DataRegistry, { getDelveBalance: () => next });
}

/** The default data with every job switched on. */
export const ON = withPack({});

/**
 * A walled floor (the fixture's 26 × 40 world, the hero at (13, 36), one room
 * 0 over it all) at `depth` with these walls, holding these foes: awake, in
 * room 0, at the base speed unless they say otherwise. The hero shrugs off
 * every blow and never attacks.
 */
export function packFloor(
  foes: Partial<MonsterEntity>[],
  depth = 2,
  walls: [number, number][] = [],
): ArpgWorld {
  const w = arena(
    foes.map((f) => ({ aggro: true, roomId: 0, speed: bal.monster.speed, ...f })),
    { noBasic: true, depth },
  );
  w.hero.hp = w.hero.stats.maxHp = 1e9;
  return onMap(w, walls);
}

/** One director pass on `w` now. */
export function pass(w: ArpgWorld, reg: DataRegistry = ON): void {
  w.director.nextAt = 0;
  directorTick(makeCtx(reg, w, []));
}

/** `w` stepped for `seconds` under `reg`, the hero steering `move`; every event. */
export function runWith(
  reg: DataRegistry,
  w: ArpgWorld,
  seconds: number,
  move: Vec = { x: 0, y: 0 },
): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++)
    events.push(...stepWorld(reg, w, { move }, STEP));
  return events;
}
