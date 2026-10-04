import { describe, it, expect } from 'vitest';
import { makeCtx } from '../src/arpg/combat.js';
import { dist } from '../src/arpg/geometry.js';
import { directorOn, flankShare, goalWay } from '../src/arpg/pack.js';
import type { DataRegistry } from '../src/data/registry.js';
import type { ArpgWorld, MonsterEntity, Vec } from '../src/types/arpg.js';
import { arena, bal, STEP } from './fixtures/arena.js';
import { block } from './fixtures/maps.js';
import { ON, packFloor as floor, pass, runWith, withPack } from './fixtures/pack.js';

// The pack director (see the room objects spec's "Smarter packs"): jobs and goals for awake
// foes, ring slots, flankers and the way to a goal. `packFloor` is the fixture's 26 × 40 world
// walled (one room over it all), the hero at (13, 36).

const angleOf = (w: ArpgWorld, p: Vec) => Math.atan2(p.y - w.hero.y, p.x - w.hero.x);

describe('when the director runs', () => {
  it('only on a generated floor: never the open room or a hand-built floor', () => {
    const open = arena([{ aggro: true }]);
    const walled = floor([{}]);
    const built = floor([{}]);
    built.tutorialFloor = 'first';
    expect([directorOn(open), directorOn(walled), directorOn(built)]).toEqual([false, true, false]);
    for (const w of [open, built]) pass(w);
    pass(walled);
    expect([open, walled, built].map((w) => w.monsters[0].job)).toEqual([null, 'ring', null]);
  });

  it('every directorEvery, from the first tick', () => {
    const w = floor([{}]);
    runWith(ON, w, STEP);
    expect(w.monsters[0].job).toBe('ring');
    expect(w.director.nextAt).toBeCloseTo(STEP + bal.ai.pack.directorEvery, 9);
  });

  it('gives no job to a foe asleep, going home or scripted, nor to a boss; its adds have one', () => {
    const w = floor([
      { aggro: false },
      { goingHome: true },
      { kind: 'boss', packId: 0 },
      { packId: 0 },
      { script: { kind: 'slam' } as never },
    ]);
    pass(w);
    expect(w.monsters.map((m) => m.job)).toEqual([null, null, null, 'ring', null]);
  });

  it("leaves a foliage search's goal alone", () => {
    const w = floor([{ search: { at: { x: 3, y: 3 }, until: 9 }, goal: { x: 3, y: 3 } }]);
    pass(w);
    expect(w.monsters[0].goal).toEqual({ x: 3, y: 3 });
  });
});

describe('ring slots', () => {
  it('spread the melee foes evenly round the hero, each at its striking reach', () => {
    const w = floor([
      { x: 12, y: 31 },
      { x: 13, y: 31 },
      { x: 14, y: 31 },
      { x: 13, y: 30 },
    ]);
    pass(w);
    const h = w.hero;
    for (const m of w.monsters) {
      expect(m.job).toBe('ring');
      const reach = h.radius + m.radius + m.attackRange * 0.6;
      expect(dist(h.x, h.y, m.goal!.x, m.goal!.y)).toBeCloseTo(reach, 6);
    }
    const angles = w.monsters.map((m) => angleOf(w, m.goal!)).sort((a, b) => a - b);
    const gaps = angles.map((a, i) => (i ? a - angles[i - 1] : a + 2 * Math.PI - angles[3]));
    for (const g of gaps) expect(g).toBeCloseTo(Math.PI / 2, 6);
  });

  it('bring a pack round the hero, where without them it bunches on one side', () => {
    const spread = (reg: DataRegistry) => {
      // The hero mid-room (away from the leash), the pack north of it.
      const w = floor([
        { x: 12, y: 15 },
        { x: 13, y: 15 },
        { x: 14, y: 15 },
        { x: 13, y: 14 },
      ]);
      w.hero.y = 20;
      runWith(reg, w, 4);
      const angles = w.monsters.map((m) => angleOf(w, m));
      // How far round the hero they reach: the widest angle between two of them.
      return Math.max(
        ...angles.flatMap((a) =>
          angles.map((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))),
        ),
      );
    };
    expect(spread(ON)).toBeGreaterThan(2.5);
    expect(spread(withPack({ ring: { on: false } }))).toBeLessThan(1);
  });

  it('are off with their switch: no job', () => {
    const w = floor([{}]);
    pass(w, withPack({ ring: { on: false } }));
    expect(w.monsters[0]).toMatchObject({ job: null, goal: null });
  });
});

describe('flankers', () => {
  it('flankShare: none at depths 1 and 2, then 0.2 rising 0.02 a depth to 0.5', () => {
    const share = bal.ai.pack.flank.flankShare;
    expect([1, 2, 3, 4, 10, 18, 40].map((d) => flankShare(share, d))).toEqual(
      [0, 0, 0.2, 0.22, 0.34, 0.5, 0.5].map((v) => expect.closeTo(v, 9)),
    );
  });

  /** Five melee foes west of a hero who runs east for `seconds`, at `depth`. */
  const kite = (seconds: number, depth: number, reg = ON) => {
    const w = floor(
      [0, 1, 2, 3, 4].map((i) => ({ x: 2, y: 18 + i })),
      depth,
    );
    w.hero.x = 5;
    w.hero.y = 20;
    runWith(reg, w, seconds, { x: 1, y: 0 });
    return w;
  };
  const flanking = (w: ArpgWorld) => w.monsters.filter((m) => m.job === 'flank');

  it('after kiteTime of the hero running away, a share of the melee foes cut it off ahead, in the room', () => {
    expect(flanking(kite(1.2, 10))).toEqual([]);
    const w = kite(2, 10);
    // 0.34 of five foes.
    expect(flanking(w)).toHaveLength(2);
    for (const m of flanking(w)) {
      expect(m.goal!.x).toBeGreaterThan(w.hero.x + 2);
      expect(m.goal!.x).toBeLessThanOrEqual(25);
    }
    expect(w.monsters.filter((m) => m.job === 'ring')).toHaveLength(3);
  });

  it('none at depth 2, nor with their switch off', () => {
    expect(flanking(kite(2, 2))).toEqual([]);
    expect(flanking(kite(2, 10, withPack({ flank: { ...bal.ai.pack.flank, on: false } })))).toEqual(
      [],
    );
  });

  it('go back to their ring once the hero stops', () => {
    const w = kite(2, 10);
    runWith(ON, w, 0.5);
    expect(flanking(w)).toEqual([]);
  });
});

describe("a goal's way (goalWay)", () => {
  // Rows 30 and 31 a wall but for a gap at columns 0 to 4; the foe below it, its goal above.
  const below = (o: Partial<MonsterEntity>) => {
    const w = floor([{ x: 8, y: 34, goal: { x: 8, y: 26 }, ...o }], 2, block(5, 30, 25, 31));
    return { w, ctx: makeCtx(ON, w, []), m: w.monsters[0] };
  };

  it("a flanker's goal past a wall goes round by its field", () => {
    const { ctx, m } = below({ job: 'flank' });
    const way = goalWay(ctx, m, false)!;
    expect(way.x).toBeLessThan(0);
  });

  it("a search's goal wins over a ring slot's rules", () => {
    const { ctx, m } = below({ job: 'ring', search: { at: { x: 8, y: 26 }, until: 9 } });
    expect(goalWay(ctx, m, false)!.x).toBeLessThan(0);
  });

  it('a ring slot is walked to only near the hero; a flanker near the hero goes for it', () => {
    const { ctx, m } = below({ job: 'ring' });
    expect(goalWay(ctx, m, false)).toBeNull();
    expect(goalWay(ctx, m, true)).toEqual({ x: 0, y: -1 });
    m.job = 'flank';
    expect(goalWay(ctx, m, true)).toBeNull();
  });

  it('a goal in reach and sight is walked straight; a reached one holds', () => {
    const { ctx, m } = below({ job: 'flank', goal: { x: 10, y: 34 } });
    expect(goalWay(ctx, m, false)).toEqual({ x: 1, y: 0 });
    m.goal = { x: 8.1, y: 34 };
    expect(goalWay(ctx, m, false)).toEqual({ x: 0, y: 0 });
  });
});

describe('determinism', () => {
  it('the same floor and the same steering give the same fight', () => {
    const fight = () => {
      const w = floor(
        [0, 1, 2, 3, 4, 5].map((i) => ({ x: 3 + i, y: 10 + (i % 2) })),
        8,
      );
      w.hero.y = 20;
      runWith(ON, w, 2, { x: 0, y: 1 });
      runWith(ON, w, 2, { x: 1, y: 0 });
      return JSON.stringify(w.monsters);
    };
    expect(fight()).toBe(fight());
  });
});
