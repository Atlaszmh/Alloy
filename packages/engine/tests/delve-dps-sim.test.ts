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
  dpsCombos,
  dpsKey,
  simulateDps,
  type DpsOptions,
  type DpsSetup,
} from '../src/arpg/dps-sim.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { ArpgEvent, ArpgInput, ArpgWorld } from '../src/types/arpg.js';
import { arena, bal, dummy, gear, registry, run } from './fixtures/arena.js';

type Hit = Extract<ArpgEvent, { kind: 'hit' }>;

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
  }[],
}));
vi.mock('../src/arpg/step.js', async (importOriginal) => {
  const step = await importOriginal<typeof import('../src/arpg/step.js')>();
  return {
    ...step,
    stepWorld: (...args: Parameters<typeof step.stepWorld>) => {
      const windup = args[1].hero.windup !== null;
      const events = step.stepWorld(...args);
      if (tap.on) {
        tap.events.push(...events);
        tap.steps.push({ input: args[2], windup, hold: args[1].hero.hold?.slot ?? null, events });
      }
      return events;
    },
  };
});

/** Run `f`, collecting every event its sims step through, and each step (see `tap`). */
function recorded<T>(f: () => T): { out: T; events: ArpgEvent[]; steps: typeof tap.steps } {
  tap.events = [];
  tap.steps = [];
  tap.on = true;
  try {
    return { out: f(), events: tap.events, steps: tap.steps };
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
  it('252 basic combos, 3,456 one-move chains and 864 default chains, each with its own key', () => {
    expect(grid.filter((s) => s.view === 'basic')).toHaveLength(252);
    const abilities = grid.filter((s) => s.view === 'ability');
    expect(abilities.filter((s) => s.dims.kind !== 'default')).toHaveLength(3456);
    expect(abilities.filter((s) => s.dims.kind === 'default')).toHaveLength(864);
    // Primary and Ultimate forms only.
    expect([...new Set(abilities.map((s) => s.dims.form))]).toEqual([
      'bolt',
      'volley',
      'lance',
      'burst',
      'strike',
      'nova',
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
    const moves = resolveChain(
      registry,
      computeHeroStats({}, registry),
      'primary',
      s.chains.primary,
    ).moves;
    // Full mana at the start: the chain's first three gaps are its beats and wind-ups.
    for (let i = 0; i < 3; i++) {
      const least = beatFor(bal, 'primary', moves[i].kind, 1) + moves[i + 1].castTime;
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
