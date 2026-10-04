import { describe, it, expect } from 'vitest';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { interactTick } from '../src/arpg/interact.js';
import { footprints, offFootprints } from '../src/arpg/objects.js';
import type { ArpgWorld, PropEntity } from '../src/types/arpg.js';
import { arena, dummy, registry } from './fixtures/arena.js';
import { block, onMap } from './fixtures/maps.js';

// See the room objects spec's "Footprints": drop placement treats every standing prop's and
// hazard's footprint as blocked, so a drop never lands under one.

const crate = (id: number, x: number, y: number): PropEntity => ({
  type: 'prop',
  id,
  kind: 'crate',
  x,
  y,
  radius: 0.4,
  life: 1,
  dead: false,
});

/** Crates on every cell within two of (cx, cy) but its own. */
const ringOfCrates = (cx: number, cy: number): PropEntity[] =>
  block(cx - 2, cy - 2, cx + 2, cy + 2)
    .filter(([x, y]) => x !== cx || y !== cy)
    .map(([x, y], i) => crate(i + 1, x + 0.5, y + 0.5));

/** Whether every drop on the world stands outside the footprints. */
const offAll = (w: ArpgWorld) => {
  const taken = footprints(w);
  return w.drops.every((d) => !taken.has(Math.floor(d.y) * w.width + Math.floor(d.x)));
};

describe('offFootprints', () => {
  it('leaves a spot alone when no object stands on its cell', () => {
    const w = arena([]);
    const at = { x: 5.3, y: 5.8 };
    expect(offFootprints(w, { x: 8.5, y: 5.5 }, at)).toBe(at);
    w.props = [crate(1, 9.5, 9.5)];
    expect(offFootprints(w, { x: 8.5, y: 5.5 }, at)).toBe(at);
  });

  it('moves one under an object to the nearest free cell (its centre) that the thrower sees', () => {
    const w = onMap(arena([]), []);
    w.props = [crate(1, 5.5, 5.5)];
    const at = { x: 5.3, y: 5.8 };
    expect(offFootprints(w, { x: 8.5, y: 5.5 }, at)).toEqual({ x: 5.5, y: 6.5 });
    // A wall on that cell: the next nearest.
    w.map.cells[6 * w.width + 5] = 1;
    expect(offFootprints(w, { x: 8.5, y: 5.5 }, at)).toEqual({ x: 4.5, y: 5.5 });
    // Thrown from below a wall (row 7, x 3 to 7): only what the thrower sees.
    const v = onMap(arena([]), block(3, 7, 7, 7));
    v.props = [crate(1, 5.5, 5.5)];
    expect(offFootprints(v, { x: 5.5, y: 8.5 }, at)).toEqual({ x: 5.5, y: 8.5 });
  });
});

describe('drops', () => {
  it("a slain boss's items, mote, orbs, scrap, materials and rune all land off the footprints", () => {
    const w = arena([dummy(13.5, 20.5, { kind: 'boss' })]);
    w.props = ringOfCrates(13, 20);
    killMonster(makeCtx(registry, w, []), w.monsters[0]);
    const kinds = new Set(w.drops.map((d) => d.kind));
    expect([...kinds].sort()).toEqual(
      expect.arrayContaining(['item', 'material', 'mote', 'orb', 'rune', 'scrap']),
    );
    expect(offAll(w)).toBe(true);
  });

  it("a vault chest's haul lands off the footprints", () => {
    const w = onMap(arena([]), []);
    w.map.rooms[0].interactable = { id: '2:0', kind: 'chest', x: 13.5, y: 30.5, used: false };
    Object.assign(w.hero, { x: 13.5, y: 30.5 });
    w.props = ringOfCrates(13, 30);
    w.queuedInteract = true;
    interactTick(makeCtx(registry, w, []));
    expect(w.drops.length).toBeGreaterThan(0);
    expect(offAll(w)).toBe(true);
  });
});
