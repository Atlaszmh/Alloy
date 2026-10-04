import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as engine from '../src/index.js';
import { arena, dummy, registry, run, STEP } from './fixtures/arena.js';
import type { Vec } from '../src/types/arpg.js';

// See the room objects spec's phase A: each area's hooks are typed stubs in its own file, and
// the sim calls them from their places: the ticks in order, the ground under every walk but a
// charger's dash, a wall slam after each knockback step, and the objects' push-out.

const hooks = vi.hoisted(() => ({
  factor: 1,
  log: [] as string[],
  slams: [] as { id: number; from: Vec; want: Vec }[],
}));

vi.mock('../src/arpg/terrain.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/arpg/terrain.js')>()),
  groundSpeed: () => hooks.factor,
  terrainTick: () => hooks.log.push('terrain'),
  wallSlam: (_ctx: unknown, m: { id: number }, from: Vec, want: Vec) =>
    hooks.slams.push({ id: m.id, from, want }),
}));
vi.mock('../src/arpg/objects.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/arpg/objects.js')>()),
  objectsTick: () => hooks.log.push('objects'),
  objectsSeparate: () => hooks.log.push('separate'),
}));
vi.mock('../src/arpg/pack.js', () => ({ directorTick: () => hooks.log.push('director') }));

beforeEach(() => {
  hooks.factor = 1;
  hooks.log = [];
  hooks.slams = [];
});

describe('the stubs', () => {
  it('are inert until their areas fill them', async () => {
    const terrain =
      await vi.importActual<typeof import('../src/arpg/terrain.js')>('../src/arpg/terrain.js');
    const pack = await vi.importActual<typeof import('../src/arpg/pack.js')>('../src/arpg/pack.js');
    const w = arena([]);
    const ctx = engine.makeCtx(registry, w, []);
    expect([terrain.groundSpeed(w, w.hero), terrain.groundSpeed(w, w.hero, true)]).toEqual([1, 1]);
    terrain.terrainTick(ctx);
    terrain.wallSlam(ctx, w.hero as never, w.hero, { x: 1, y: 0 });
    terrain.hitStructures(ctx, w.hero, 3, 50);
    pack.directorTick(ctx);
    expect(ctx.events).toEqual([]);
    const plan = engine.furnishFloor(registry, w.map, 1, 1, registry.getBiomeForDepth(1));
    expect(plan).toEqual({ props: [], hazards: [] });
  });

  it("every area's op and the contract's names are exported", () => {
    const names = [
      ...['solid', 'solidCode', 'perceives', 'setDoor', 'depthGrowth', 'furnishFloor'],
      ...['footprint', 'footprints', 'objectsIn', 'objectsOnBeam', 'objectsTouching'],
      ...['hitObject', 'objectsTick', 'objectsSeparate', 'groundSpeed', 'wallSlam'],
      ...['hitStructures', 'terrainTick', 'directorTick', 'setPiecesProblems'],
      ...['SetPiecesDataSchema', 'CELL', 'LOOK_IDS', 'PIECE_TAGS', 'PACK_JOBS'],
    ];
    expect(names.filter((n) => !(n in engine))).toEqual([]);
  });
});

describe('the hooks', () => {
  it('run each tick in order: objects after the zones, terrain and the director before the foes, the push-out last', () => {
    run(arena([]), STEP);
    expect(hooks.log).toEqual(['objects', 'terrain', 'director', 'separate']);
  });

  it("the ground slows the hero's walk and a foe's, never a charger's dash", () => {
    const walk = (factor: number) => {
      hooks.factor = factor;
      const w = arena([{ aggro: true }, { x: 5, y: 10, aggro: true }], { noBasic: true });
      Object.assign(w.monsters[1], {
        ai: 'charger',
        chargeUntil: 1e9,
        chargeDir: { x: 0, y: -1 },
        chargeHit: true,
      });
      run(w, STEP, { x: 1, y: 0 });
      return [w.hero.x - 13, w.monsters[0].y - 20, 10 - w.monsters[1].y];
    };
    const [hero, foe, dash] = walk(1);
    expect(walk(0.5)).toEqual([hero / 2, foe / 2, dash].map((v) => expect.closeTo(v, 4)));
    expect(Math.min(hero, foe, dash)).toBeGreaterThan(0);
  });

  it('a knockback step asks whether a wall slams its foe', () => {
    const w = arena([dummy(13, 20, { kbx: 10 })]);
    run(w, STEP);
    expect(hooks.slams).toEqual([
      { id: w.monsters[0].id, from: { x: 13, y: 20 }, want: { x: 10 * STEP, y: 0 } },
    ]);
  });
});
