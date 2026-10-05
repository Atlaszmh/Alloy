import { describe, it, expect, vi, beforeEach } from 'vitest';
import { burstShot, landBlow } from '../src/arpg/basic.js';
import { makeCtx } from '../src/arpg/combat.js';
import { executeForm } from '../src/arpg/abilities/forms.js';
import { impact } from '../src/arpg/abilities/impact.js';
import type { ObjectHitSource, RoomObject } from '../src/arpg/objects.js';
import type { ArpgWorld, PropEntity, Projectile, Vec } from '../src/types/arpg.js';
import { arena, dummy, gear, press, registry, run, STEP } from './fixtures/arena.js';
import { onMap, WALL_30 } from './fixtures/maps.js';

// See the room objects spec: each hit site tests its own shape against the props and hazards it
// reaches and calls `hitObject` for each (a shot ends at one when it says so); heavy and hold
// blows and impacts wear crumbling cover (`hitStructures`). Ticks, Echoes, DoTs, chain jumps and
// splash set nothing off.

const hooks = vi.hoisted(() => ({
  stops: false,
  hits: [] as [number, string][],
  structures: [] as { at: Vec; radius: number; arc?: number }[],
}));

vi.mock('../src/arpg/objects.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/arpg/objects.js')>()),
  hitObject: (_ctx: unknown, o: RoomObject, source: ObjectHitSource) => {
    hooks.hits.push([o.id, source]);
    return hooks.stops;
  },
}));
vi.mock('../src/arpg/terrain.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/arpg/terrain.js')>()),
  hitStructures: (_ctx: unknown, at: Vec, radius: number, _d: number, _dir?: Vec, arc?: number) =>
    hooks.structures.push({ at: { x: at.x, y: at.y }, radius, arc }),
}));

beforeEach(() => {
  hooks.stops = false;
  hooks.hits = [];
  hooks.structures = [];
});

const prop = (id: number, x: number, y: number): PropEntity => ({
  type: 'prop',
  id,
  kind: 'urn',
  x,
  y,
  radius: 0.4,
  life: 1,
  dead: false,
});
const withProps = (w: ArpgWorld, ...props: PropEntity[]) => {
  w.props = props;
  return w;
};
const hitIds = () => hooks.hits.map(([id]) => id);

describe("the hero's hits", () => {
  it('a melee blow: the props in its arc; a heavy or hold blow wears crumbling cover too', () => {
    const w = withProps(arena([], { noBasic: true }), prop(1, 13, 35), prop(2, 13, 37.5));
    const ctx = makeCtx(registry, w, []);
    const blow = w.hero.stats.weapon.blows[0];
    landBlow(ctx, blow, 'light', { x: 0, y: -1 }, 1);
    expect([hooks.hits, hooks.structures]).toEqual([[[1, 'hero']], []]);
    landBlow(ctx, blow, 'heavy', { x: 0, y: -1 }, 1);
    landBlow(ctx, blow, 'hold', { x: 0, y: -1 }, 1);
    expect(hitIds()).toEqual([1, 1, 1]);
    expect(hooks.structures.map((s) => s.at)).toEqual([
      { x: 13, y: 36 },
      { x: 13, y: 36 },
    ]);
  });

  it("an impact: its area, and crumbling cover; never a tick's or an Echo's", () => {
    const w = withProps(arena([], { noBasic: true }), prop(1, 13, 30), prop(2, 13, 25));
    const ctx = makeCtx(registry, w, []);
    const ab = w.hero.chains[0]!.moves[0];
    impact(ctx, ab, 13, 31, 1.5, 10);
    expect([hitIds(), hooks.structures]).toEqual([[1], [{ at: { x: 13, y: 31 }, radius: 1.5 }]]);
    impact(ctx, ab, 13, 31, 1.5, 10, { tick: true });
    impact(ctx, { ...ab, replay: true }, 13, 31, 1.5, 10);
    expect([hitIds(), hooks.structures.length]).toEqual([[1], 1]);
  });

  it("a basic shot's burst: its area", () => {
    const w = withProps(arena([], { noBasic: true }), prop(1, 13, 30), prop(2, 13, 25));
    const shot = { x: 13, y: 31, explodeRadius: 1.5, damage: 10, element: 'fire', applies: [] };
    burstShot(makeCtx(registry, w, []), shot as unknown as Projectile);
    expect(hitIds()).toEqual([1]);
  });

  it("a Lance: its beam's segment; a Strike: its arc", () => {
    const lance = arena([], { noBasic: true, primary: { form: 'lance' } });
    press(withProps(lance, prop(1, 13, 32), prop(2, 16, 32)), 0, { x: 13, y: 20 });
    expect(hitIds()).toEqual([1]);
    hooks.hits = [];
    const strike = arena([], { noBasic: true, primary: { form: 'strike' } });
    press(withProps(strike, prop(1, 13, 35), prop(2, 13, 37.5)), 0, { x: 13, y: 20 });
    expect(hitIds()).toEqual([1]);
  });

  it('a shot: what it meets, and it ends there as at a wall when `hitObject` says so', () => {
    const flight = (stops: boolean) => {
      hooks.stops = stops;
      hooks.hits = [];
      const w = withProps(arena([], { noBasic: true }), prop(1, 13, 31));
      const events = [...press(w, 0, { x: 13, y: 10 }), ...run(w, 2)];
      const burst = events.find((e) => e.kind === 'explode');
      return [hitIds()[0], burst && burst.kind === 'explode' && burst.y > 30];
    };
    expect(flight(true)).toEqual([1, true]);
    expect(flight(false)).toEqual([1, false]);
  });
});

describe('heavy and hold hits at range', () => {
  const up = { x: 0, y: -1 };
  /** Whether a blow of `kind` from a `baseId` weapon, shot at the wall above, wears cover. */
  const wears = (baseId: string, kind: 'light' | 'heavy' | 'hold') => {
    hooks.structures = [];
    const equipped = { weapon: gear('fire', 'weapon', baseId) };
    const w = onMap(arena([], { noBasic: true, equipped }), WALL_30);
    landBlow(makeCtx(registry, w, []), w.hero.stats.weapon.blows[0], kind, up, 1);
    run(w, 1);
    return hooks.structures.length > 0;
  };

  it('a heavy or hold shot wears cover where it stops at a wall or bursts; a light one never', () => {
    expect([wears('wand', 'heavy'), wears('wand', 'hold'), wears('wand', 'light')]).toEqual([
      true,
      true,
      false,
    ]);
    expect([wears('staff', 'heavy'), wears('staff', 'light')]).toEqual([true, false]);
  });

  it("a heavy or hold Strike wears cover in its arc; a Lance's beam never", () => {
    const struck = (form: 'strike' | 'lance', kind: 'medium' | 'heavy') => {
      hooks.structures = [];
      const w = arena([], { noBasic: true, primary: { form, kind } });
      const ab = w.hero.chains[0]!.moves[0];
      executeForm(makeCtx(registry, w, []), ab, { x: 13, y: 20 });
      return hooks.structures.length > 0;
    };
    expect([struck('strike', 'heavy'), struck('strike', 'medium')]).toEqual([true, false]);
    expect(struck('lance', 'heavy')).toBe(false);
  });
});

describe('Echoes and Pierce', () => {
  it("an Echo's Lance and Strike set nothing off", () => {
    for (const form of ['lance', 'strike'] as const) {
      const w = withProps(arena([], { noBasic: true, primary: { form } }), prop(1, 13, 32));
      const ab = { ...w.hero.chains[0]!.moves[0], replay: true };
      executeForm(makeCtx(registry, w, []), ab, { x: 13, y: 20 });
    }
    expect(hooks.hits).toEqual([]);
  });

  it("a blow's Echo sets nothing off and wears no cover", () => {
    const w = withProps(arena([], { noBasic: true }), prop(1, 13, 35));
    const blow = w.hero.stats.weapon.blows[0];
    landBlow(makeCtx(registry, w, []), blow, 'heavy', { x: 0, y: -1 }, 1, { echo: true });
    expect([hooks.hits, hooks.structures]).toEqual([[], []]);
  });

  it("an Echo's shot ends at an object without setting it off", () => {
    hooks.stops = true;
    const w = withProps(arena([], { noBasic: true }), prop(1, 13, 30));
    const ab = { ...w.hero.chains[0]!.moves[0], replay: true };
    const shot = (o: Partial<Projectile>): Projectile => ({
      id: 60,
      owner: 'hero',
      form: null,
      ability: null,
      homingId: null,
      x: 13,
      y: 30.9,
      vx: 0,
      vy: -8,
      radius: 0.3,
      damage: 5,
      element: 'fire',
      pierce: false,
      pierceLeft: 0,
      hitIds: [],
      maxDist: 10,
      traveled: 0,
      explodeRadius: 0,
      applies: [],
      knockback: 0,
      dead: false,
      ...o,
    });
    w.projectiles.push(shot({ replay: true }), shot({ id: 61, form: 'bolt', ability: ab }));
    run(w, STEP);
    expect([hooks.hits, w.projectiles]).toEqual([[], []]);
  });

  it('a Pierce shot past its first foe sets nothing off and wears no cover', () => {
    const w = withProps(arena([], { noBasic: true }), prop(1, 13, 30));
    const ab = w.hero.chains[0]!.moves[0];
    impact(makeCtx(registry, w, []), ab, 13, 31, 1.5, 10, { through: true });
    expect([hooks.hits, hooks.structures]).toEqual([[], []]);
  });
});

describe("the foes' hits", () => {
  it("a foe's shot, a slam's zone and a charger's dash set objects off", () => {
    const w = withProps(arena([], { noBasic: true }), prop(1, 5, 5), prop(2, 20, 10));
    w.projectiles.push({
      id: 50,
      owner: 'monster',
      form: null,
      ability: null,
      homingId: null,
      x: 5,
      y: 5.9,
      vx: 0,
      vy: -8,
      radius: 0.3,
      damage: 5,
      element: null,
      pierce: false,
      pierceLeft: 0,
      hitIds: [],
      maxDist: 10,
      traveled: 0,
      explodeRadius: 0,
      applies: [],
      knockback: 0,
      dead: false,
    });
    hooks.stops = true;
    run(w, STEP);
    expect([hooks.hits, w.projectiles]).toEqual([[[1, 'foe']], []]);
    w.zones.push({
      id: 51,
      owner: 'monster',
      source: null,
      ability: null,
      x: 20,
      y: 11,
      radius: 2,
      born: 0,
      until: 99,
      tick: 0,
      nextTick: 0,
      damage: 5,
      element: null,
      detonateAt: w.t,
      dead: false,
    });
    run(w, STEP);
    expect(hooks.hits).toEqual([
      [1, 'foe'],
      [2, 'foe'],
    ]);
    w.props = [prop(3, 8, 20)];
    w.monsters.push({
      ...arena([dummy(8, 21.2)]).monsters[0],
      ai: 'charger',
      speed: 2.6,
      aggro: true,
      chargeUntil: 1e9,
      chargeDir: { x: 0, y: -1 },
      chargeHit: true,
    });
    run(w, 4 * STEP);
    expect(hooks.hits.slice(2)[0]).toEqual([3, 'foe']);
  });
});
