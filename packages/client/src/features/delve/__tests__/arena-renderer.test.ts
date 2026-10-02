import { describe, it, expect, afterEach } from 'vitest';
import { Container, type Application, type Graphics } from 'pixi.js';
import {
  computeHeroStats,
  createSandboxWorld,
  defaultChains,
  type ArpgEvent,
  type ArpgWorld,
  type Drop,
  type GearItem,
} from '@alloy/engine';
import {
  ArenaRenderer,
  drawDrop,
  dropLabel,
  dropPop,
  holdPing,
  pickupColor,
  pruneViews,
} from '../arena/ArenaRenderer';
import { MANA_HEX, RARITY_HEX } from '../arena/palette';
import { runeHex } from '../arena/fx/runes';
import { getDelveRegistry } from '../registry';
import { spritePixelScale } from '../arena/camera';
import { useUIStore } from '@/stores/uiStore';

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
    renderer: { render() {}, resolution: res },
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

  it('a point round-trips through the screen at each scale', () => {
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
          Object.assign(w.hero, { x, y });
          r.update(0);
          const s = r.heroScreen()!;
          const back = r.screenToWorld(s.x, s.y);
          expect(back.x, `${height}p ×${res}`).toBeCloseTo(x, 6);
          expect(back.y).toBeCloseTo(y, 6);
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
    const def = getDelveRegistry().getRune('split');
    expect(dropLabel(drop({ kind: 'rune', rune: split }))).toEqual({
      text: `${def.icon} Split III`,
      color: runeHex(split),
    });
    expect(
      pickupColor({ kind: 'pickup', dropId: 1, dropKind: 'rune', amount: 0, rune: split }),
    ).toBe(runeHex(split));
  });

  it('names rare, epic and legendary items and runes, nothing else', () => {
    const item = (rarity: GearItem['rarity']) =>
      drop({ kind: 'item', item: { name: 'Sunfang', rarity } as GearItem });
    expect(dropLabel(item('legendary'))).toEqual({ text: 'Sunfang', color: RARITY_HEX.legendary });
    expect(dropLabel(item('magic'))).toBeNull();
    expect(dropLabel(drop({}))).toBeNull();
  });
});
