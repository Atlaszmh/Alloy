import { describe, it, expect } from 'vitest';
import { sees } from '../src/arpg/grid.js';
import { laneOpen } from '../src/arpg/pack.js';
import { CELL } from '../src/types/floor-map.js';
import type { ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import { bal } from './fixtures/arena.js';
import { block, walledMap } from './fixtures/maps.js';
import { ON, packFloor, runWith, withPack } from './fixtures/pack.js';

// Chargers (see the room objects spec's "Smarter packs"): they charge only down an open lane,
// and a dash that meets cover or a wall stuns them and slams them. The hero mid-room at (13, 20).

const OFF = withPack({ charge: { ...bal.ai.pack.charge, on: false } });

/** A charger (radius 0.9) at (13, y), with `cover` cells; the hero at (13, 20). */
function chargerAt(y: number, cover: [number, number][] = [], o: Partial<MonsterEntity> = {}) {
  const w = packFloor([
    { x: 13, y, ai: 'charger', radius: 0.9, hp: 100, maxHp: 100, damage: 10, ...o },
  ]);
  w.hero.y = 20;
  for (const [x, cy] of cover) w.map.cells[cy * w.map.width + x] = CELL.cover;
  return w;
}

describe('laneOpen', () => {
  it('is a circle swept down the segment: a cell beside the line of sight can block it', () => {
    const map = walledMap(26, 40, [[12, 17]]);
    const [a, b] = [
      { x: 13.5, y: 12 },
      { x: 13.5, y: 20 },
    ];
    expect(sees(map, a, b)).toBe(true);
    expect(laneOpen(map, a, b, 0.5)).toBe(true);
    expect(laneOpen(map, a, b, 0.9)).toBe(false);
    expect(laneOpen(walledMap(26, 40, [[13, 17]]), a, b, 0.1)).toBe(false);
  });
});

describe('a charger', () => {
  const windsUp = (w: ArpgWorld, reg = ON) => {
    runWith(reg, w, 0.1);
    return w.monsters[0].windupUntil > 0;
  };

  it('winds up only down an open lane (as before with its switch off)', () => {
    expect(windsUp(chargerAt(14))).toBe(true);
    expect(windsUp(chargerAt(14, [[12, 17]]))).toBe(false);
    expect(windsUp(chargerAt(14, [[12, 17]]), OFF)).toBe(true);
  });

  it('meeting a wall or cover mid-dash is stunned and slammed', () => {
    for (const cover of [false, true]) {
      // Rows 8 and 9 wall (or cover) across the room; the charger dashes north into them.
      const cells = block(0, 8, 25, 9);
      const w = chargerAt(12, cover ? cells : [], {
        chargeUntil: 1,
        chargeDir: { x: 0, y: -1 },
      });
      if (!cover) for (const [x, y] of cells) w.map.cells[y * w.map.width + x] = CELL.wall;
      const events = runWith(ON, w, 0.3);
      const m = w.monsters[0];
      const stun = events.find((e) => e.kind === 'chargeStun');
      expect(stun).toMatchObject({ id: m.id });
      expect(m.chargeUntil).toBeLessThan(w.t);
      expect(m.status.staggerUntil).toBeGreaterThan(w.t + bal.ai.pack.charge.chargeStun - 0.3);
      expect(m.hp).toBe(100 - 10 * bal.ai.pack.charge.chargeSlam);
      expect(m.y).toBeCloseTo(10.9, 6);
    }
  });

  it('with its switch off dashes on along the wall, unharmed', () => {
    const w = chargerAt(12, [], { chargeUntil: 1, chargeDir: { x: 0, y: -1 } });
    for (const [x, y] of block(0, 8, 25, 9)) w.map.cells[y * w.map.width + x] = CELL.wall;
    const events = runWith(OFF, w, 0.3);
    expect(events.some((e) => e.kind === 'chargeStun')).toBe(false);
    expect(w.monsters[0]).toMatchObject({ hp: 100, chargeUntil: 1 });
  });
});
