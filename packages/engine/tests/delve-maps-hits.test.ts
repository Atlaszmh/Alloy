import { describe, it, expect } from 'vitest';
import { hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import { landBlow } from '../src/arpg/basic.js';
import { spawnProjectile } from '../src/arpg/abilities/targeting.js';
import { arena, damaged, dummy, press, registry, run } from './fixtures/arena.js';
import { block, onMap } from './fixtures/maps.js';

// Every hit site needs line of sight (see the floor maps spec's "Line of sight"):
// area hits from their centre, the melee arc and the reactions' splash from the
// one dealing it. Walls here are hand-built, some a single cell thick.

/** Columns 15 and 16 a wall from row 33 down: east of the hero at (13, 36). */
const EAST_WALL = block(15, 33, 16, 39);
/** Row 33 a one-cell wall across the map. */
const ROW_33 = block(0, 33, 25, 33);

describe('area hits', () => {
  it('a Nova strikes the foes its centre sees, not one behind a wall', () => {
    const w = onMap(
      arena([dummy(11, 36), dummy(17.5, 36)], {
        noBasic: true,
        ultimate: { payment: 'mana' },
      }),
      EAST_WALL,
    );
    press(w, 2);
    expect(damaged(w.monsters[0])).toBe(true);
    expect(damaged(w.monsters[1])).toBe(false);
  });

  it('a pull drags only the foes it sees, and a wall stops the drag', () => {
    const w = onMap(
      arena([dummy(3, 36), dummy(20, 36)], {
        noBasic: true,
        ultimate: { payment: 'mana', elements: ['storm', 'earth'] },
      }),
      [...EAST_WALL, [7, 35]],
    );
    press(w, 2);
    // Dragged 0.75 of the way (to 10.5), but the pillar at (7, 35) catches its edge.
    expect(w.monsters[0].x).toBeCloseTo(7 - w.monsters[0].radius, 9);
    expect(w.monsters[1].x).toBe(20);
  });

  it("a Strike's arc doesn't reach through a wall", () => {
    const w = onMap(
      arena([dummy(13, 32.5), dummy(13.6, 34.4)], { noBasic: true, primary: { form: 'strike' } }),
      ROW_33,
    );
    w.hero.y = 35.2;
    press(w, 0, { x: 13, y: 32.5 });
    expect(damaged(w.monsters[0])).toBe(false);
    expect(damaged(w.monsters[1])).toBe(true);
  });

  it("a melee blow doesn't reach through a wall, even at its own target", () => {
    const w = onMap(arena([dummy(13, 32.4)], { noBasic: true }), ROW_33);
    w.hero.y = 34.5;
    const blow = w.hero.stats.weapon.blows[0];
    const ctx = makeCtx(registry, w, []);
    const landed = landBlow(ctx, blow, blow.kind, { x: 0, y: -1 }, 1, {
      targetId: w.monsters[0].id,
    });
    expect(landed).toBe(false);
    expect(damaged(w.monsters[0])).toBe(false);
  });

  it("a blow's Linger zone ticks only the foes it sees", () => {
    const w = onMap(arena([dummy(13, 35), dummy(13, 32.4)], { noBasic: true }), ROW_33);
    w.zones.push({
      ...{ id: 900, owner: 'hero', source: 'linger', ability: null, x: 13, y: 34.2, radius: 2 },
      ...{ born: 0, until: 5, tick: 0.5, nextTick: 0.1, damage: 10, element: 'fire' },
      ...{ detonateAt: 0, dead: false },
    });
    run(w, 0.2);
    expect(damaged(w.monsters[0])).toBe(true);
    expect(damaged(w.monsters[1])).toBe(false);
  });
});

describe('splash and spreads', () => {
  it("a reaction's splash (Overload) reaches the foes the struck one sees", () => {
    const w = onMap(
      arena([dummy(13, 34.4), dummy(11.5, 34.4), dummy(13, 32.4)], { noBasic: true }),
      ROW_33,
    );
    w.monsters[0].status.stacks.fire = 2;
    w.monsters[0].status.stackUntil.fire = 99;
    const events = [] as Parameters<typeof makeCtx>[2];
    hitMonster(makeCtx(registry, w, events), w.monsters[0], 50, 'storm', { source: 'skill' });
    expect(events.some((e) => e.kind === 'reaction' && e.reaction === 'overload')).toBe(true);
    expect(damaged(w.monsters[1])).toBe(true);
    expect(damaged(w.monsters[2])).toBe(false);
  });

  it("Hellfire Brand's blast reaches the neighbours the corpse sees", () => {
    const w = onMap(
      arena([dummy(13, 34.4), dummy(11.5, 34.4), dummy(13, 32.4)], { noBasic: true }),
      ROW_33,
    );
    w.monsters[0].status.brandUntil = 99;
    killMonster(makeCtx(registry, w, []), w.monsters[0]);
    expect(damaged(w.monsters[1])).toBe(true);
    expect(damaged(w.monsters[2])).toBe(false);
  });
});

describe('homing', () => {
  it('a Volley dart never turns toward a foe it can’t see', () => {
    const w = onMap(arena([dummy(17.5, 34)], { noBasic: true }), EAST_WALL);
    const p = spawnProjectile(makeCtx(registry, w, []), {
      ...{ owner: 'hero', form: 'volley', ability: null, homingId: w.monsters[0].id },
      ...{ x: 13, y: 36, vx: 0, vy: -10, radius: 0.25, damage: 1, element: null },
      ...{ pierce: false, maxDist: 20, explodeRadius: 0, applies: [], knockback: 0 },
    });
    run(w, 0.1);
    expect(p.vx).toBe(0);
  });
});
