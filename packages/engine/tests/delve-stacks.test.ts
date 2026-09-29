import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import {
  applyStatus,
  hasMark,
  hitMonster,
  isBurning,
  isChilled,
  isFrozen,
  isHexed,
  isPoisoned,
  isRattled,
  isShocked,
  makeCtx,
} from '../src/arpg/combat.js';
import { shieldHero } from '../src/arpg/abilities/defend.js';
import { resolveAbility } from '../src/arpg/abilities/resolve.js';
import { createSandboxWorld, spawnDummies } from '../src/arpg/sandbox.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { ABILITY_WEIGHTS } from '../src/types/ability.js';
import type { ArpgEvent, MonsterEntity } from '../src/types/arpg.js';
import { MANA_TYPES, type ManaType } from '../src/types/mana.js';
import {
  DEFAULT_BUILDS,
  arena,
  bal,
  dummy,
  firstBlow,
  gear,
  press,
  registry,
  run,
  strikeWorld,
  type ArenaOpts,
} from './fixtures/arena.js';

// See the elemental stacks spec. The fixture arena's hero stands at (13, 36); `dummy(x, y)` is
// a sturdy Fire foe (it resists fire) that doesn't fight back.

/** Sturdy foes (one at (13, 20) by default), the hero's basic attack stopped; `m` is the first. */
function setup(monsters: Partial<MonsterEntity>[] = [dummy(13, 20)], opts: ArenaOpts = {}) {
  const w = arena(monsters, { noBasic: true, ...opts });
  const events: ArpgEvent[] = [];
  return { w, events, ctx: makeCtx(registry, w, events), m: w.monsters[0] };
}

describe('balance: delve.stacks', () => {
  it('loads the stack numbers', () => {
    expect(bal.stacks).toEqual({
      cap: 5,
      duration: { fire: 3, frost: 3, storm: 4, earth: 2, shadow: 6, nature: 4 },
      byWeight: [1, 1, 2, 3, 3],
      basicBlow: 1,
      basicFinisher: 2,
      tick: 1,
      curve: [1, 1.8, 2.45, 3, 3.5],
      freezeAt: 3,
      firePerStack: 0.35,
      frostSlowPerStack: 0.2,
      frostSlowCap: 0.6,
      shockPerStack: 0.08,
      hexPerStack: 0.06,
      poisonPerStack: 1.7,
      reactionLockout: 1,
    });
  });

  it('refuses a cap under 1, a weight list not five long, a one-step curve and a slow cap over 1', () => {
    const parses = (stacks: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: { ...balanceData.delve, stacks: { ...balanceData.delve.stacks, ...stacks } },
      }).success;
    expect(parses({})).toBe(true);
    expect(parses({ cap: 0 })).toBe(false);
    expect(parses({ byWeight: [1, 2, 3] })).toBe(false);
    expect(parses({ curve: [1] })).toBe(false);
    expect(parses({ frostSlowCap: 1.5 })).toBe(false);
  });

  it('the status keys the stacks replace are gone', () => {
    expect(Object.keys(bal.status)).toEqual([
      'burnDps',
      'freezeDuration',
      'staggerDuration',
      'blindMiss',
      'blindDuration',
      'poisonDps',
      'rootDuration',
      'rootBossMult',
      'staggerImmunity',
      'freezeImmunity',
      'rootImmunity',
    ]);
  });
});

describe('stacks', () => {
  it("a status adds its element's stacks, to the cap; a stagger adds Earth's only from an Earth source", () => {
    const { ctx, m } = setup();
    applyStatus(ctx, m, 'burn', 100);
    expect(m.status.stacks.fire).toBe(bal.stacks.tick);
    applyStatus(ctx, m, 'burn', 100, false, undefined, 3);
    expect(m.status.stacks.fire).toBe(bal.stacks.tick + 3);
    applyStatus(ctx, m, 'burn', 100, false, undefined, 3);
    expect(m.status.stacks.fire).toBe(bal.stacks.cap);
    applyStatus(ctx, m, 'stagger', 0);
    expect(m.status.stacks.earth).toBe(0);
    applyStatus(ctx, m, 'stagger', 0, true);
    expect(m.status.stacks.earth).toBe(bal.stacks.tick);
  });

  it('a new stack starts its timer again; at the timer all its stacks lapse together, on a dummy too', () => {
    const { w, ctx, m, events } = setup();
    const d = bal.stacks.duration.storm;
    applyStatus(ctx, m, 'shock', 0, false, undefined, 2);
    run(w, d - 1);
    applyStatus(ctx, m, 'shock', 0, false, undefined, 1);
    expect(m.status.stackUntil.storm).toBeCloseTo(w.t + d);
    run(w, d - 0.2);
    expect(m.status.stacks.storm).toBe(3);
    run(w, 0.4);
    expect(m.status.stacks.storm).toBe(0);
    // A lapsed count can't pair: Frost finds no Storm for Superconduct.
    hitMonster(ctx, m, 10, 'frost', { source: 'skill' });
    expect(events.some((e) => e.kind === 'reaction')).toBe(false);

    const sandbox = createSandboxWorld(registry, {
      depth: 3,
      stats: computeHeroStats({}, registry),
      abilities: DEFAULT_BUILDS,
      toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
    });
    const [target] = spawnDummies(registry, sandbox, { layout: 'single', element: null });
    applyStatus(makeCtx(registry, sandbox, []), target, 'hex', 0);
    run(sandbox, bal.stacks.duration.shadow + 0.1);
    expect(target.status.stacks.shadow).toBe(0);
  });

  it('a hit applies `stacks` of each element status it carries (stacks.tick when it names none)', () => {
    const { ctx, m } = setup();
    hitMonster(ctx, m, 10, 'fire', { source: 'skill', applies: ['burn', 'poison'], stacks: 3 });
    expect(m.status.stacks).toMatchObject({ fire: 3, nature: 3 });
    hitMonster(ctx, m, 10, null, { source: 'skill', applies: ['shock'] });
    expect(m.status.stacks.storm).toBe(bal.stacks.tick);
  });

  it("each predicate reads its element's count, and a bare freeze is a frost mark", () => {
    const { w, ctx, m } = setup();
    const on = () =>
      [isBurning, isChilled, isShocked, isRattled, isHexed, isPoisoned].map((is) => is(ctx, m));
    expect(on()).toEqual([false, false, false, false, false, false]);
    for (const e of MANA_TYPES) m.status.stacks[e] = 1;
    expect(on()).toEqual([true, true, true, true, true, true]);
    for (const e of MANA_TYPES) m.status.stacks[e] = 0;
    m.status.freezeUntil = w.t + 1;
    expect(MANA_TYPES.filter((e) => hasMark(ctx, m, e))).toEqual(['frost']);
    expect(isChilled(ctx, m)).toBe(false);
  });
});

describe('what the count does', () => {
  it('a burn deals its ref × firePerStack × the curve a second, every 0.5 s, and stops at 0', () => {
    const { w, ctx, m } = setup([dummy(13, 20, { element: 'shadow' })]); // Shadow: neutral to fire
    applyStatus(ctx, m, 'burn', 100, false, undefined, 3);
    const hp = m.hp;
    const ticks = run(w, 1.1).filter((e) => e.kind === 'hit' && e.source === 'dot');
    expect(ticks).toHaveLength(2);
    expect(hp - m.hp).toBeCloseTo(
      100 * bal.status.burnDps * bal.stacks.firePerStack * bal.stacks.curve[2],
    );
    m.status.stacks.fire = 0;
    expect(run(w, 1).some((e) => e.kind === 'hit')).toBe(false);
  });

  it('frost slows by frostSlowPerStack a stack, up to frostSlowCap', () => {
    const walked = (frost: number) => {
      const w = arena([{ x: 13, y: 20, hp: 1e6, maxHp: 1e6, aggro: true }], { noBasic: true });
      const m = w.monsters[0];
      m.status.stacks.frost = frost;
      m.status.stackUntil.frost = 1e9;
      const y = m.y;
      run(w, 0.5);
      return m.y - y;
    };
    const free = walked(0);
    expect(free).toBeGreaterThan(0);
    expect(walked(1) / free).toBeCloseTo(1 - bal.stacks.frostSlowPerStack);
    expect(walked(2) / free).toBeCloseTo(1 - 2 * bal.stacks.frostSlowPerStack);
    expect(walked(5) / free).toBeCloseTo(1 - bal.stacks.frostSlowCap);
  });

  it("shock and hex make every hit on the foe deal more along the curve; Tempest doubles shock's", () => {
    const dealt = (stacks: Partial<Record<ManaType, number>>, tempest = false) => {
      const { w, ctx, m } = setup();
      if (tempest) w.hero.stats.attunement.storm = bal.mana.masteryThreshold;
      Object.assign(m.status.stacks, stacks);
      return hitMonster(ctx, m, 100, null, { source: 'skill' });
    };
    const plain = dealt({});
    const [c3, c5] = [bal.stacks.curve[2], bal.stacks.curve[4]];
    expect(dealt({ storm: 3 }) / plain).toBeCloseTo(1 + bal.stacks.shockPerStack * c3);
    expect(dealt({ storm: 3 }, true) / plain).toBeCloseTo(1 + 2 * bal.stacks.shockPerStack * c3);
    expect(dealt({ shadow: 5 }) / plain).toBeCloseTo(1 + bal.stacks.hexPerStack * c5);
  });

  it('poison follows the curve, and past its end each stack adds its last step', () => {
    const dealt = (n: number) => {
      const { w, ctx, m } = setup([dummy(13, 20, { element: 'shadow' })]); // neutral to nature
      w.hero.stats.attunement.nature = bal.mana.masteryThreshold; // Plaguebearer: room for 10
      applyStatus(ctx, m, 'poison', 100, false, undefined, n);
      const hp = m.hp;
      run(w, 1.1); // two ticks: a second of poison
      return hp - m.hp;
    };
    const one = 100 * bal.status.poisonDps * bal.stacks.poisonPerStack;
    const c = bal.stacks.curve;
    expect(dealt(1)).toBeCloseTo(one);
    expect(dealt(3)).toBeCloseTo(one * c[2]);
    // Seven stacks: the curve's five, then two steps of its last one (3.5 → 4.5).
    expect(dealt(7)).toBeCloseTo(one * (c[4] + 2 * (c[4] - c[3])));
  });
});

describe('freeze', () => {
  it('frost crossing freezeAt freezes, with immunity after; the stacks stay', () => {
    const { ctx, m, events } = setup();
    applyStatus(ctx, m, 'chill', 0, false, undefined, bal.stacks.freezeAt - 1);
    expect(isFrozen(ctx, m)).toBe(false);
    applyStatus(ctx, m, 'chill', 0, false, undefined, 1);
    expect(isFrozen(ctx, m)).toBe(true);
    expect(m.status.stacks.frost).toBe(bal.stacks.freezeAt);
    expect(m.status.freezeImmuneUntil).toBeCloseTo(
      m.status.freezeUntil + bal.status.freezeImmunity,
    );
    expect(events.filter((e) => e.kind === 'freeze')).toHaveLength(1);
  });

  it("a foe held at freezeAt or more doesn't freeze again; dropping under it and climbing back does", () => {
    const { ctx, m } = setup();
    applyStatus(ctx, m, 'chill', 0, false, undefined, bal.stacks.freezeAt);
    // The freeze and its immunity run out while the stacks stay.
    m.status.freezeUntil = m.status.freezeImmuneUntil = 0;
    applyStatus(ctx, m, 'chill', 0, false, undefined, 1);
    expect(isFrozen(ctx, m)).toBe(false);
    m.status.stacks.frost = bal.stacks.freezeAt - 1; // a pair came off
    applyStatus(ctx, m, 'chill', 0, false, undefined, 1);
    expect(isFrozen(ctx, m)).toBe(true);
  });

  it("Glacier's first hit freezes: its freeze raises frost to freezeAt, and the hit checks once", () => {
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { elements: ['frost', 'earth'] } });
    const events = [...press(w, 0), ...run(w, 1)];
    const m = w.monsters[0];
    expect(events.filter((e) => e.kind === 'freeze')).toHaveLength(1);
    expect(isFrozen(makeCtx(registry, w, []), m)).toBe(true);
    expect(m.status.stacks.frost).toBe(bal.stacks.freezeAt);
  });

  it("a Frost Ward's retaliation freezes an attacker whose chills cross freezeAt", () => {
    const { w, ctx, m } = setup([dummy(13, 35)]); // the fixture's Defensive is a Frost Ward
    w.hero.defend = { form: 'ward', until: 1e9 };
    m.status.stacks.frost = bal.stacks.freezeAt - 1;
    shieldHero(ctx, 10, m, true);
    expect(isFrozen(ctx, m)).toBe(true);
  });
});

describe('stacks per hit', () => {
  const sword = { weapon: gear('fire') };

  it('every blow applies basicBlow stacks, whatever the seed: no roll', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const w = strikeWorld(sword, {});
      w.rng = new SeededRNG(seed);
      firstBlow(w);
      firstBlow(w);
      expect(w.monsters[0].status.stacks.fire, `seed ${seed}`).toBe(2 * bal.stacks.basicBlow);
    }
  });

  it("a finisher applies basicFinisher of the secondary it discharges; Twin Fang's extra hit applies none", () => {
    const pair = { pair: { primary: 'fire', secondary: 'storm' } } as const;
    const fin = strikeWorld(sword, pair, true);
    firstBlow(fin);
    expect(fin.monsters[0].status.stacks).toMatchObject({
      storm: bal.stacks.basicFinisher,
      fire: 0,
    });
    const twin = strikeWorld(sword, { ...pair, legendaries: { twin_fang: 100 } }, true);
    firstBlow(twin);
    expect(twin.monsters[0].status.stacks.storm).toBe(bal.stacks.basicFinisher);
  });

  it("a ranged blow's shot carries its count to what it hits", () => {
    const w = strikeWorld({ weapon: gear('fire', 'weapon', 'staff') }, {}, false, dummy(13, 30));
    firstBlow(w);
    expect(w.projectiles.find((p) => p.owner === 'hero')).toMatchObject({
      applies: ['burn'],
      stacks: bal.stacks.basicBlow,
    });
    w.hero.nextAttackAt = 1e9;
    run(w, 1);
    expect(w.monsters[0].status.stacks.fire).toBe(bal.stacks.basicBlow);
  });

  it("an ability's direct hit applies its weight's stacks", () => {
    const stats = computeHeroStats({}, registry);
    const counts = ABILITY_WEIGHTS.map(
      (weight) =>
        resolveAbility(registry, 'primary', { ...DEFAULT_BUILDS.primary, weight }, stats).stacks,
    );
    expect(counts).toEqual(bal.stacks.byWeight);
    for (const weight of [-2, 0, 2] as const) {
      const w = arena([dummy(13, 30)], { noBasic: true, primary: { weight } });
      press(w, 0);
      run(w, 1);
      expect(w.monsters[0].status.stacks.fire, `weight ${weight}`).toBe(
        bal.stacks.byWeight[weight + 2],
      );
    }
  });

  it('its chain jumps and zone ticks apply stacks.tick', () => {
    const chain = arena([dummy(13, 30), dummy(15, 30)], {
      noBasic: true,
      primary: { elements: ['storm'] },
    });
    press(chain, 0, { x: 13, y: 30 });
    run(chain, 1);
    expect(chain.monsters.map((m) => m.status.stacks.storm)).toEqual([
      bal.stacks.byWeight[2],
      bal.stacks.tick,
    ]);

    const zone = arena([dummy(13, 28)], {
      noBasic: true,
      ultimate: { form: 'maelstrom', payment: 'mana' },
    });
    press(zone, 2, { x: 13, y: 28 });
    run(zone, 0.1); // the first tick
    expect(zone.monsters[0].status.stacks.fire).toBe(bal.stacks.tick);
  });
});
