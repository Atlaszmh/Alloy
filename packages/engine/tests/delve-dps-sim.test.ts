import { describe, it, expect, vi } from 'vitest';
import { applyStatus, hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import {
  beatFor,
  defaultBasic,
  defaultChains,
  resolveChain,
} from '../src/arpg/abilities/resolve.js';
import {
  DPS_SECONDS,
  RUNE_SEEDS,
  dpsCombos,
  dpsKey,
  runeComboSetups,
  simulateDps,
  type DpsOptions,
  type DpsSetup,
} from '../src/arpg/dps-sim.js';
import { sandboxWeapon } from '../src/arpg/sandbox.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { runeFits } from '../src/loot/runes.js';
import type { ArpgEvent, ArpgInput, ArpgWorld } from '../src/types/arpg.js';
import type { DelveBalance } from '../src/types/delve.js';
import { arena, bal, dummy, gear, registry, run } from './fixtures/arena.js';

type Hit = Extract<ArpgEvent, { kind: 'hit' }>;

/** The default data with its Delve balance changed by `change`. */
function registryWith(change: (bal: DelveBalance) => void): DataRegistry {
  const d = loadAndValidateData();
  change(d.balance.delve);
  return new DataRegistry(d);
}
/** The runes without their price: every load zeroed (see the rune costs spec). */
const unloaded = registryWith((b) => {
  b.runes.load.bySlot = { primary: 0, defensive: 0, ultimate: 0 };
});

/** The hits of one source (the Training meter buckets by source first). */
function hitsFrom(events: ArpgEvent[], source: Hit['source']): Hit[] {
  return events.filter((e): e is Hit => e.kind === 'hit' && e.source === source);
}

function ctxOf(w: ArpgWorld) {
  const events: ArpgEvent[] = [];
  return { ctx: makeCtx(registry, w, events), events };
}

/** Two sturdy foes 1.5 apart, and a hero that never swings. */
function pair(): ArpgWorld {
  return arena([dummy(13, 30), dummy(14.5, 30)], { noBasic: true });
}

describe('hit attribution', () => {
  it("an ability's Overload and Combust splash carry its slot, as reaction hits", () => {
    // Fire on a shocked foe sets off Overload; on a poisoned one, Combust.
    for (const mark of ['shock', 'poison'] as const) {
      const w = pair();
      const { ctx, events } = ctxOf(w);
      const [a, b] = w.monsters;
      applyStatus(ctx, a, mark, 100);
      hitMonster(ctx, a, 100, 'fire', { source: 'skill', slot: 0 });
      expect(hitsFrom(events, 'reaction').map((e) => [e.id, e.slot])).toEqual([[b.id, 0]]);
    }
  });

  it("a burn ticks with the slot that set its damage, and a basic's with none", () => {
    const w = pair();
    const { ctx } = ctxOf(w);
    const m = w.monsters[0];
    hitMonster(ctx, m, 100, 'fire', { source: 'skill', slot: 2, applies: ['burn'] });
    // A basic's weaker burn refreshes it, but the Ultimate's damage is what ticks.
    hitMonster(ctx, m, 10, 'fire', { source: 'basic', applies: ['burn'] });
    const ticks = hitsFrom(run(w, 1), 'dot');
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((e) => e.slot === 2)).toBe(true);
    // A stronger basic burn takes the ticks over.
    hitMonster(ctx, m, 1000, 'fire', { source: 'basic', applies: ['burn'] });
    const after = hitsFrom(run(w, 1), 'dot');
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((e) => e.slot === undefined)).toBe(true);
  });

  it('a poison spread by Blight keeps the slot that set it', () => {
    const w = pair();
    const { ctx } = ctxOf(w);
    const [a, b] = w.monsters;
    hitMonster(ctx, a, 100, 'nature', { source: 'skill', slot: 0, applies: ['poison'] });
    // Shadow on the poisoned foe sets off Blight, which spreads its poison.
    hitMonster(ctx, a, 100, 'shadow', { source: 'skill', slot: 2 });
    const ticks = hitsFrom(run(w, 1), 'dot').filter((e) => e.id === b.id);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((e) => e.slot === 0)).toBe(true);
  });

  it("Fire mastery's corpse flames keep the burn's slot", () => {
    const w = pair();
    w.hero.stats = computeHeroStats({ weapon: gear('fire') }, registry, {
      attunement: { fire: 10 },
    });
    const { ctx } = ctxOf(w);
    const [a, b] = w.monsters;
    hitMonster(ctx, a, 100, 'fire', { source: 'skill', slot: 0, applies: ['burn'] });
    killMonster(ctx, a);
    expect(b.status.burnSlot).toBe(0);
  });
});

/**
 * The sims' events, and each step's input, whether a wind-up ran before it, the slot whose hold
 * runs after it and its events, collected while `tap.on` is set (`stepWorld` itself is unchanged).
 */
const tap = vi.hoisted(() => ({
  on: false,
  events: [] as ArpgEvent[],
  steps: [] as {
    input: ArpgInput;
    windup: boolean;
    hold: number | null;
    events: ArpgEvent[];
    /** The hero's mana and charge meters before the step. */
    mana: number;
    charge: number[];
  }[],
  /** The world the last step ran on. */
  world: null as ArpgWorld | null,
}));
vi.mock('../src/arpg/step.js', async (importOriginal) => {
  const step = await importOriginal<typeof import('../src/arpg/step.js')>();
  return {
    ...step,
    stepWorld: (...args: Parameters<typeof step.stepWorld>) => {
      const h = args[1].hero;
      const windup = h.windup !== null;
      const [mana, charge] = [h.mana, [...h.charge]];
      const events = step.stepWorld(...args);
      if (tap.on) {
        tap.world = args[1];
        tap.events.push(...events);
        tap.steps.push({
          input: args[2],
          windup,
          hold: h.hold?.slot ?? null,
          events,
          mana,
          charge,
        });
      }
      return events;
    },
  };
});

/** Run `f`, collecting every event its sims step through, each step and the last world (see `tap`). */
function recorded<T>(f: () => T): {
  out: T;
  events: ArpgEvent[];
  steps: typeof tap.steps;
  world: ArpgWorld | null;
} {
  tap.events = [];
  tap.steps = [];
  tap.world = null;
  tap.on = true;
  try {
    return { out: f(), events: tap.events, steps: tap.steps, world: tap.world };
  } finally {
    tap.on = false;
  }
}

const grid = dpsCombos(registry);
const byKey = new Map(grid.map((s) => [dpsKey(s), s]));
function setup(key: string): DpsSetup {
  const s = byKey.get(key);
  if (!s) throw new Error(`No combo ${key}`);
  return s;
}
const ONE: DpsOptions = { depth: 10, pack: false };
const PACK: DpsOptions = { depth: 10, pack: true };
const sum = (hits: Hit[]) => hits.reduce((total, e) => total + e.amount, 0);

/** DPS between two sample times (`series` is a running average). */
function windowDps(series: number[], from: number, to: number): number {
  const dealt = (t: number) => series[t / 0.5 - 1] * t;
  return (dealt(to) - dealt(from)) / (to - from);
}

describe('dpsCombos', () => {
  it('252 basic combos, 4,320 one-move chains and 1,080 default chains, each with its own key', () => {
    expect(grid.filter((s) => s.view === 'basic')).toHaveLength(252);
    const abilities = grid.filter((s) => s.view === 'ability');
    expect(abilities.filter((s) => s.dims.kind !== 'default')).toHaveLength(4320);
    expect(abilities.filter((s) => s.dims.kind === 'default')).toHaveLength(1080);
    // Primary and Ultimate forms only.
    expect([...new Set(abilities.map((s) => s.dims.form))]).toEqual([
      'bolt',
      'volley',
      'lance',
      'burst',
      'strike',
      'whirl',
      'nova',
      'onslaught',
      'barrage',
      'maelstrom',
    ]);
    expect(new Set(grid.map(dpsKey)).size).toBe(grid.length);
  });

  it('a setup carries its whole loadout, labelled by its dimensions', () => {
    expect(setup('basic|bow|storm|fire')).toEqual({
      view: 'basic',
      dims: { weapon: 'bow', primary: 'storm', secondary: 'fire' },
      weapon: { baseId: 'bow', primary: 'storm', secondary: 'fire' },
      chains: {
        ...defaultChains(registry, 'storm', 'bow'),
        basic: defaultBasic(registry, 'bow', 'storm', 'fire'),
      },
      hold: 'attack',
    });
    // Ordered pairs: Frost+Fire is its own build, on a sword with that pair and its basics.
    const frostFire = {
      ...defaultChains(registry, 'frost', 'sword'),
      basic: defaultBasic(registry, 'sword', 'frost', 'fire'),
    };
    expect(setup('ability|nova|frost|fire|hold|charge')).toEqual({
      view: 'ability',
      dims: { form: 'nova', first: 'frost', second: 'fire', kind: 'hold', payment: 'charge' },
      weapon: { baseId: 'sword', primary: 'frost', secondary: 'fire' },
      chains: {
        ...frostFire,
        ultimate: {
          moves: [{ kind: 'hold', form: 'nova', elements: ['frost', 'fire'] }],
          payment: 'charge',
        },
      },
      hold: { slot: 2 },
    });
    // A form's default chain: what a held button plays.
    expect(setup('ability|strike|frost|fire|default|mana').chains.primary).toEqual({
      moves: ['medium', 'medium', 'heavy', 'heavy'].map((kind) => ({
        kind,
        form: 'strike',
        elements: ['frost', 'fire'],
      })),
      payment: 'mana',
    });
  });
});

describe('simulateDps', () => {
  it('gives the same result for the same setup', () => {
    const s = setup('ability|barrage|storm|nature|heavy|cast');
    expect(simulateDps(registry, s, PACK)).toEqual(simulateDps(registry, s, PACK));
  });

  it('every weapon strikes and deals damage, sampled every half second', () => {
    for (const base of registry.getGearBasesForSlot('weapon')) {
      const r = simulateDps(registry, setup(`basic|${base.id}|fire|none`), ONE);
      expect(r.series).toHaveLength(60);
      expect(r.dps).toBe(r.series[59]);
      expect(r.dps).toBeGreaterThan(0);
      expect(r.casts).toBeGreaterThan(0);
    }
  });

  it('a Fire basic run counts its strikes, and its burn ticks on top of its blows', () => {
    const { out, events } = recorded(() =>
      simulateDps(registry, setup('basic|sword|fire|none'), ONE),
    );
    expect(out.casts).toBe(events.filter((e) => e.kind === 'basic').length);
    expect(hitsFrom(events, 'dot').length).toBeGreaterThan(0);
    expect(out.dps * DPS_SECONDS).toBeGreaterThan(sum(hitsFrom(events, 'basic')));
  });

  it("holds positions: an Earth Bolt's knockback never drives the dummy out of reach", () => {
    const r = simulateDps(registry, setup('ability|bolt|earth|none|medium|mana'), ONE);
    const middle = windowDps(r.series, 10, 20);
    expect(middle).toBeGreaterThan(r.dps / 2);
    expect(Math.abs(windowDps(r.series, 20, 30) - middle)).toBeLessThan(middle * 0.25);
  });

  it('counts only the held ability: a mana-paid heavy Nova, dearer than the pool, never casts while basics swing', () => {
    const { out, events } = recorded(() =>
      simulateDps(registry, setup('ability|nova|fire|none|heavy|mana'), ONE),
    );
    expect(out).toMatchObject({ dps: 0, casts: 0 });
    expect(hitsFrom(events, 'basic').length).toBeGreaterThan(0);
  });

  it("counts the ability's reaction splash: a Fire+Storm Bolt's Overload in a pack", () => {
    const { out, events } = recorded(() =>
      simulateDps(registry, setup('ability|bolt|fire|storm|medium|mana'), PACK),
    );
    expect(out.casts).toBe(events.filter((e) => e.kind === 'cast' && e.slot === 0).length);
    expect(hitsFrom(events, 'reaction').filter((e) => e.slot === 0).length).toBeGreaterThan(0);
    const own = events.filter((e): e is Hit => e.kind === 'hit' && e.slot === 0);
    expect(out.dps * DPS_SECONDS).toBeCloseTo(sum(own));
  });

  it('a pack favours area: a Frost Nova gains more from five dummies than a Frost Bolt', () => {
    const gain = (key: string) =>
      simulateDps(registry, setup(key), PACK).dps / simulateDps(registry, setup(key), ONE).dps;
    expect(gain('ability|nova|frost|none|medium|mana')).toBeGreaterThan(
      gain('ability|bolt|frost|none|medium|mana'),
    );
  });

  it("the held button flows through a form's default chain, each move in turn", () => {
    const { out, events } = recorded(() =>
      simulateDps(registry, setup('ability|bolt|fire|none|default|mana'), ONE),
    );
    const casts = events.filter((e) => e.kind === 'cast' && e.slot === 0);
    expect(out.casts).toBe(casts.length);
    // Light, medium, medium, heavy: the last lands 0.2 heftier.
    const heft = bal.feel.heft;
    expect(casts.slice(0, 4).map((e) => e.kind === 'cast' && e.heft)).toEqual([
      heft[1],
      heft[2],
      heft[2],
      Math.min(1, heft[3] + 0.2),
    ]);
  });

  it("presses early, marked a repeat: each move goes its beat after the last one's landing", () => {
    const s = setup('ability|bolt|fire|none|default|mana');
    const { steps } = recorded(() => simulateDps(registry, s, ONE));
    // Pressed during a wind-up, the press waits in the buffer.
    expect(steps.some((st) => st.windup && st.input.cast?.repeat)).toBe(true);
    const lands = steps.flatMap((st, i) =>
      st.events.some((e) => e.kind === 'cast' && e.slot === 0) ? [i * bal.arena.step] : [],
    );
    // The sim's hero: its weapon and pair.
    const { baseId, primary, secondary } = s.weapon;
    const weapon = sandboxWeapon(registry, {
      baseId,
      mana: primary,
      rarity: 'common',
      ilvl: ONE.depth,
    });
    const stats = computeHeroStats({ weapon }, registry, {
      pair: { primary, secondary },
      basic: s.chains.basic,
    });
    const moves = resolveChain(registry, stats, 'primary', s.chains.primary).moves;
    // Full mana at the start: the chain's first three gaps are its beats and wind-ups.
    for (let i = 0; i < 3; i++) {
      const least = beatFor(bal, 'primary', moves[i].kind, stats.tempo) + moves[i + 1].castTime;
      expect(lands[i + 1] - lands[i]).toBeGreaterThanOrEqual(least - 1e-6);
      expect(lands[i + 1] - lands[i]).toBeLessThan(least + 3 * bal.arena.step);
    }
  });

  it('holds a hold move to full charge each press', () => {
    const { out, steps } = recorded(() =>
      simulateDps(registry, setup('ability|bolt|fire|none|hold|mana'), ONE),
    );
    expect(out.casts).toBeGreaterThan(0);
    expect(out.casts).toBeLessThanOrEqual(DPS_SECONDS / bal.chains.holdTime);
    // Each cast comes after a full charge's steps with its button held and its hold running (stage
    // 2 is the full charge). The button stays held between holds too.
    const full = Math.ceil(bal.chains.holdTime / bal.arena.step);
    let run = 0;
    const runs: number[] = [];
    for (const { input, hold, events } of steps) {
      if (events.some((e) => e.kind === 'cast' && e.slot === 0)) runs.push(run);
      run = input.holding === 0 && hold === 0 ? run + 1 : 0;
    }
    expect(runs).toHaveLength(out.casts);
    for (const r of runs) expect(r).toBeGreaterThanOrEqual(full);
  });

  it('deals more deeper', () => {
    const s = setup('basic|sword|fire|none');
    expect(simulateDps(registry, s, { depth: 20, pack: false }).dps).toBeGreaterThan(
      simulateDps(registry, s, ONE).dps,
    );
  });
});

describe('the rune view (see the runes spec)', () => {
  const runeRows = grid.filter((s) => s.view === 'rune');
  const socketed = runeRows.filter((s) => s.dims.rune !== 'none');
  const echo = [{ id: 'echo', tier: 3 }];

  it('192 rune rows, each rune on every attack form and weapon it fits, and 34 baselines', () => {
    expect(socketed).toHaveLength(192);
    expect(runeRows.filter((s) => s.dims.rune === 'none')).toHaveLength(34);
    expect(socketed.filter((s) => s.dims.rune === 'split').map((s) => s.dims.on)).toEqual([
      'bolt',
      'volley',
      'barrage',
      'wand',
      'bow',
    ]);
    // Each row's baseline: the same form or weapon and elements, with no rune.
    for (const s of socketed)
      expect(byKey.get(s.base!)?.dims).toEqual({ ...s.dims, rune: 'none', tier: 'none' });
    expect(grid.filter((s) => s.view !== 'rune').every((s) => s.base === undefined)).toBe(true);
  });

  it("a form's row: its default chain paid with mana, every move holding the rune at tier III", () => {
    expect(setup('rune|echo|bolt|fire|III')).toEqual({
      view: 'rune',
      dims: { rune: 'echo', on: 'bolt', elements: 'fire', tier: 'III' },
      base: 'rune|none|bolt|fire|none',
      weapon: { baseId: 'sword', primary: 'fire', secondary: null },
      chains: {
        ...defaultChains(registry, 'fire', 'sword'),
        basic: defaultBasic(registry, 'sword', 'fire'),
        primary: {
          moves: ['light', 'medium', 'medium', 'heavy'].map((kind) => ({
            kind,
            form: 'bolt',
            elements: ['fire'],
            runes: echo,
          })),
          payment: 'mana',
        },
      },
      hold: { slot: 0 },
    });
    // An Ultimate form's row holds the Ultimate; Volatile runs on Fire + Frost.
    expect(setup('rune|volatile|nova|fire+frost|III')).toMatchObject({
      base: 'rune|none|nova|fire+frost|none',
      weapon: { baseId: 'sword', primary: 'fire', secondary: 'frost' },
      chains: {
        ultimate: {
          moves: [
            {
              kind: 'medium',
              form: 'nova',
              elements: ['fire', 'frost'],
              runes: [{ id: 'volatile', tier: 3 }],
            },
          ],
          payment: 'mana',
        },
      },
      hold: { slot: 2 },
    });
  });

  it("a weapon's row: its default basic chain, every blow holding the rune; only Volatile and Saturate run on Fire + Frost", () => {
    const s = setup('rune|saturate|bow|fire+frost|III');
    expect(s).toMatchObject({
      base: 'rune|none|bow|fire+frost|none',
      weapon: { baseId: 'bow', primary: 'fire', secondary: 'frost' },
      hold: 'attack',
    });
    expect(s.chains.basic).toEqual(
      defaultBasic(registry, 'bow', 'fire', 'frost').map((b) => ({
        ...b,
        runes: [{ id: 'saturate', tier: 3 }],
      })),
    );
    expect(s.chains.primary).toEqual(defaultChains(registry, 'fire', 'bow').primary);
    const frost = socketed.filter((x) => x.dims.elements === 'fire+frost');
    expect([...new Set(frost.map((x) => x.dims.rune))]).toEqual(['saturate', 'volatile']);
  });

  it("a baseline plays as the ability view's default chain (its first seed)", () => {
    expect(simulateDps(registry, setup('rune|none|bolt|fire|none'), { ...ONE, seed: 0 })).toEqual(
      simulateDps(registry, setup('ability|bolt|fire|none|default|mana'), ONE),
    );
  });

  it('averages RUNE_SEEDS combat seeds: a Barrage rains its impacts at random', () => {
    // The baseline: a runed mana Ultimate costs more than the depth-10 pool (the rune costs spec).
    const s = setup('rune|none|barrage|fire|none');
    const seeds = Array.from({ length: RUNE_SEEDS }, (_, seed) =>
      simulateDps(registry, s, { ...ONE, seed }),
    );
    expect(new Set(seeds.map((r) => r.dps)).size).toBeGreaterThan(1);
    const mean = seeds.reduce((a, r) => a + r.dps, 0) / RUNE_SEEDS;
    expect(simulateDps(registry, s, ONE).dps).toBeCloseTo(mean, 6);
  });

  it("counts a burn's ticks only while the held button's own hits keep it up, not the basics'", () => {
    // Heavy lifts a Barrage's burn above the sword's, so the burn the basics keep alive all
    // fight would be the Barrage's; counted while its own hits keep it, Heavy is its power.
    const ratio = (o: DpsOptions) =>
      simulateDps(registry, setup('rune|heavy|barrage|fire|III'), o).dps /
      simulateDps(registry, setup('rune|none|barrage|fire|none'), o).dps;
    expect(ratio(ONE)).toBeLessThan(1.6);
    expect(ratio(PACK)).toBeLessThan(1.6);
  });

  it('a rune changes what the held button deals: Echo III on a Bolt beats its baseline, and its price takes some back', () => {
    const ratio = (r: typeof registry) =>
      simulateDps(r, setup('rune|echo|bolt|fire|III'), ONE).dps /
      simulateDps(r, setup('rune|none|bolt|fire|none'), ONE).dps;
    expect(ratio(unloaded)).toBeGreaterThan(1.2);
    expect(ratio(registry)).toBeLessThan(ratio(unloaded));
  });

  it('a rune-less row is the same with the loads zeroed', () => {
    for (const key of [
      'ability|bolt|fire|none|default|mana',
      'ability|nova|frost|fire|hold|charge',
      'ability|lance|storm|none|heavy|cast',
      'rune|none|volley|fire|none',
    ])
      expect(simulateDps(registry, setup(key), PACK)).toEqual(
        simulateDps(unloaded, setup(key), PACK),
      );
  });
});

describe('runeComboSetups', () => {
  it("every set of three runes that fit a form or a weapon's blows, at tier III on every move, against its baseline", () => {
    const bolt = runeComboSetups(registry, 'bolt');
    expect(bolt).toHaveLength(286); // 13 runes fit a Bolt
    expect(runeComboSetups(registry, 'sword')).toHaveLength(165); // 11 fit a sword's blows
    expect(new Set(bolt.map(dpsKey)).size).toBe(286);
    const [a, b, c] = registry
      .getRunes()
      .filter((def) => runeFits(def, { form: 'bolt' }))
      .map((def) => def.id);
    expect(bolt[0].dims).toEqual({
      rune: `${a}+${b}+${c}`,
      on: 'bolt',
      elements: 'fire',
      tier: 'III',
    });
    for (const m of bolt[0].chains.primary.moves)
      expect(m.runes).toEqual([a, b, c].map((id) => ({ id, tier: 3 })));
    // A set holding Volatile or Saturate runs on Fire + Frost, against that baseline.
    for (const s of bolt) {
      const reacts = /volatile|saturate/.test(s.dims.rune);
      expect(s.dims.elements).toBe(reacts ? 'fire+frost' : 'fire');
      expect(byKey.get(s.base!)?.dims).toEqual({ ...s.dims, rune: 'none', tier: 'none' });
    }
  });
});

describe('the sustained mode (see the rune costs spec)', () => {
  const STARVED: DpsOptions = { ...PACK, sustained: 'starved' };
  const SUPPORTED: DpsOptions = { ...PACK, sustained: 'supported' };
  /** The hero a run ends with, and its first step's mana and charge. */
  const ran = (key: string, o: DpsOptions) => {
    const { world, steps } = recorded(() => simulateDps(registry, setup(key), { ...o, seed: 0 }));
    return { hero: world!.hero, first: steps[0] };
  };

  it('starts the pool and every charge meter empty, starved or supported; full mana starts full', () => {
    for (const o of [STARVED, SUPPORTED])
      expect(ran('ability|nova|fire|none|medium|charge', o).first).toMatchObject({
        mana: 0,
        charge: [0, 0, 0],
      });
    const full = ran('ability|bolt|fire|none|medium|mana', PACK);
    expect(full.first.mana).toBe(full.hero.manaMax);
  });

  it("starved is the Lab's hero as built; supported has a pool of 120 regenerating 10.4, Drain III on every blow and a Fire move's runes eased 45%", () => {
    const starved = ran('rune|echo|bolt|fire|III', STARVED).hero;
    expect(starved.manaMax).toBe(63);
    expect(starved.manaRegen).toBeCloseTo(4.2);
    expect(starved.stats.weapon.blows.every((b) => b.runes.length === 0)).toBe(true);
    expect(starved.chains[0]!.moves[0].ease).toBeCloseTo(0.03);
    const supported = ran('rune|echo|bolt|fire|III', SUPPORTED).hero;
    expect(supported.manaMax).toBe(120);
    expect(supported.manaRegen).toBeCloseTo(10.4);
    for (const b of supported.stats.weapon.blows)
      expect(b.runes).toEqual([{ id: 'drain', tier: 3 }]);
    for (const m of supported.chains[0]!.moves) expect(m.ease).toBeCloseTo(0.45);
    // A Fire + Frost move eases by their mean attunement, 10.
    const both = ran('rune|volatile|bolt|fire+frost|III', SUPPORTED).hero;
    expect(both.chains[0]!.moves[0].ease).toBeCloseTo(0.3);
  });

  it('a basic-view row comes out the same starved as at full mana: a basic attack spends none', () => {
    for (const key of ['basic|sword|fire|none', 'basic|bow|storm|fire'])
      expect(simulateDps(registry, setup(key), STARVED)).toEqual(
        simulateDps(registry, setup(key), PACK),
      );
  });

  it('a runed row casts less starved than at full mana, and less than its baseline starved', () => {
    const casts = (key: string, o: DpsOptions) => simulateDps(registry, setup(key), o).casts;
    expect(casts('rune|echo|bolt|fire|III', STARVED)).toBeLessThan(
      casts('rune|echo|bolt|fire|III', PACK),
    );
    expect(casts('rune|echo|bolt|fire|III', STARVED)).toBeLessThan(
      casts('rune|none|bolt|fire|none', STARVED),
    );
  });
});
