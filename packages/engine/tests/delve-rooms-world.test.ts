import { describe, it, expect } from 'vitest';
import { solid } from '../src/arpg/grid.js';
import { planFloor } from '../src/arpg/layout/generate.js';
import { footprints } from '../src/arpg/objects.js';
import { createFloorWorld } from '../src/arpg/world.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { CELL } from '../src/types/floor-map.js';
import type { DataRegistry } from '../src/data/registry.js';
import { bal, gear, registry } from './fixtures/arena.js';

// The furnished floor's world (see the room objects spec's "Footprints" and "Spawns"): its
// props and hazards stand where the furnisher put them, every foe spawns in an open 3 × 3 of
// its room outside every footprint, and a pack may hide in a room's foliage.

const world = (depth: number, seed: number, reg: DataRegistry = registry) =>
  createFloorWorld(reg, {
    depth,
    door: null,
    stats: computeHeroStats({ weapon: gear('fire') }, registry),
    chains: {},
    heroHpFrac: 1,
    potions: 3,
    phoenixAvailable: true,
    seed,
    layout: 'generated',
    loot: { nextUid: 1, find: 0, legendaryBoost: 1, patterns: [], dropsGiven: [], pair: [] },
  });
const SEEDS = Array.from({ length: 12 }, (_, i) => 7 + i * 4441);
const DEPTHS = [1, 4, 8, 12, 17, 23, 27];
/** A registry whose packs always hide where they can, or never. */
const hiding = (chance: number) => {
  const reg = createDefaultRegistry();
  reg.getDelveBalance().ai.pack.ambush.ambushChance = chance;
  return reg;
};
/** Whether the cell's whole 3 × 3 is foliage. */
const leafy = (w: ArpgWorld, x: number, y: number) => {
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++)
      if (w.map.cells[(Math.floor(y) + j) * w.width + Math.floor(x) + i] !== CELL.foliage)
        return false;
  return true;
};

describe('a furnished floor', () => {
  it("stands its furnishing's props and hazards, unbroken and ready, with ids of their own", () => {
    const defs = registry.getSetPieces();
    for (const seed of SEEDS.slice(0, 4))
      for (const depth of DEPTHS) {
        const w = world(depth, seed);
        const { furnishing } = planFloor(
          registry,
          seed,
          depth,
          registry.getBiomeForDepth(depth),
          null,
        );
        expect(w.props.map((p) => ({ kind: p.kind, x: p.x, y: p.y }))).toEqual(furnishing.props);
        expect(
          w.hazards.map((h) => ({ kind: h.kind, element: h.element, x: h.x, y: h.y })),
        ).toEqual(furnishing.hazards);
        for (const p of w.props)
          expect(p).toMatchObject({
            type: 'prop',
            radius: defs.props.find((d) => d.id === p.kind)!.radius,
            life: bal.terrain.propLife,
            dead: false,
          });
        for (const h of w.hazards) {
          const def = defs.hazards.find((d) => d.id === h.kind)!;
          expect(h).toMatchObject({
            type: 'hazard',
            radius: def.radius,
            burst: def.burst,
            state: 'ready',
            until: 0,
          });
        }
        const ids = [...w.props, ...w.hazards, ...w.monsters].map((o) => o.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
  });

  it('spawns every foe on a cell in an open 3 × 3 of its room, outside every footprint', () => {
    const bad: string[] = [];
    for (const seed of SEEDS)
      for (const depth of DEPTHS) {
        const w = world(depth, seed);
        const feet = footprints(w);
        const free = (x: number, y: number) => !solid(w.map, x, y) && !feet.has(y * w.width + x);
        for (const m of w.monsters) {
          if (m.kind === 'boss') continue;
          const cx = Math.floor(m.x);
          const cy = Math.floor(m.y);
          const r = w.map.rooms[m.roomId!].rect;
          let open = false;
          for (let j = cy - 2; j <= cy && !open; j++)
            for (let i = cx - 2; i <= cx && !open; i++) {
              open = true;
              for (let b = j; b < j + 3; b++) for (let a = i; a < i + 3; a++) open &&= free(a, b);
            }
          const inside = cx >= r.x && cy >= r.y && cx < r.x + r.w && cy < r.y + r.h;
          if (!open || !inside || !free(cx, cy))
            bad.push(`seed ${seed} depth ${depth} foe ${m.id} at ${cx},${cy}`);
        }
      }
    expect(bad.slice(0, 5), `${bad.length} foes`).toEqual([]);
  });

  it('hides packs in foliage at ambushChance, asleep, each foe a whole 3 × 3 of it deep', () => {
    // The Mines', the Frostvault's, the Quarry's and the Crypts' depths (the Foundry and the
    // Core grow none).
    const quarry = [3, 8, 16, 17, 18, 19, 23];
    let hidden = 0;
    for (const seed of SEEDS)
      for (const depth of quarry) {
        const w = world(depth, seed, hiding(1));
        const packs = new Map<number, boolean[]>();
        for (const m of w.monsters) packs.set(m.packId, [...(packs.get(m.packId) ?? []), m.ambush]);
        for (const flags of packs.values()) expect(new Set(flags).size).toBe(1);
        for (const m of w.monsters.filter((m) => m.ambush)) {
          hidden++;
          expect(leafy(w, m.x, m.y), `seed ${seed} depth ${depth} foe ${m.id}`).toBe(true);
          expect(m.aggro).toBe(false);
        }
        // A room with such foliage hides every pack in it.
        for (const m of w.monsters.filter((m) => !m.ambush && m.kind !== 'boss')) {
          const r = w.map.rooms[m.roomId!].rect;
          let room = false;
          for (let y = r.y + 1; y < r.y + r.h - 1 && !room; y++)
            for (let x = r.x + 1; x < r.x + r.w - 1 && !room; x++)
              room = leafy(w, x + 0.5, y + 0.5);
          expect(room, `seed ${seed} depth ${depth} foe ${m.id}`).toBe(false);
        }
      }
    expect(hidden).toBeGreaterThan(0);
    for (const seed of SEEDS.slice(0, 4))
      for (const depth of [...quarry, 13, 28]) {
        expect(world(depth, seed, hiding(0)).monsters.some((m) => m.ambush)).toBe(false);
        if (!quarry.includes(depth))
          expect(world(depth, seed, hiding(1)).monsters.some((m) => m.ambush)).toBe(false);
      }
  });

  it('builds the same world for the same seed', () => {
    const strip = (w: ArpgWorld) => ({
      map: w.map,
      monsters: w.monsters,
      props: w.props,
      hazards: w.hazards,
    });
    expect(strip(world(17, 99))).toEqual(strip(world(17, 99)));
  });
});
