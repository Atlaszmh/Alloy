import { describe, it, expect, vi } from 'vitest';
import { Container, type Sprite, type Texture } from 'pixi.js';
import {
  CELL,
  LOOK_IDS,
  type ArpgWorld,
  type HazardEntity,
  type LookId,
  type PropEntity,
  type Structure,
} from '@alloy/engine';
import { RoomSprites, coverSprites, crackFrame } from '../arena/room-sprites';
import { spriteFrames } from '../arena/sprites';
import { ringMap } from './hand-map';

// The atlas isn't loaded under jsdom: distinct frames for the ids the tests draw (none for the urn).
vi.mock('../arena/sprites', async (importOriginal) => {
  const { Texture } = await import('pixi.js');
  const counts: Record<string, number> = { statue: 3, boulder: 1, crate: 2, brazier: 3 };
  const made = new Map<string, Texture[]>();
  return {
    ...(await importOriginal<typeof import('../arena/sprites')>()),
    spriteFrames: (id: string) => {
      const n = counts[id];
      if (!n) return null;
      if (!made.has(id)) {
        made.set(
          id,
          Array.from({ length: n }, () => new Texture()),
        );
      }
      return made.get(id)!;
    },
  };
});

const frames = (id: string) => spriteFrames(id)!;

/** The ring map's combat room (24, 22, 16 × 14) with a crumbling statue, a boulder, a ruin and vines. */
function world() {
  const map = ringMap();
  const set = (x: number, y: number, code: number, look: LookId) => {
    map.cells[y * map.width + x] = code;
    map.look[y * map.width + x] = LOOK_IDS.indexOf(look);
  };
  set(28, 25, CELL.crumbling, 'statue');
  set(30, 25, CELL.cover, 'boulder');
  set(32, 25, CELL.cover, 'ruin');
  set(34, 25, CELL.foliage, 'vines');
  const statue: Structure = { id: 0, cells: [{ x: 28, y: 25 }], life: 90, maxLife: 90 };
  map.structures = [statue];
  const w = {
    map,
    fog: new Uint8Array(map.width * map.height),
    props: [] as PropEntity[],
    hazards: [] as HazardEntity[],
  };
  return { w: w as unknown as ArpgWorld, statue };
}

const see = (w: ArpgWorld, x: number, y: number) => (w.fog[y * w.map.width + x] = 1);

const prop = (over: Partial<PropEntity>): PropEntity => ({
  type: 'prop',
  id: 1,
  kind: 'crate',
  x: 26.5,
  y: 30.5,
  radius: 0.4,
  life: 1,
  dead: false,
  ...over,
});

const hazard = (over: Partial<HazardEntity>): HazardEntity => ({
  type: 'hazard',
  id: 2,
  kind: 'brazier',
  element: 'fire',
  x: 34.5,
  y: 30.5,
  radius: 0.4,
  burst: 2.5,
  state: 'ready',
  until: 0,
  ...over,
});

const sprites = (layer: Container) => layer.children as Sprite[];

describe('the room sprites', () => {
  it("cracks a crumbling structure's sprite by thirds of its life, up to the frames it has", () => {
    const s = (life: number): Structure => ({ id: 0, cells: [], life, maxLife: 90 });
    expect([90, 61, 59, 31, 29, 0].map((l) => crackFrame(s(l), 3))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(crackFrame(s(0), 1)).toBe(0);
    expect(crackFrame(undefined, 3)).toBe(0);
  });

  it('draws only cover and crumbling cover whose look is a sprite', () => {
    expect(coverSprites(world().w.map)).toEqual([
      { x: 28, y: 25, look: 'statue' },
      { x: 30, y: 25, look: 'boulder' },
    ]);
  });

  it('stands each cover sprite on its cell, hidden until the fog has seen it', () => {
    const { w } = world();
    const layer = new Container();
    const view = new RoomSprites(layer);
    view.load(w);
    view.update(w);
    const [statue, boulder] = sprites(layer);
    expect(sprites(layer)).toHaveLength(2);
    expect([statue.x, statue.y, statue.zIndex]).toEqual([28.5, 26, 25.5]);
    expect([boulder.x, boulder.y]).toEqual([30.5, 26]);
    expect(statue.visible).toBe(false);
    see(w, 28, 25);
    view.update(w);
    expect(statue.visible).toBe(true);
    expect(boulder.visible).toBe(false);
  });

  it('cracks a statue as its structure loses life, and drops it when it crumbles', () => {
    const { w, statue } = world();
    const layer = new Container();
    const view = new RoomSprites(layer);
    view.load(w);
    view.update(w);
    const [sprite] = sprites(layer);
    expect(sprite.texture).toBe(frames('statue')[0]);
    statue.life = 40;
    view.update(w);
    expect(sprite.texture).toBe(frames('statue')[1]);
    statue.life = 0;
    w.map.cells[25 * w.map.width + 28] = CELL.slow;
    w.map.version++;
    view.update(w);
    expect(sprites(layer)).toHaveLength(1);
    expect(sprites(layer)[0].texture).toBe(frames('boulder')[0]);
  });

  it('draws a prop whole then broken and a hazard by its state, only in seen cells', () => {
    const { w } = world();
    const layer = new Container();
    const view = new RoomSprites(layer);
    view.load(w);
    const crate = prop({});
    const brazier = hazard({});
    w.props.push(crate, prop({ id: 3, kind: 'urn' }));
    w.hazards.push(brazier);
    view.update(w);
    // The urn has no art: nothing drawn for it.
    expect(sprites(layer)).toHaveLength(4);
    const [, , c, b] = sprites(layer);
    expect([c.x, c.y, c.zIndex]).toEqual([26.5, 30.9, 30.5]);
    expect(c.visible).toBe(false);
    see(w, 26, 30);
    see(w, 34, 30);
    crate.dead = true;
    brazier.state = 'primed';
    view.update(w);
    expect(c.visible).toBe(true);
    expect(c.texture).toBe(frames('crate')[1]);
    expect(b.texture).toBe(frames('brazier')[1]);
    brazier.state = 'dormant';
    view.update(w);
    expect(b.texture).toBe(frames('brazier')[2]);
  });

  it('forgets the objects gone from the world, and everything on a new floor', () => {
    const { w } = world();
    const layer = new Container();
    const view = new RoomSprites(layer);
    view.load(w);
    w.props.push(prop({}));
    w.hazards.push(hazard({}));
    view.update(w);
    expect(sprites(layer)).toHaveLength(4);
    w.props.length = 0;
    view.update(w);
    expect(sprites(layer)).toHaveLength(3);
    view.load(world().w);
    expect(sprites(layer)).toHaveLength(2);
  });
});
