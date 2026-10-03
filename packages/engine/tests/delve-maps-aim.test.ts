import { describe, it, expect } from 'vitest';
import { makeCtx } from '../src/arpg/combat.js';
import { lineOfSight } from '../src/arpg/grid.js';
import { aimPoint, bestCluster, muzzle, nearestMonster } from '../src/arpg/abilities/targeting.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import { arena, damaged, dummy, moveOf, press, registry } from './fixtures/arena.js';
import { WALL_30, onMap } from './fixtures/maps.js';

// Aiming on the grid (see the floor maps spec's "Line of sight"): targets the hero
// can't see aren't picked, an aim point is clipped to its sight, Blink and beams
// stop at the first wall, a shot never leaves from inside one. The hero stands at
// (13, 36), below a wall on rows 30 and 31 (its face at y = 32).

describe('targets in sight', () => {
  it('the nearest foe and the best cluster are ones the hero sees', () => {
    const w = onMap(
      arena([dummy(13, 27), dummy(12.5, 27), dummy(13.5, 27), dummy(4, 34)], { noBasic: true }),
      WALL_30,
    );
    const ctx = makeCtx(registry, w, []);
    expect(nearestMonster(ctx, 13, 36, 20)?.id).toBe(w.monsters[3].id);
    expect(bestCluster(ctx, 20, 2)?.id).toBe(w.monsters[3].id);
    w.monsters[3].dead = true;
    expect(nearestMonster(ctx, 13, 36, 20)).toBeNull();
    expect(bestCluster(ctx, 20, 2)).toBeNull();
  });

  it('a directional move with only foes behind a wall fails for free', () => {
    const w = onMap(arena([dummy(13, 27)], { noBasic: true }), WALL_30);
    const mana = w.hero.mana;
    press(w, 0);
    expect(w.projectiles).toEqual([]);
    expect(w.hero.mana).toBe(mana);
  });
});

describe('the aim point', () => {
  it('is clipped to the hero’s sight: a lob lands this side of the wall', () => {
    const w = onMap(arena([dummy(2, 2)], { noBasic: true, primary: { form: 'burst' } }), WALL_30);
    const p = aimPoint(makeCtx(registry, w, []), moveOf(w, 0), { x: 13, y: 26 })!;
    expect(p.x).toBeCloseTo(13, 9);
    expect(p.y).toBeGreaterThan(32);
    expect(p.y).toBeCloseTo(32, 5);
    // In the open room, as before: clamped to the move's range (8).
    const open = arena([dummy(2, 2)], { noBasic: true, primary: { form: 'burst' } });
    expect(aimPoint(makeCtx(registry, open, []), moveOf(open, 0), { x: 13, y: 26 })).toEqual({
      x: 13,
      y: 28,
    });
  });

  it("each of Barrage's impacts lands where the aim point sees", () => {
    const w = onMap(
      arena([dummy(2, 2)], {
        noBasic: true,
        ultimate: { form: 'barrage', payment: 'mana' },
      }),
      WALL_30,
    );
    const aim = { x: 13, y: 32.6 };
    press(w, 2, aim);
    const impacts = w.zones.filter((z) => z.source === 'barrage');
    expect(impacts.length).toBe(moveOf(w, 2).count);
    for (const z of impacts) expect(lineOfSight(w.map, aim, z), `${z.x}, ${z.y}`).toBe(true);
  });
});

describe('Blink and beams', () => {
  it('Blink lands before the first wall on its line', () => {
    const w = onMap(arena([dummy(2, 2)], { noBasic: true, defensive: { form: 'blink' } }), WALL_30);
    w.hero.y = 34;
    press(w, 1, { x: 13, y: 20 });
    expect(w.hero.x).toBeCloseTo(13, 9);
    expect(w.hero.y).toBeCloseTo(32 + w.hero.radius, 5);
  });

  it('Blink never slips round a pillar its line runs into', () => {
    const w = onMap(arena([dummy(2, 2)], { noBasic: true, defensive: { form: 'blink' } }), [
      [12, 33],
    ]);
    w.hero.x = 10.5;
    w.hero.y = 35.2;
    press(w, 1, { x: 14.5, y: 31.2 });
    expect(w.hero.x).toBeLessThan(12.5);
    expect(w.hero.y).toBeGreaterThan(34);
  });

  it('a Lance beam ends at the wall and strikes nothing behind it', () => {
    const w = onMap(
      arena([dummy(13, 32.9), dummy(13, 28)], { noBasic: true, primary: { form: 'lance' } }),
      WALL_30,
    );
    w.hero.y = 34;
    const events: ArpgEvent[] = press(w, 0, { x: 13, y: 20 });
    const beam = events.find((e) => e.kind === 'beam');
    expect(beam && beam.kind === 'beam' && beam.ty).toBeCloseTo(32, 5);
    expect(damaged(w.monsters[0])).toBe(true);
    expect(damaged(w.monsters[1])).toBe(false);
  });
});

describe('the muzzle', () => {
  it('a shot leaves from the hero itself when its muzzle is in a wall', () => {
    const w = onMap(arena([dummy(2, 2)], { noBasic: true }), WALL_30);
    w.hero.y = 32.4;
    const ctx = makeCtx(registry, w, []);
    expect(muzzle(ctx, { x: 0, y: -1 }, 0.6)).toEqual({ x: 13, y: 32.4 });
    expect(muzzle(ctx, { x: 0, y: 1 }, 0.6)).toEqual({ x: 13, y: 33 });
  });
});
