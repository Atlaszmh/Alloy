import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import {
  applyStatus,
  freeze,
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
  type HitOpts,
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
  STEP,
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

/** The reactions that fired, each with the pairs it consumed. */
const fired = (events: ArpgEvent[]) =>
  events.flatMap((e) => (e.kind === 'reaction' ? [[e.reaction, e.pairs]] : []));

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

  it('stacks lapse before anything in the step: a blow landing as a fire timer runs out finds none stale', () => {
    const w = strikeWorld({ weapon: gear('fire') }, {});
    const m = w.monsters[0];
    run(w, STEP); // the swing starts
    const strikeAt = w.hero.swing!.strikeAt;
    while (w.t + STEP < strikeAt - 1e-9) run(w, STEP); // the next step lands the blow
    // A capped burn with a huge ref, whose timer runs out within that step.
    m.status.stacks.fire = bal.stacks.cap;
    m.status.burnRef = 1e6;
    m.status.stackUntil.fire = w.t + STEP / 2;
    expect(run(w, STEP).some((e) => e.kind === 'basic')).toBe(true);
    // The blow's own count and ref, not the stale five re-armed at 1e6.
    expect(m.status.stacks.fire).toBe(bal.stacks.basicBlow);
    expect(m.status.burnRef).toBeLessThan(1e6);
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

  it('a hit that pairs frost off and re-stacks it past freezeAt re-freezes, once immunity has lapsed', () => {
    const { w, ctx, m, events } = setup();
    const steam = (n: number): HitOpts => ({
      source: 'skill',
      applies: ['burn', 'chill'],
      stacks: n,
    });
    applyStatus(ctx, m, 'chill', 0, false, undefined, bal.stacks.freezeAt); // frozen, then immune
    // Crushing Steam while immune: its Melt takes the three and its chill puts three back, so
    // 3 → 0 → 3 crosses, but immunity refuses the freeze.
    hitMonster(ctx, m, 10, 'fire', steam(3));
    expect(fired(events)).toEqual([['melt', 3]]);
    expect(m.status.stacks.frost).toBe(bal.stacks.freezeAt);
    expect(isFrozen(ctx, m)).toBe(false);
    // Past immunity the same hit re-freezes.
    w.t = m.status.freezeImmuneUntil;
    hitMonster(ctx, m, 10, 'fire', steam(3));
    expect(isFrozen(ctx, m)).toBe(true);
    expect(events.filter((e) => e.kind === 'freeze')).toHaveLength(2);
    // Balanced Steam on two frost: 2 → 0 → 2 never crosses.
    const two = setup();
    two.m.status.stacks.frost = 2;
    hitMonster(two.ctx, two.m, 10, 'fire', steam(2));
    expect(fired(two.events)).toEqual([['melt', 2]]);
    expect(two.m.status.stacks.frost).toBe(2);
    expect(isFrozen(two.ctx, two.m)).toBe(false);
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

describe('pairing', () => {
  it('a hit pairs only with earlier stacks: a fused Steam hit sets up, the next Melts without a phantom freeze', () => {
    const { ctx, m, events } = setup();
    const steam: HitOpts = { source: 'skill', applies: ['burn', 'chill'], stacks: 2 };
    hitMonster(ctx, m, 10, 'fire', steam);
    expect(fired(events)).toEqual([]);
    expect(m.status.stacks).toMatchObject({ fire: 2, frost: 2 });
    hitMonster(ctx, m, 10, 'fire', steam);
    // Its fire goes on, two pairs come off, then its frost: two before and after, no crossing.
    expect(fired(events)).toEqual([['melt', 2]]);
    expect(m.status.stacks).toMatchObject({ fire: 2, frost: 2 });
    expect(isFrozen(ctx, m)).toBe(false);
  });

  it('the first partner in MANA_TYPES order pairs, n is the smaller count, and the rest stays', () => {
    const { ctx, m, events } = setup();
    applyStatus(ctx, m, 'shock', 0, false, undefined, 3);
    applyStatus(ctx, m, 'burn', 100, false, undefined, 1);
    hitMonster(ctx, m, 10, 'frost', { source: 'skill', applies: ['chill'], stacks: 2 });
    // Fire comes before Storm, and has one stack: one pair.
    expect(fired(events)).toEqual([['melt', 1]]);
    expect(m.status.stacks).toMatchObject({ fire: 0, frost: 1, storm: 3 });
  });

  it("the hit's own element counts what the foe already had", () => {
    const { ctx, m, events } = setup();
    m.status.stacks.fire = 2;
    m.status.stacks.frost = 3;
    hitMonster(ctx, m, 10, 'fire', { source: 'skill', stacks: 1 });
    // Two fire on the foe and one from the hit: three pairs with the three frost.
    expect(fired(events)).toEqual([['melt', 3]]);
    expect(m.status.stacks).toMatchObject({ fire: 0, frost: 0 });
  });

  it('a bare freeze is one frost stack to a partner: Earth Shatters it, Fire Melts it, and either ends it', () => {
    for (const [hit, id] of [
      ['earth', 'shatter'],
      ['fire', 'melt'],
    ] as const) {
      const { ctx, m, events } = setup();
      freeze(ctx, m, 5);
      hitMonster(ctx, m, 10, hit, { source: 'skill', stacks: 2 });
      expect(fired(events), hit).toEqual([[id, 1]]);
      expect(isFrozen(ctx, m), hit).toBe(false);
    }
  });

  it('a frost hit pairs no freeze of its own, and its pair never ends one', () => {
    const bare = setup();
    freeze(bare.ctx, bare.m, 5);
    hitMonster(bare.ctx, bare.m, 10, 'frost', { source: 'skill', applies: ['chill'], stacks: 1 });
    expect(fired(bare.events)).toEqual([]);
    expect(isFrozen(bare.ctx, bare.m)).toBe(true);
    // Frost on a rattled frozen foe: Shatter from the frost side, so the freeze holds.
    const rattled = setup();
    freeze(rattled.ctx, rattled.m, 5);
    applyStatus(rattled.ctx, rattled.m, 'stagger', 0, true);
    hitMonster(rattled.ctx, rattled.m, 10, 'frost', { source: 'skill', stacks: 1 });
    expect(fired(rattled.events)).toEqual([['shatter', 1]]);
    expect(isFrozen(rattled.ctx, rattled.m)).toBe(true);
  });

  it("a Twin Fang echo pairs nothing: a Fire Surge's frost finisher and its echo react with nothing on a clean foe", () => {
    const build = { form: 'surge', elements: ['fire'], weight: 0, payment: 'mana' } as const;
    for (const [baseId, foe] of [
      ['sword', dummy(13, 34.5)],
      ['staff', dummy(13, 33)],
    ] as const) {
      const w = strikeWorld(
        { weapon: gear('frost', 'weapon', baseId) },
        { legendaries: { twin_fang: 100 } },
        true,
        foe,
      );
      w.hero.abilities[1] = resolveAbility(registry, 'defensive', build, w.hero.stats);
      w.hero.defend = { form: 'surge', until: 1e9 };
      const events = firstBlow(w);
      w.hero.nextAttackAt = 1e9;
      events.push(...run(w, 1)); // the shots land
      expect(
        events.filter((e) => e.kind === 'hit' && e.source === 'basic'),
        baseId,
      ).toHaveLength(2);
      expect(fired(events), baseId).toEqual([]);
      // The finisher's own fresh stacks stay: the echo didn't Melt them.
      expect(w.monsters[0].status.stacks, baseId).toMatchObject({
        frost: bal.stacks.basicFinisher,
        fire: bal.stacks.basicFinisher,
      });
    }
  });

  it('a killing reaction consumes nothing: what reads the corpse sees its stacks as they were', () => {
    const { w, ctx } = setup([dummy(13, 20, { hp: 1 }), dummy(14.5, 20)]);
    const [a, b] = w.monsters;
    a.status.stacks.frost = 3;
    applyStatus(ctx, a, 'poison', 100, false, undefined, 3);
    applyStatus(ctx, a, 'hex', 0, false, undefined, 2);
    // Fire meets Frost first: Melt, and the hit kills. Plague spreads from the corpse.
    hitMonster(ctx, a, 10, 'fire', { source: 'skill', stacks: 1, spread: true });
    expect(a.dead).toBe(true);
    expect(a.status.stacks).toMatchObject({ frost: 3, nature: 3, shadow: 2 });
    expect(b.status.stacks).toMatchObject({ nature: 3, shadow: 2 });
  });
});

describe('consuming', () => {
  it('a pair ends a freeze only from the partner side, and Superconduct keeps it', () => {
    const onFrozen = (hit: ManaType) => {
      const { ctx, m, events } = setup();
      applyStatus(ctx, m, 'chill', 0, false, undefined, 3); // three frost: frozen
      hitMonster(ctx, m, 10, hit, { source: 'skill', stacks: 1 });
      return [fired(events)[0][0], isFrozen(ctx, m), m.status.stacks.frost];
    };
    expect(onFrozen('fire')).toEqual(['melt', false, 2]);
    expect(onFrozen('earth')).toEqual(['shatter', false, 2]);
    expect(onFrozen('nature')).toEqual(['crystallize', false, 2]);
    expect(onFrozen('shadow')).toEqual(['siphon', false, 2]);
    expect(onFrozen('storm')).toEqual(['superconduct', true, 2]);
  });

  it('a count stops at 0 and its status with it; Soulfire and Blight consume like the rest', () => {
    const soul = setup();
    applyStatus(soul.ctx, soul.m, 'hex', 0, false, undefined, 2);
    hitMonster(soul.ctx, soul.m, 10, 'fire', { source: 'skill', applies: ['burn'], stacks: 1 });
    expect(fired(soul.events)).toEqual([['soulfire', 1]]);
    // Its burn went on and came off with the pair: no burn ticks.
    expect(soul.m.status.stacks).toMatchObject({ shadow: 1, fire: 0 });
    expect(run(soul.w, 1).some((e) => e.kind === 'hit' && e.source === 'dot')).toBe(false);
    const blight = setup();
    applyStatus(blight.ctx, blight.m, 'poison', 100, false, undefined, 2);
    hitMonster(blight.ctx, blight.m, 10, 'shadow', { source: 'skill', stacks: 1 });
    expect(fired(blight.events)).toEqual([['blight', 1]]);
    expect(blight.m.status.stacks.nature).toBe(1);
  });
});

describe('the lockout', () => {
  it('a reaction locks the foe for reactionLockout: stacks build meanwhile, and the next pairs more', () => {
    const { w, ctx, m, events } = setup();
    const frostHit: HitOpts = { source: 'skill', applies: ['chill'], stacks: 1 };
    applyStatus(ctx, m, 'burn', 100, false, undefined, 2);
    hitMonster(ctx, m, 10, 'frost', frostHit); // Melt, one pair
    expect(m.status.reactionLockUntil).toBeCloseTo(w.t + bal.stacks.reactionLockout);
    applyStatus(ctx, m, 'burn', 100, false, undefined, 2);
    hitMonster(ctx, m, 10, 'frost', frostHit);
    hitMonster(ctx, m, 10, 'frost', frostHit);
    expect(fired(events)).toEqual([['melt', 1]]);
    expect(m.status.stacks).toMatchObject({ fire: 3, frost: 2 });
    w.t = m.status.reactionLockUntil;
    hitMonster(ctx, m, 10, 'frost', frostHit);
    expect(fired(events)).toEqual([
      ['melt', 1],
      ['melt', 3],
    ]);
    // The reacting hits carry their pairs too.
    const reacting = events.filter(
      (e): e is Extract<ArpgEvent, { kind: 'hit' }> => e.kind === 'hit' && !!e.reaction,
    );
    expect(reacting.map((e) => e.pairs)).toEqual([1, 3]);
  });

  it("a buff reaction's hero-side cooldown still holds on another foe", () => {
    const { w, ctx, events } = setup([dummy(13, 20), dummy(16, 20)]);
    for (const foe of w.monsters) {
      applyStatus(ctx, foe, 'stagger', 0, true);
      applyStatus(ctx, foe, 'hex', 0);
    }
    hitMonster(ctx, w.monsters[0], 10, 'fire', { source: 'skill' }); // Earth before Shadow: Obsidian
    hitMonster(ctx, w.monsters[1], 10, 'fire', { source: 'skill' }); // Obsidian cools down: Soulfire
    expect(fired(events).map(([id]) => id)).toEqual(['obsidian', 'soulfire']);
  });
});

describe('strength', () => {
  const DAMAGE = [
    ['melt', 'fire', 'frost', 'meltMult'],
    ['shatter', 'earth', 'frost', 'shatterMult'],
    ['combust', 'fire', 'nature', 'combustMult'],
    ['crystallize', 'nature', 'frost', 'crystallizeMult'],
  ] as const;

  it.each(DAMAGE)('%s adds its bonus per pair and takes every pair', (id, hit, partner, mult) => {
    // Shadow foes: neutral to all four hits and to Combust's Fire splash.
    const foes = () =>
      setup([dummy(13, 20, { element: 'shadow' }), dummy(14.5, 20, { element: 'shadow' })]);
    const p = foes();
    const plain = hitMonster(p.ctx, p.m, 100, hit, { source: 'skill', stacks: 1 });
    for (const n of [1, 2, 3]) {
      const { w, ctx, m, events } = foes();
      m.status.stacks[partner] = n;
      if (id === 'shatter') freeze(ctx, m, 5); // Earth shatters only a freeze
      const dealt = hitMonster(ctx, m, 100, hit, { source: 'skill', stacks: n });
      expect(fired(events), `n ${n}`).toEqual([[id, n]]);
      expect(dealt / plain, `n ${n}`).toBeCloseTo(1 + (bal.reactions[mult] - 1) * n);
      expect(m.status.stacks[partner], `n ${n}`).toBe(0);
      // Combust's splash deals the same amount.
      if (id === 'combust') expect(w.monsters[1].maxHp - w.monsters[1].hp).toBeCloseTo(dealt);
    }
  });

  it("Overload's blast grows with the pairs", () => {
    const blast = (n: number) => {
      const { w, ctx, m } = setup([dummy(13, 20), dummy(14.5, 20)]);
      m.status.stacks.fire = n;
      hitMonster(ctx, m, 100, 'storm', { source: 'skill', stacks: n });
      return w.monsters[1].maxHp - w.monsters[1].hp;
    };
    expect(blast(2) / blast(1)).toBeCloseTo(2);
    expect(blast(3) / blast(1)).toBeCloseTo(3);
  });

  it('a boss takes the full per-pair scaling', () => {
    const melt = (n: number) => {
      const { ctx, m } = setup([dummy(13, 20, { kind: 'boss', element: 'shadow' })]);
      m.status.stacks.frost = n;
      return hitMonster(ctx, m, 100, 'fire', { source: 'skill', stacks: 3 });
    };
    expect(melt(3) / melt(0)).toBeCloseTo(1 + (bal.reactions.meltMult - 1) * 3);
  });

  const EFFECT = [
    ['superconduct', 'storm', 'frost'],
    ['soulfire', 'shadow', 'fire'],
    ['obsidian', 'fire', 'earth'],
    ['lightning_rod', 'storm', 'earth'],
    ['sunder', 'shadow', 'earth'],
    ['seedling', 'earth', 'nature'],
    ['siphon', 'shadow', 'frost'],
    ['blackout', 'storm', 'shadow'],
    ['galvanize', 'storm', 'nature'],
  ] as const;

  it.each(EFFECT)('%s fires once, whatever the pairs, and takes one', (id, hit, partner) => {
    const outcome = (n: number) => {
      const { w, ctx, m, events } = setup([dummy(13, 20), dummy(14.5, 20)]);
      const h = w.hero;
      // Room for each effect to show: a heal, a dodge to give back, a cooldown to cut.
      h.hp = 1;
      h.dodgeCharges = 0;
      h.cooldowns[0] = 5;
      m.status.stacks[partner] = n;
      const dealt = hitMonster(ctx, m, 100, hit, { source: 'skill', stacks: n });
      expect(fired(events), `n ${n}`).toEqual([[id, 1]]);
      // One pair comes off; the rest of the partner's stacks stay.
      expect(m.status.stacks[partner], `n ${n}`).toBe(n - 1);
      // Only the partner's own stacks change the hit: a hexed foe takes more from every hit.
      const taken =
        1 + (partner === 'shadow' ? bal.stacks.hexPerStack * bal.stacks.curve[n - 1] : 0);
      return {
        hit: dealt / taken,
        barrier: h.barrier?.hp,
        dodges: h.dodgeCharges,
        quick: h.quickUntil,
        cooldown: h.cooldowns[0],
        drops: w.drops.map((d) => d.kind),
        frozen: isFrozen(ctx, m),
        sunder: m.status.sunderUntil,
        blind: w.monsters.map((foe) => foe.status.blindUntil),
      };
    };
    const once = outcome(1);
    const thrice = outcome(3);
    expect(thrice.hit).toBeCloseTo(once.hit);
    expect({ ...thrice, hit: 0 }).toEqual({ ...once, hit: 0 });
  });

  it('Blight spreads the counts the foe had before its pair came off, and takes one pair', () => {
    const { w, ctx, m, events } = setup([dummy(13, 20), dummy(14.5, 20)]);
    applyStatus(ctx, m, 'poison', 100, false, undefined, 3);
    hitMonster(ctx, m, 10, 'shadow', { source: 'skill', applies: ['hex'], stacks: 2 });
    expect(fired(events)).toEqual([['blight', 1]]);
    expect(w.monsters[1].status.stacks).toMatchObject({ nature: 3, shadow: 0 });
    expect(m.status.stacks).toMatchObject({ nature: 2, shadow: 1 });
  });

  it('Catalyst scales the bonus, not the hit', () => {
    const dealt = (catalyst: number, n: number) => {
      const { w, ctx, m } = setup();
      w.hero.stats.legendaries.catalyst = catalyst;
      m.status.stacks.frost = n;
      return hitMonster(ctx, m, 100, 'fire', { source: 'skill', stacks: n });
    };
    const hit = dealt(0, 1) / bal.reactions.meltMult; // one pair: ×meltMult
    expect(dealt(50, 2) / hit).toBeCloseTo(1 + (bal.reactions.meltMult - 1) * 2 * 1.5);
  });
});
