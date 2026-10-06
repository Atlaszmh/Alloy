import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  CanvasTextMetrics,
  Container,
  Text,
  Texture,
  type Application,
  type Graphics,
  type Sprite,
} from 'pixi.js';
import {
  CELL,
  computeHeroStats,
  createSandboxWorld,
  defaultChains,
  spawnDummies,
  type ArpgEvent,
  type ArpgWorld,
  type Door,
  type Drop,
  type FloorMap,
  type GearItem,
} from '@alloy/engine';
import {
  ArenaRenderer,
  drawDrop,
  dropPlaque,
  drawDoor,
  drawHeldGate,
  dropPop,
  edgeArrow,
  fogKey,
  holdPing,
  paintFog,
  pickupColor,
  propFrame,
  pruneViews,
  stackPlaques,
  tutorialMarker,
} from '../arena/ArenaRenderer';
import { MANA_HEX, cssToHex } from '../arena/palette';
import { attachKeyboard, createArenaInput } from '../arena/input';
import { RARITY_TEXT } from '../format';
import { DUST_COLOR, METAL_COLOR, PATTERN_COLOR } from '../materials/material-style';
import { runeHex } from '../arena/fx/runes';
import type { ManaFx } from '../arena/fx/mana-fx';
import { getDelveRegistry } from '../registry';
import { spritePixelScale } from '../arena/camera';
import { useUIStore } from '@/stores/uiStore';
import { ringMap } from './hand-map';
import { RoomSprites } from '../arena/room-sprites';

// The props' art: two frames each (the atlas isn't loaded under jsdom; nothing else has art here).
vi.mock('../arena/sprites', async (importOriginal) => {
  const { Texture } = await import('pixi.js');
  const props = ['chest', 'shrine', 'alcove_anvil', 'exit_gate'];
  return {
    ...(await importOriginal<typeof import('../arena/sprites')>()),
    spriteFrames: (id: string) => (props.includes(id) ? [Texture.WHITE, Texture.EMPTY] : null),
  };
});

// The guided start's exit gate (B1's `tutorialExitHeld`), held by the test that asks.
const exit = vi.hoisted(() => ({ held: false }));
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  tutorialExitHeld: () => exit.held,
}));

/** A Graphics stand-in that records the colours it fills. */
function recorder() {
  const fills: number[] = [];
  const g: Record<string, unknown> = {};
  for (const m of ['clear', 'rect', 'circle', 'ellipse', 'poly', 'stroke']) g[m] = () => g;
  g.fill = (f: { color: number }) => (fills.push(f.color), g);
  return { g: g as unknown as Graphics, fills };
}

const drop = (over: Partial<Drop>): Drop => ({
  id: 1,
  kind: 'orb',
  x: 0,
  y: 0,
  amount: 0.1,
  born: 0,
  vacuum: false,
  dead: false,
  ...over,
});

describe('the arena renderer', () => {
  it('forgets and destroys the views of monsters that are gone', () => {
    const views = new Map([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]);
    const destroyed: string[] = [];
    pruneViews(views, new Set([2]), (v) => destroyed.push(v));
    expect([...views.keys()]).toEqual([2]);
    expect(destroyed).toEqual(['a', 'c']);
  });

  it("draws a Seedling's orb as a green sprout, a health orb red, and a Siphon mote violet", () => {
    const sprout = recorder();
    drawDrop(sprout.g, drop({ mana: 'nature' }), 1, 1);
    expect(sprout.fills).toContain(MANA_HEX.nature);
    expect(sprout.fills).not.toContain(0xdc2626);
    const orb = recorder();
    drawDrop(orb.g, drop({}), 1, 1);
    expect(orb.fills).toContain(0xdc2626);
    const mote = recorder();
    drawDrop(mote.g, drop({ kind: 'mote', mana: 'shadow' }), 1, 1);
    expect(mote.fills).toContain(MANA_HEX.shadow);
  });

  it("a Seedling's sprout grows in rooted, where a health orb hops as it lands", () => {
    expect(dropPop(drop({ mana: 'nature' }), 0.17)).toBe(0);
    expect(dropPop(drop({}), 0.17)).toBeGreaterThan(1);
    expect(dropPop(drop({}), 0.35)).toBe(0);
  });

  it("a Seedling orb's pickup sparkles green, a health orb's red", () => {
    const pickup = (over: Partial<Extract<ArpgEvent, { kind: 'pickup' }>>) =>
      pickupColor({ kind: 'pickup', dropId: 1, dropKind: 'orb', amount: 0.1, ...over });
    expect(pickup({ mana: 'nature' })).toBe(MANA_HEX.nature);
    expect(pickup({})).toBe(0xf87171);
    expect(pickup({ dropKind: 'mote', mana: 'shadow' })).toBe(MANA_HEX.shadow);
  });

  it("a hold's stage pings a ring in the held move's element (a held blow's for the basic), wider at stage 2", () => {
    const w = {
      hero: {
        chains: [{ moves: [{ element: 'frost' }], hold: [null] }],
        hold: { slot: 0, step: 0, start: 0, aim: null, full: 1, max: 2 },
        windup: null,
        swing: { step: 1 },
        stats: { weapon: { blows: [{ element: 'fire' }, { element: 'storm' }] } },
      },
    } as unknown as ArpgWorld;
    const ability = holdPing(w, { slot: 0, stage: 1 });
    expect(ability.color).toBe(MANA_HEX.frost);
    expect(ability.r).toBeCloseTo(1.2);
    const blow = holdPing(w, { slot: null, stage: 2 });
    expect(blow.color).toBe(MANA_HEX.storm);
    expect(blow.r).toBeCloseTo(1.6);
  });
});

/** A renderer on a stand-in app (no GPU): a `width`×`height` screen at resolution `res`. */
function stage(width = 1920, height = 1080, res = 1) {
  const app = {
    // A creature without art draws its emoji, as a generated texture.
    renderer: { render() {}, resolution: res, generateTexture: () => Texture.EMPTY },
    stage: new Container(),
    screen: { width, height },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  };
  return { app, r: new ArenaRenderer(app as unknown as Application) };
}

/** An empty sandbox floor (26 × 40 units) with the hero at `x`, `y`. */
function floor(x = 13, y = 20): ArpgWorld {
  const registry = getDelveRegistry();
  const w = createSandboxWorld(registry, {
    depth: 5,
    stats: computeHeroStats({}, registry),
    chains: defaultChains(registry, 'fire', null),
    toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
  });
  Object.assign(w.hero, { x, y });
  return w;
}

/** Put `w` on screen with its camera on the hero, and draw a still frame. */
function show(r: ArenaRenderer, w: ArpgWorld): void {
  r.loadFloor(w, getDelveRegistry().getBiomeForDepth(w.depth));
  r.update(0);
}

describe('the dive camera', () => {
  afterEach(() => useUIStore.getState().setArenaViewUnits(27));

  it('zooms to whole render pixels per sprite pixel from the height alone, and follows View distance', () => {
    expect(stage(1920, 1080).r.pixelsPerUnit()).toBe(40); // 4 px per sprite px: 27 units tall
    expect(stage(1280, 720).r.pixelsPerUnit()).toBe(30);
    expect(stage(3440, 1440).r.pixelsPerUnit()).toBe(50);
    expect(stage(1920, 1080, 2).r.pixelsPerUnit()).toBe(40); // 8 render px per sprite px
    useUIStore.getState().setArenaViewUnits(20);
    expect(stage(1920, 1080).r.pixelsPerUnit()).toBe(50); // 21.6 units
  });

  it('a point round-trips through the screen at each scale, the canvas anywhere on the page', () => {
    const { app, r } = stage();
    r.setInsets({ top: 72, right: 380, bottom: 230, left: 0 });
    const w = floor();
    show(r, w);
    for (const height of [720, 800, 1024, 1080, 1200, 1440, 2160])
      for (const res of [1, 2]) {
        Object.assign(app.screen, { width: height * 1.6, height });
        app.renderer.resolution = res;
        r.resize();
        // 10 sprite pixels a unit: the scale's px per sprite px, in CSS px.
        expect(r.pixelsPerUnit()).toBeCloseTo((spritePixelScale(height * res) * 10) / res);
        for (const [x, y] of [
          [3, 5],
          [13, 20],
          [24.5, 37.25],
        ]) {
          for (const at of [
            { left: 0, top: 0 },
            { left: 37, top: 11.5 },
          ]) {
            app.canvas.getBoundingClientRect = () => at;
            Object.assign(w.hero, { x, y });
            r.update(0);
            // On the canvas; the page's point is that plus where the canvas sits.
            const s = r.heroScreen()!;
            const back = r.screenToWorld(s.x + at.left, s.y + at.top);
            expect(back.x, `${height}p ×${res} at ${at.left}`).toBeCloseTo(x, 6);
            expect(back.y).toBeCloseTo(y, 6);
          }
        }
      }
  });

  it('centres the hero in the clear rectangle the insets leave, on whole render pixels', () => {
    const { r } = stage(1920, 1080, 2);
    r.setInsets({ top: 71, right: 381, bottom: 230, left: 0 });
    show(r, floor(13, 20));
    // The arena's 26 units fit the clear width (38.5 units): it centres there; the height follows the hero.
    expect(r.heroScreen()).toEqual({ x: (1920 - 381) / 2, y: 71 + (1080 - 71 - 230) / 2 });
    const root = (r as unknown as { root: Container }).root.position;
    expect(Number.isInteger(root.x * 2) && Number.isInteger(root.y * 2)).toBe(true);
    // The view is the whole screen, in world units.
    const v = r.viewRect();
    expect(v.right - v.left).toBeCloseTo(48);
    expect(v.bottom - v.top).toBeCloseTo(27);
  });

  it("a new floor's view is set as it loads, before its first frame (the HUD's first snapshot reads it)", () => {
    const { r } = stage();
    show(r, floor(13, 4));
    const before = r.viewRect();
    r.loadFloor(floor(13, 36), getDelveRegistry().getBiomeForDepth(5));
    const loaded = r.viewRect();
    expect(loaded.top).toBeGreaterThan(before.top);
    r.update(0);
    expect(r.viewRect()).toEqual(loaded);
  });

  it("clamps on the clear rectangle's half extents: a narrow one still follows sideways", () => {
    // 1280×1024: 32 units wide, 4 px per sprite px; the right column leaves 24.9 units clear.
    const left = (right: number, heroX: number) => {
      const { r } = stage(1280, 1024);
      r.setInsets({ top: 0, right, bottom: 0, left: 0 });
      show(r, floor(heroX, 20));
      return r.viewRect().left;
    };
    expect(left(0, 2)).toBe(left(0, 24)); // the whole arena fits: centred
    expect(left(285, 2)).toBeLessThan(left(285, 24));
  });
});

describe('runes on the floor', () => {
  const split = { id: 'split', tier: 3 as const };

  it('draw as a stone in their family colour, named with their tier, and sparkle so when picked up', () => {
    const stone = recorder();
    drawDrop(stone.g, drop({ kind: 'rune', rune: split }), 1, 1);
    expect(stone.fills).toContain(runeHex(split));
    expect(stone.fills).not.toContain(0xfcd34d); // not the scrap coin
    expect(dropPlaque(drop({ kind: 'rune', rune: split }), false)).toEqual({
      text: 'Split III',
      color: runeHex(split),
      always: true,
    });
    expect(
      pickupColor({ kind: 'pickup', dropId: 1, dropKind: 'rune', amount: 0, rune: split }),
    ).toBe(runeHex(split));
  });

  it('labels every item and rune: rare and up, runes and upgrades (▲) always, the rest on Alt', () => {
    const item = (rarity: GearItem['rarity']) =>
      drop({ kind: 'item', item: { name: 'Sunfang', rarity } as GearItem });
    expect(dropPlaque(item('legendary'), false)).toEqual({
      text: 'Sunfang',
      color: cssToHex(RARITY_TEXT.legendary),
      always: true,
    });
    expect(dropPlaque(item('epic'), false)?.color).toBe(0xd7a6e8); // epic's text colour
    expect(dropPlaque(item('magic'), false)).toMatchObject({ text: 'Sunfang', always: false });
    expect(dropPlaque(item('magic'), true)).toMatchObject({ text: 'Sunfang ▲', always: true });
    expect(dropPlaque(drop({}), false)).toBeNull();
  });
});

describe('materials on the floor', () => {
  const iron = { kind: 'metal', metal: 'iron' } as const;
  const bar = drop({ kind: 'material', material: iron, amount: 2 });
  const ironHex = cssToHex(METAL_COLOR.iron);

  it('draw as small pickups in their colour, trailing three pixels while the magnet pulls them', () => {
    const still = recorder();
    drawDrop(still.g, bar, 1, 1);
    const fills = still.fills.filter((c) => c === ironHex).length;
    expect(fills).toBeGreaterThan(0);
    expect(still.fills).not.toContain(0xfcd34d); // not the scrap coin
    const flying = recorder();
    drawDrop(flying.g, bar, 1, 1, { dx: 0.3, dy: 0 });
    expect(flying.fills.filter((c) => c === ironHex)).toHaveLength(fills + 3);
    const dust = recorder();
    drawDrop(dust.g, drop({ kind: 'material', material: { kind: 'dust' } }), 1, 1);
    expect(dust.fills).toContain(cssToHex(DUST_COLOR));
  });

  it('only an essence is labelled, always, in legendary orange; a pickup sparkles its colour', () => {
    expect(dropPlaque(bar, false)).toBeNull();
    const essence = drop({ kind: 'material', material: { kind: 'essence', essence: 'twin_fang' } });
    expect(dropPlaque(essence, false)).toEqual({
      text: 'Twin Fang essence',
      color: cssToHex(RARITY_TEXT.legendary),
      always: true,
    });
    expect(
      pickupColor({ kind: 'pickup', dropId: 1, dropKind: 'material', amount: 2, material: iron }),
    ).toBe(ironHex);
  });
});

describe('patterns on the floor', () => {
  const maul = drop({ kind: 'pattern', pattern: 'maul', amount: 1 });
  const blue = cssToHex(PATTERN_COLOR);

  it('draw as a blueprint scroll in their own colour, named always, and sparkle so when picked up', () => {
    const scroll = recorder();
    drawDrop(scroll.g, maul, 1, 1);
    expect(scroll.fills).toContain(blue);
    expect(scroll.fills).not.toContain(0xfcd34d); // not the scrap coin
    expect(dropPlaque(maul, false)).toEqual({ text: 'Pattern: Maul', color: blue, always: true });
    expect(
      pickupColor({ kind: 'pickup', dropId: 1, dropKind: 'pattern', amount: 1, pattern: 'maul' }),
    ).toBe(blue);
  });
});

describe('a slain foe', () => {
  it("floats no scrap: it bursts out as pickups, credited as they're picked up", () => {
    const { r } = stage();
    const w = floor();
    show(r, w);
    const death = { kind: 'death', id: 999, x: 13, y: 18, scrap: 30 } as const;
    r.handleEvents([
      { ...death, monsterKind: 'elite' },
      { ...death, id: 998, monsterKind: 'boss' },
    ]);
    const floats = (r as unknown as { floats: { text: Text }[] }).floats;
    expect(floats.map((f) => f.text.text).filter((t) => t.includes('⚙'))).toEqual([]);
  });
});

describe('loot labels', () => {
  afterEach(() => vi.restoreAllMocks());

  /** The loot labels on screen: each shown plate's text. */
  const labels = (app: { stage: Container }) =>
    app.stage.children[1].children
      .filter((c) => c.visible)
      .flatMap((c) => c.children.filter((t) => t instanceof Text).map((t) => (t as Text).text));

  // jsdom has no canvas: measure text as 7 px a character, 14 tall.
  const measure = () =>
    vi.spyOn(CanvasTextMetrics, 'measureText').mockImplementation(
      (text) =>
        ({
          width: String(text).length * 7,
          height: 14,
          lines: [String(text)],
          lineWidths: [String(text).length * 7],
          lineHeight: 14,
          maxLineWidth: String(text).length * 7,
          fontProperties: { ascent: 11, descent: 3, fontSize: 14 },
        }) as unknown as CanvasTextMetrics,
    );

  it('hold Alt shows every drop, and a blur (an Alt+Tab, no keyup) lets go', () => {
    measure();
    const { app, r } = stage();
    const w = floor(13, 20);
    const item = (id: number, name: string, rarity: GearItem['rarity']) =>
      drop({ id, kind: 'item', x: 10 + id * 3, y: 20, item: { name, rarity } as GearItem });
    w.drops.push(
      item(1, 'Rusty Ring', 'magic'),
      item(2, 'Sunfang', 'legendary'),
      item(3, 'Better Boots', 'common'),
      drop({ id: 4, kind: 'rune', x: 22, y: 20, rune: { id: 'split', tier: 2 } }),
      drop({ id: 5, x: 13, y: 22 }), // a health orb: no label
    );
    r.setUpgradeTest((i) => i.name === 'Better Boots');
    show(r, w);
    expect(labels(app).sort()).toEqual(['Better Boots ▲', 'Split II', 'Sunfang']);

    const input = createArenaInput();
    const detach = attachKeyboard(input, () => true);
    /** One frame: what useArenaCore hands the renderer, then the draw. */
    const frame = () => {
      r.setLabelsHeld(input.labels);
      r.update(0);
    };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'AltLeft' }));
    frame();
    expect(labels(app)).toContain('Rusty Ring');
    window.dispatchEvent(new Event('blur'));
    frame();
    expect(labels(app)).not.toContain('Rusty Ring');
    detach();
  });

  it('labels only drops the fog has seen on a generated floor', { timeout: 20000 }, () => {
    measure();
    const { app, r } = stage();
    const w = onMap(ringMap());
    w.fog.fill(0);
    w.fog[8 * w.width + 8] = 1; // seen once, out of sight now
    const legendary = { name: 'Sunfang', rarity: 'legendary' } as GearItem;
    w.drops.push(
      drop({ id: 1, kind: 'item', x: 8.5, y: 8.5, item: legendary }),
      drop({ id: 2, kind: 'item', x: 50.5, y: 50.5, item: { ...legendary, name: 'Unseen' } }),
    );
    show(r, w);
    expect(labels(app)).toEqual(['Sunfang']);
  });

  it('overlapping labels stack upward, lowest first; apart ones stay', () => {
    const box = (x: number, y: number) => ({ x, y, w: 80, h: 20 });
    expect(stackPlaques([box(100, 500), box(120, 495), box(400, 500), box(100, 490)])).toEqual([
      500, 478, 500, 456,
    ]);
  });

  it('stacked labels of different sizes never overlap, one pushed past a raised one clearing it too', () => {
    const boxes = [
      { x: -30, y: 600, w: 20, h: 100 },
      { x: 0, y: 590, w: 60, h: 60 }, // raised above the first
      { x: 100, y: 530, w: 60, h: 20 },
      // Starts below the raised one; the third pushes it up into its band, so it goes above it.
      { x: 50, y: 525, w: 60, h: 20 },
    ];
    const bottoms = stackPlaques(boxes);
    expect(bottoms).toEqual([600, 498, 530, 436]);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const apart =
          Math.abs(a.x - b.x) >= (a.w + b.w) / 2 ||
          bottoms[i] <= bottoms[j] - b.h ||
          bottoms[i] - a.h >= bottoms[j];
        expect(apart).toBe(true);
      }
  });
});

/** `floor()` on a hand-built map, every cell in sight, the hero at its start. */
function onMap(map: FloorMap): ArpgWorld {
  const w = floor(map.start.x, map.start.y);
  Object.assign(w, {
    map,
    width: map.width,
    height: map.height,
    fog: new Uint8Array(map.width * map.height).fill(2),
  });
  return w;
}

// A floor on ringMap builds its 64 × 64 pixel floor in the thread (jsdom has no workers).
describe("a generated floor's doors and props", { timeout: 20000 }, () => {
  it('frames a door with stone posts; shut, iron bars slide across it, glowing red', () => {
    const door: Door = {
      id: 0,
      cells: [16, 17, 18].map((x) => ({ x, y: 9 })),
      rooms: [0, 1],
      closed: true,
    };
    const open = recorder();
    drawDoor(open.g, door, 0, 1);
    expect(open.fills).toEqual([0x5a6988, 0x5a6988]);
    const shut = recorder();
    drawDoor(shut.g, door, 1, 1);
    expect(shut.fills.slice(0, 3)).toEqual([0x5a6988, 0x5a6988, 0xe43b44]);
    // A bar every 0.3 units across its 3 cells.
    expect(shut.fills.filter((c) => c === 0x8b9bb4)).toHaveLength(10);
  });

  it("slides a door's bars shut and open over a quarter second", () => {
    const { r } = stage();
    const w = onMap(ringMap());
    show(r, w);
    const shut = (r as unknown as { doorShut: Map<number, number> }).doorShut;
    expect(shut.get(0)).toBe(0);
    w.map.doors[0].closed = true;
    r.update(0.1);
    expect(shut.get(0)).toBeCloseTo(0.4);
    r.update(0.2);
    expect(shut.get(0)).toBe(1);
    w.map.doors[0].closed = false;
    r.update(0.05);
    expect(shut.get(0)).toBeCloseTo(0.8);
  });

  it('picks each prop its frame: open, spent, a gate once it may be taken, an anvil flickering till used', () => {
    expect(propFrame('chest', false, true, 0).frame).toBe(0);
    expect(propFrame('chest', true, true, 0).frame).toBe(1);
    expect(propFrame('shrine', true, true, 0).frame).toBe(1);
    expect(propFrame('gate', false, false, 0).frame).toBe(0);
    expect(propFrame('gate', false, true, 0).frame).toBe(1);
    const flicker = [0, 0.4].map((t) => propFrame('alcove', false, true, t));
    expect(flicker.map((f) => f.frame)).toEqual([0, 1]);
    expect(propFrame('alcove', true, true, 0.4)).toEqual({ frame: 0, tint: 0x8b8b8b });
  });

  it("stands each room's prop at its interactable, in its state", () => {
    const { r } = stage();
    const w = onMap(ringMap());
    show(r, w);
    const props = (r as unknown as { props: Map<string, { sprite: Sprite }> }).props;
    expect([...props.keys()]).toEqual(['1:1', '1:2', '1:3']);
    const chest = props.get('1:1')!.sprite;
    // Centred on its spot, its base below it (a 0.9 chest), sorted among the creatures by its base.
    expect(chest.position.x).toBe(50);
    expect(chest.position.y).toBeCloseTo(9 + 0.45);
    expect(chest.zIndex).toBeCloseTo(9 + 0.45 - 0.5);
    expect(chest.texture).toBe(Texture.WHITE);
    w.map.rooms[1].interactable!.used = true;
    r.update(0.1);
    expect(chest.texture).toBe(Texture.EMPTY);
    // No boss: the gate stands open; while a boss lives, it is shut.
    const gate = props.get('1:3')!.sprite;
    expect(gate.texture).toBe(Texture.EMPTY);
    w.bossId = 99;
    r.update(0.1);
    expect(gate.texture).toBe(Texture.WHITE);
    w.bossKilled = true;
    r.update(0.1);
    expect(gate.texture).toBe(Texture.EMPTY);
  });
});

describe("a generated floor's fog", { timeout: 20000 }, () => {
  it('blacks out the unseen, dims the seen, clears what is in sight, and shows the walls round it', () => {
    const map = ringMap();
    const fog = new Uint8Array(64 * 64);
    const cells = (k: number) => {
      const r = map.rooms[k].rect;
      return Array.from(
        { length: r.w * r.h },
        (_, i) => (r.y + Math.floor(i / r.w)) * 64 + r.x + (i % r.w),
      );
    };
    for (const c of cells(0)) fog[c] = 2;
    for (const c of cells(1)) fog[c] = 1;
    const pad = 3;
    const out = new Uint8Array((64 + pad * 2) ** 2 * 4);
    paintFog(map, fog, pad, out);
    const alpha = (x: number, y: number) => out[((y + pad) * (64 + pad * 2) + x + pad) * 4 + 3];
    expect(alpha(8, 8)).toBe(0); // in the start room
    expect(alpha(3, 8)).toBe(0); // its wall
    expect(alpha(50, 8)).toBe(150); // the vault, seen before
    expect(alpha(50, 50)).toBe(255); // the sanctum, never seen
    expect(alpha(0, 0)).toBe(255);
    expect(alpha(-3, -3)).toBe(255); // the cliffs past the edge
    expect(out[(pad * (64 + pad * 2) + pad) * 4]).toBe(0); // black
  });

  it('lays over a generated floor (none on the open room), and redraws when the fog moves on', () => {
    const { r } = stage();
    show(r, floor());
    expect((r as unknown as { fog: unknown }).fog).toBeNull();
    const w = onMap(ringMap());
    w.fog.fill(0);
    show(r, w);
    const fog = (r as unknown as { fog: { sprite: Sprite; pixels: Uint8Array } }).fog;
    expect(fog.sprite.position.x).toBe(-3);
    const at = (x: number, y: number) => fog.pixels[((y + 3) * 70 + x + 3) * 4 + 3];
    expect(at(8, 8)).toBe(255);
    w.fog.fill(2);
    r.update(0.1);
    expect(at(8, 8)).toBe(255); // the same fogVersion: not redrawn
    w.fogVersion++;
    r.update(0.1);
    expect(at(8, 8)).toBe(0);
  });

  it('repaints when the map changes under a still fog: crumbled cover shows its own fog', () => {
    const { r } = stage();
    const w = onMap(ringMap());
    const c = 6 * 64 + 10;
    w.map.cells[c] = CELL.crumbling;
    w.fog[c] = 0; // solid: it takes the clearest fog of the floor round it
    show(r, w);
    const fog = (r as unknown as { fog: { pixels: Uint8Array } }).fog;
    const at = (x: number, y: number) => fog.pixels[((y + 3) * 70 + x + 3) * 4 + 3];
    expect(at(10, 6)).toBe(0);
    w.map.cells[c] = CELL.slow; // crumbled to rubble: floor, with its own fog
    r.update(0.1);
    expect(at(10, 6)).toBe(0); // the same fog and map: not repainted
    w.map.version++;
    r.update(0.1);
    expect(at(10, 6)).toBe(255);
    expect(fogKey(w)).toBe(`${w.fogVersion}:1`);
  });

  it('shows a foe, and the numbers of its hits, only while the hero sees it', () => {
    const { r } = stage();
    const w = onMap(ringMap());
    const [foe] = spawnDummies(getDelveRegistry(), w, { layout: 'single', element: null });
    Object.assign(foe, { x: 10, y: 8 });
    show(r, w);
    const view = () =>
      (r as unknown as { monsters: Map<number, { root: Container }> }).monsters.get(foe.id)!.root;
    expect(view().visible).toBe(true);
    const floats = () => (r as unknown as { floats: unknown[] }).floats.length;
    const hit: ArpgEvent = {
      kind: 'hit',
      id: foe.id,
      x: 10,
      y: 8,
      amount: 12,
      crit: false,
      element: null,
      heft: 0,
      source: 'basic',
    };
    r.handleEvents([hit]);
    expect(floats()).toBe(1);
    w.fog[8 * 64 + 10] = 1;
    r.update(0.1);
    expect(view().visible).toBe(false);
    r.handleEvents([hit]);
    expect(floats()).toBe(1);
  });

  it("keeps the camera on the map's bounds", () => {
    const { r } = stage();
    const w = onMap(ringMap());
    Object.assign(w.hero, { x: 2, y: 2 });
    show(r, w);
    expect(r.viewRect().left).toBeCloseTo(-1);
    expect(r.viewRect().top).toBeCloseTo(-1.5);
    const far = onMap(ringMap());
    Object.assign(far.hero, { x: 62, y: 62 });
    show(r, far);
    expect(r.viewRect().right).toBeCloseTo(65);
    expect(r.viewRect().bottom).toBeCloseTo(65.5);
  });
});

describe('the guided start on the floor', { timeout: 20000 }, () => {
  afterEach(() => {
    exit.held = false;
    vi.restoreAllMocks();
  });

  const real = getDelveRegistry().getTutorialData();
  const step = (id: string, marker?: string) => ({
    id,
    where: 'floor' as const,
    floor: 'd1-1',
    line: 'Hesta.',
    objective: 'Go',
    marker,
    trigger: { type: 'marker' as const, count: 1 },
  });

  it('a held door glows forge gold where a sealed one glows red', () => {
    const door: Door = {
      id: 0,
      cells: [16, 17, 18].map((x) => ({ x, y: 9 })),
      rooms: [0, 1],
      closed: false,
      held: true,
    };
    const held = recorder();
    drawDoor(held.g, door, 1, 1, true);
    expect(held.fills.slice(0, 3)).toEqual([0x5a6988, 0x5a6988, 0xfeae34]);
    expect(held.fills.filter((c) => c === 0x8b9bb4)).toHaveLength(10);
  });

  it('a held door slides shut as a sealed one does, and its bars slide away gold when let go', () => {
    const { r } = stage();
    const w = onMap(ringMap());
    show(r, w);
    const view = r as unknown as { doorShut: Map<number, number>; doorHeld: Map<number, boolean> };
    w.map.doors[0].held = true;
    r.update(0.3);
    expect([view.doorShut.get(0), view.doorHeld.get(0)]).toEqual([1, true]);
    w.map.doors[0].held = false;
    r.update(0.05);
    expect(view.doorShut.get(0)).toBeCloseTo(0.8);
    expect(view.doorHeld.get(0)).toBe(true);
  });

  it('a held exit stays shut, barred in gold, until the floor lets it go', () => {
    const { r } = stage();
    const w = onMap(ringMap());
    show(r, w);
    const props = (r as unknown as { props: Map<string, { sprite: Sprite }> }).props;
    const gate = props.get('1:3')!.sprite;
    expect(gate.texture).toBe(Texture.EMPTY); // no boss: open
    exit.held = true;
    r.update(0.1);
    expect(gate.texture).toBe(Texture.WHITE);
    exit.held = false;
    r.update(0.1);
    expect(gate.texture).toBe(Texture.EMPTY);
    const bars = recorder();
    drawHeldGate(bars.g, { x: 0, y: 0, w: 0.9, h: 1.2 }, 0);
    expect(bars.fills.length).toBeGreaterThan(0);
    expect(new Set(bars.fills)).toEqual(new Set([0xfeae34]));
  });

  it("finds the step's marker on its hand-built floor, and none without one", () => {
    const data = { ...real, steps: [step('walk', 'walk'), step('fight')] };
    const on = (s: string | null, floor = 'd1-1') =>
      ({
        tutorial: s && { step: s, count: 0, misses: 0, tally: {} },
        tutorialFloor: floor,
      }) as unknown as ArpgWorld;
    const walk = real.floors.find((f) => f.id === 'd1-1')!.markers.find((m) => m.id === 'walk')!;
    expect(tutorialMarker(data, on('walk'))).toEqual(walk.at);
    expect(tutorialMarker(data, on('fight'))).toBeNull();
    expect(tutorialMarker(data, on(null))).toBeNull();
    expect(tutorialMarker(data, on('walk', 'd1-2'))).toBeNull();
  });

  it("puts the edge arrow on the clear view's border toward the marker, none while it shows", () => {
    const view = { left: 100, top: 50, right: 900, bottom: 550 };
    expect(edgeArrow({ x: 400, y: 300 }, view)).toBeNull();
    expect(edgeArrow({ x: 2000, y: 300 }, view)).toEqual({ x: 900, y: 300, angle: 0 });
    const up = edgeArrow({ x: 500, y: -1000 }, view)!;
    expect([up.x, up.y]).toEqual([500, 50]);
    expect(up.angle).toBeCloseTo(-Math.PI / 2);
  });

  it("draws the marker's beacon, and its arrow only while the spot is off the view", () => {
    const { r } = stage();
    const w = onMap(ringMap());
    const at = { x: w.hero.x, y: w.hero.y };
    const floor = { ...real.floors[0], id: 'ring', markers: [{ id: 'walk', at }] };
    vi.spyOn(getDelveRegistry(), 'getTutorialData').mockReturnValue({
      ...real,
      steps: [step('walk', 'walk')],
      floors: [floor],
    });
    Object.assign(w, {
      tutorialFloor: 'ring',
      tutorial: { step: 'walk', count: 0, misses: 0, tally: {} },
    });
    show(r, w);
    const gfx = r as unknown as { markerGfx: Graphics; arrowGfx: Graphics };
    const drawn = (g: Graphics) => g.context.instructions.length > 0;
    expect([drawn(gfx.markerGfx), drawn(gfx.arrowGfx)]).toEqual([true, false]);
    Object.assign(at, { x: 62, y: 62 });
    r.update(0.1);
    expect([drawn(gfx.markerGfx), drawn(gfx.arrowGfx)]).toEqual([true, true]);
    w.tutorial = null;
    r.update(0.1);
    expect([drawn(gfx.markerGfx), drawn(gfx.arrowGfx)]).toEqual([false, false]);
  });
});

describe("the room objects' moments on the floor", { timeout: 20000 }, () => {
  it('play only where the hero sees them (a crumble at any of its cells), and shake the screen', () => {
    const { r } = stage();
    const w = onMap(ringMap());
    show(r, w);
    const view = r as unknown as { fx: ManaFx; shake: number };
    const infuse = vi.spyOn(view.fx, 'infuse');
    const disperse = vi.spyOn(view.fx, 'disperse');
    const burst: ArpgEvent = {
      kind: 'hazardBurst',
      id: 9,
      hazard: 'brazier',
      element: 'fire',
      x: 10.5,
      y: 8.5,
      radius: 2.5,
    };
    w.fog[8 * 64 + 10] = 1; // seen once, out of sight now
    r.handleEvents([burst]);
    expect([infuse.mock.calls.length, view.shake]).toEqual([0, 0]);
    w.fog[8 * 64 + 10] = 2;
    r.handleEvents([burst]);
    expect(infuse).toHaveBeenCalledTimes(1);
    expect(view.shake).toBeGreaterThan(0);
    const cells = [
      { x: 10, y: 8 },
      { x: 50, y: 50 },
    ];
    w.fog.fill(0);
    r.handleEvents([{ kind: 'crumble', structure: 0, cells }]);
    expect(disperse).not.toHaveBeenCalled();
    w.fog[8 * 64 + 10] = 2;
    r.handleEvents([{ kind: 'crumble', structure: 0, cells }]);
    expect(disperse).toHaveBeenCalledTimes(2);
  });

  it("draws a hazard's glow and telegraph only while the hero sees it", () => {
    const { r } = stage();
    const w = onMap(ringMap());
    show(r, w);
    const ground = () =>
      (r as unknown as { groundFx: { g: Graphics } }).groundFx.g.context.instructions.length;
    const none = ground();
    w.hazards.push({
      type: 'hazard',
      id: 42,
      kind: 'brazier',
      element: 'fire',
      x: 6.5,
      y: 10.5,
      radius: 0.4,
      burst: 2.5,
      state: 'primed',
      until: 0.3,
    });
    r.update(0);
    expect(ground()).toBeGreaterThan(none);
    w.fog[10 * 64 + 6] = 1; // seen once, out of sight now
    r.update(0);
    expect(ground()).toBe(none);
  });
});

describe("the room objects' sprites (C2's RoomSprites)", { timeout: 20000 }, () => {
  it('are loaded with each floor and updated every frame', () => {
    const load = vi.spyOn(RoomSprites.prototype, 'load');
    const update = vi.spyOn(RoomSprites.prototype, 'update');
    const { r } = stage();
    const w = onMap(ringMap());
    show(r, w); // loadFloor draws a still frame, then show draws one
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(w);
    expect(update).toHaveBeenCalledTimes(2);
    r.update(0.1);
    expect(update).toHaveBeenLastCalledWith(w);
    expect(update).toHaveBeenCalledTimes(3);
    load.mockRestore();
    update.mockRestore();
  });
});

describe("the foliage's canopy", () => {
  it('is in the scene above the floor and over the creatures', () => {
    const { r } = stage();
    const w = onMap(ringMap());
    show(r, w);
    const view = r as unknown as {
      root: Container;
      pixelFloor: { sprite: Sprite; canopy: Sprite } | null;
      entities: Container;
    };
    const { root, pixelFloor, entities } = view;
    expect(pixelFloor).not.toBeNull();
    const floorIndex = root.getChildIndex(pixelFloor!.sprite);
    const canopyIndex = root.getChildIndex(pixelFloor!.canopy);
    const entitiesIndex = root.getChildIndex(entities);
    expect(canopyIndex).toBeGreaterThan(floorIndex);
    expect(canopyIndex).toBeGreaterThan(entitiesIndex);
  });

  it('leaves the telegraphs, zones, ground marks and drops above it', () => {
    const { r } = stage();
    show(r, onMap(ringMap()));
    const { root, pixelFloor, groundFx, dropLayer } = r as unknown as {
      root: Container;
      pixelFloor: { canopy: Sprite };
      groundFx: { sprite: Sprite };
      dropLayer: Container;
    };
    const canopy = root.getChildIndex(pixelFloor.canopy);
    expect(root.getChildIndex(groundFx.sprite)).toBeGreaterThan(canopy);
    expect(root.getChildIndex(dropLayer)).toBeGreaterThan(canopy);
  });
});

describe("Settings → Effects' strengths", () => {
  afterEach(() => {
    for (const k of ['shake', 'hitstop', 'flash'] as const) useUIStore.getState().setFx(k, 1);
  });

  it('scales the screen shake and the camera kick; at 0 neither moves', () => {
    const { r } = stage();
    show(r, floor());
    const view = r as unknown as {
      shake: number;
      kick: { x: number; y: number };
      kickCamera(dir: { x: number; y: number }, heft: number): void;
    };
    useUIStore.getState().setFx('shake', 0.5);
    r.addShake(0.2);
    expect(view.shake).toBeCloseTo(0.1);
    view.kickCamera({ x: 1, y: 0 }, 1);
    expect(view.kick.x).toBeCloseTo(0.06); // 0.12 × heft × 0.5
    view.shake = 0;
    view.kick = { x: 0, y: 0 };
    useUIStore.getState().setFx('shake', 0);
    r.addShake(0.5);
    view.kickCamera({ x: 1, y: 0 }, 1);
    expect([view.shake, view.kick.x]).toEqual([0, 0]);
  });

  it("the hero's hurt flash lasts its time × the strength, and is off at 0", () => {
    const { r } = stage();
    const w = floor();
    show(r, w);
    const view = r as unknown as { heroFlashUntil: number; time: number };
    const hurt: ArpgEvent = {
      kind: 'heroHit',
      x: w.hero.x,
      y: w.hero.y,
      amount: 5,
      dodged: false,
      element: null,
    };
    useUIStore.getState().setFx('flash', 0);
    r.handleEvents([hurt]);
    expect(view.heroFlashUntil).toBe(0);
    useUIStore.getState().setFx('flash', 0.5);
    r.handleEvents([hurt]);
    expect(view.heroFlashUntil).toBeCloseTo(view.time + 0.06);
  });
});
