import { describe, it, expect } from 'vitest';
import { CELL, solidCode, type ArpgEvent, type FloorMap } from '@alloy/engine';
import { paintFog } from '../arena/ArenaRenderer';
import { drawFog } from '../arena/hud/Minimap';
import { solidCell } from '../arena/pixel/world';
import { DamageMeter } from '../training/meter';

// See the room objects spec: the client's readers of the map's cells ask the engine's `solidCode`
// (the pixel floor's worker a mirror of it), and the Training meter counts the hero's hits only.

describe("the client's cell readers", () => {
  it("the pixel floor's mirror is the engine's solidCode, code for code", () => {
    const codes = Object.values(CELL);
    expect(codes.map(solidCell)).toEqual(codes.map(solidCode));
  });

  it('the fog layer lights cover as a wall, from the floor beside it', () => {
    const map = { width: 3, height: 1, cells: Uint8Array.from([0, CELL.cover, 0]) } as FloorMap;
    const out = new Uint8Array(3 * 4);
    paintFog(map, Uint8Array.from([2, 0, 0]), 0, out);
    expect([out[3], out[7], out[11]]).toEqual([0, 0, 255]);
  });

  it("the minimap's fog never draws a solid cell", () => {
    const fills: number[] = [];
    const ctx = {
      fillStyle: '',
      clearRect: () => {},
      fillRect: (x: number) => fills.push(x),
    } as unknown as CanvasRenderingContext2D;
    const cells = Uint8Array.from([0, CELL.cover, CELL.foliage, CELL.slow, CELL.crumbling]);
    const floor = { width: 5, height: 1, cells, fog: new Uint8Array(5).fill(2) };
    drawFog(ctx, floor as never, 1);
    expect(fills).toEqual([0, 2, 3]);
  });
});

describe('the Training meter', () => {
  it("leaves a hazard's burst out", () => {
    const m = new DamageMeter();
    const hit = (amount: number, source: 'basic' | 'hazard'): ArpgEvent => ({
      kind: 'hit',
      id: 1,
      x: 0,
      y: 0,
      amount,
      crit: false,
      element: null,
      heft: 0,
      source,
    });
    m.record([hit(10, 'basic'), hit(500, 'hazard')], 1);
    expect(m.summary(1)).toMatchObject({ total: 10, biggest: 10 });
  });
});
