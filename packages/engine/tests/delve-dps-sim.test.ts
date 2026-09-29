import { describe, it, expect, vi } from 'vitest';
import { applyStatus, hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import { defaultAbilities } from '../src/arpg/abilities/resolve.js';
import {
  DPS_SECONDS,
  dpsCombos,
  dpsKey,
  simulateDps,
  type DpsOptions,
  type DpsSetup,
} from '../src/arpg/dps-sim.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import { arena, dummy, gear, registry, run } from './fixtures/arena.js';

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

/** The sims' events, collected while `tap.on` is set (`stepWorld` itself is unchanged). */
const tap = vi.hoisted(() => ({ on: false, events: [] as ArpgEvent[] }));
vi.mock('../src/arpg/step.js', async (importOriginal) => {
  const step = await importOriginal<typeof import('../src/arpg/step.js')>();
  return {
    ...step,
    stepWorld: (...args: Parameters<typeof step.stepWorld>) => {
      const events = step.stepWorld(...args);
      if (tap.on) tap.events.push(...events);
      return events;
    },
  };
});

/** Run `f`, collecting every event its sims step through. */
function recorded<T>(f: () => T): { out: T; events: ArpgEvent[] } {
  tap.events = [];
  tap.on = true;
  try {
    return { out: f(), events: tap.events };
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
  it('252 basic combos and 4,320 ability combos, each with its own key', () => {
    expect(grid.filter((s) => s.view === 'basic')).toHaveLength(252);
    const abilities = grid.filter((s) => s.view === 'ability');
    expect(abilities).toHaveLength(4320);
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
    expect(setup('basic|bow|storm|none')).toEqual({
      view: 'basic',
      dims: { weapon: 'bow', primary: 'storm', secondary: 'none' },
      weapon: { baseId: 'bow', primary: 'storm', secondary: null },
      abilities: defaultAbilities('storm'),
      hold: 'attack',
    });
    // Ordered pairs: Frost+Fire is its own build, on a sword with that pair.
    expect(setup('ability|nova|frost|fire|2|charge')).toEqual({
      view: 'ability',
      dims: { form: 'nova', first: 'frost', second: 'fire', weight: '2', payment: 'charge' },
      weapon: { baseId: 'sword', primary: 'frost', secondary: 'fire' },
      abilities: {
        ...defaultAbilities('frost'),
        ultimate: { form: 'nova', elements: ['frost', 'fire'], weight: 2, payment: 'charge' },
      },
      hold: { slot: 2 },
    });
  });
});

describe('simulateDps', () => {
  it('gives the same result for the same setup', () => {
    const s = setup('ability|barrage|storm|nature|1|cast');
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
    const r = simulateDps(registry, setup('ability|bolt|earth|none|0|mana'), ONE);
    const middle = windowDps(r.series, 10, 20);
    expect(middle).toBeGreaterThan(r.dps / 2);
    expect(Math.abs(windowDps(r.series, 20, 30) - middle)).toBeLessThan(middle * 0.25);
  });

  it('counts only the held ability: a mana-paid Crushing Nova never casts while basics swing', () => {
    const { out, events } = recorded(() =>
      simulateDps(registry, setup('ability|nova|fire|none|2|mana'), ONE),
    );
    expect(out).toMatchObject({ dps: 0, casts: 0 });
    expect(hitsFrom(events, 'basic').length).toBeGreaterThan(0);
  });

  it("counts the ability's reaction splash: a Fire+Storm Bolt's Overload in a pack", () => {
    const { out, events } = recorded(() =>
      simulateDps(registry, setup('ability|bolt|fire|storm|0|mana'), PACK),
    );
    expect(out.casts).toBe(events.filter((e) => e.kind === 'cast' && e.slot === 0).length);
    expect(hitsFrom(events, 'reaction').filter((e) => e.slot === 0).length).toBeGreaterThan(0);
    const own = events.filter((e): e is Hit => e.kind === 'hit' && e.slot === 0);
    expect(out.dps * DPS_SECONDS).toBeCloseTo(sum(own));
  });

  it('a pack favours area: a Frost Nova gains more from five dummies than a Frost Bolt', () => {
    const gain = (key: string) =>
      simulateDps(registry, setup(key), PACK).dps / simulateDps(registry, setup(key), ONE).dps;
    expect(gain('ability|nova|frost|none|0|mana')).toBeGreaterThan(
      gain('ability|bolt|frost|none|0|mana'),
    );
  });

  it('deals more deeper', () => {
    const s = setup('basic|sword|fire|none');
    expect(simulateDps(registry, s, { depth: 20, pack: false }).dps).toBeGreaterThan(
      simulateDps(registry, s, ONE).dps,
    );
  });
});
