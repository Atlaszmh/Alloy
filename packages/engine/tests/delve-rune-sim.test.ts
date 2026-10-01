import { describe, it, expect } from 'vitest';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import type { RuneRef, RuneTier } from '../src/types/rune.js';
import { STEP, arena, dummy, moveOf, press, run, type ArenaOpts } from './fixtures/arena.js';

// See the runes spec, "Each rune in the sim". The fixture arena's hero stands at (13, 36) facing
// up; `dummy(x, y)` is a sturdy Fire foe that doesn't fight back. A move's runes ride on it
// (`Move.runes`, `Blow.runes`): `R('chain')` is Chain III.

const R = (id: string, tier: RuneTier = 3): RuneRef => ({ id, tier });

/** Sturdy foes, the hero's basic attack stopped (only abilities deal damage). */
function world(monsters: Partial<MonsterEntity>[], opts: ArenaOpts = {}): ArpgWorld {
  return arena(monsters, { noBasic: true, ...opts });
}

/** The skill hits of slot `slot` (the Primary by default). */
const skillHits = (events: ArpgEvent[], slot = 0) =>
  events.flatMap((e) => (e.kind === 'hit' && e.source === 'skill' && e.slot === slot ? [e] : []));

/** Step `w` until an event of `kind` (at most 3 s), returning every event. */
function until(w: ArpgWorld, kind: ArpgEvent['kind']): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  for (let i = 0; i < 90 && !events.some((e) => e.kind === kind); i++) events.push(...run(w, STEP));
  return events;
}

describe('runes merge into the move they sit on (resolveAbility)', () => {
  it('lists the runes acting on it in socket order, past empty sockets, unknown ids and runes that do not fit', () => {
    const w = world([], {
      primary: { runes: [R('chain'), null, R('nope'), R('widen'), R('leech', 5)] },
    });
    expect(moveOf(w, 0).runes).toEqual([R('chain'), R('leech', 5)]);
    expect(moveOf(w, 1).runes).toEqual([]);
  });

  it("merges each rune's tier after the elements, the fusion and the legendaries: its trade-off too", () => {
    const plain = moveOf(world([]), 0);
    const heavy = moveOf(world([], { primary: { runes: [R('heavy')] } }), 0);
    expect(heavy.power / plain.power).toBeCloseTo(1.3);
    expect(heavy.knobs.applies).toEqual(['burn', 'stagger']);
    const pierce = moveOf(world([], { primary: { runes: [R('pierce', 2)] } }), 0);
    expect(pierce.knobs.pierce).toBe(2);
    expect(pierce.power / plain.power).toBeCloseTo(0.9);
    // Linger under Magma (Fire + Earth: 3 s at 0.25): the longer zone, at the stronger tick.
    const magma = world([], { primary: { elements: ['fire', 'earth'], runes: [R('linger', 5)] } });
    expect(moveOf(magma, 0).knobs.zone).toEqual({ seconds: 3.5, tickPower: 0.25 });
  });

  it('leaves out a Pierce on a move that already passes every foe (an Earth Bolt): dormant, trade-off and all', () => {
    const plain = moveOf(world([], { primary: { elements: ['earth'] } }), 0);
    const w = world([], { primary: { elements: ['earth'], runes: [R('pierce'), R('chain')] } });
    expect(moveOf(w, 0).runes).toEqual([R('chain')]);
    expect(moveOf(w, 0).knobs.pierce).toBe(Infinity);
    expect(moveOf(w, 0).power).toBeCloseTo(plain.power);
  });

  it('Pierce: a Bolt passes that many foes, bursting on each, and dies on the next', () => {
    const w = world([dummy(13, 33), dummy(13, 31), dummy(13, 29), dummy(13, 27)], {
      primary: { runes: [R('pierce', 2)] },
    });
    press(w, 0);
    run(w, 1);
    expect(w.monsters.map((m) => m.hp < m.maxHp)).toEqual([true, true, true, false]);
  });

  it('Chain: the Bolt jumps from the first foe it bursts on', () => {
    const w = world([dummy(13, 30), dummy(16, 30), dummy(19, 30)], {
      primary: { runes: [R('chain')] },
    });
    const events = [...press(w, 0), ...run(w, 1)];
    const chain = events.find((e) => e.kind === 'chain');
    expect(chain?.kind === 'chain' && chain.points.length).toBe(3);
    expect(w.monsters.every((m) => m.hp < m.maxHp)).toBe(true);
  });

  it('Widen: a Nova reaches further (radius × area) at its power cut', () => {
    const at = (runes: RuneRef[]) => {
      const w = world([dummy(13, 28)], { ultimate: { payment: 'mana', runes } });
      press(w, 2);
      return { w, ab: moveOf(w, 2) };
    };
    const plain = at([]);
    const wide = at([R('widen')]);
    expect(wide.ab.radius / plain.ab.radius).toBeCloseTo(1.4);
    expect(wide.ab.power / plain.ab.power).toBeCloseTo(0.9);
    expect(plain.w.monsters[0].hp).toBe(plain.w.monsters[0].maxHp);
    expect(wide.w.monsters[0].hp).toBeLessThan(wide.w.monsters[0].maxHp);
  });

  it('Heavy: its hits stagger', () => {
    const w = world([dummy(13, 30)], { primary: { runes: [R('heavy')] } });
    press(w, 0);
    run(w, 0.5);
    expect(w.monsters[0].status.staggerUntil).toBeGreaterThan(0);
  });

  it('Linger: a zone where the move lands, for its seconds', () => {
    const w = world([dummy(13, 30)], { primary: { runes: [R('linger')] } });
    press(w, 0);
    run(w, 0.5);
    const zone = w.zones.find((z) => z.owner === 'hero' && z.ability);
    expect(zone && zone.until - zone.born).toBeCloseTo(2.5);
  });

  it('Leech: its hits heal a share of their damage', () => {
    const w = world([dummy(13, 30)], { primary: { runes: [R('leech', 5)] } });
    w.hero.hp = w.hero.stats.maxHp / 2;
    const events = [...press(w, 0), ...run(w, 0.5)];
    const dealt = skillHits(events).reduce((a, e) => a + e.amount, 0);
    const healed = events.reduce((a, e) => a + (e.kind === 'heal' ? e.amount : 0), 0);
    expect(dealt).toBeGreaterThan(0);
    expect(healed).toBeCloseTo(dealt * (w.hero.stats.lifesteal + 0.06));
  });

  it('a Bolt spawned piercing never bursts at the end of its flight, its count spent or not', () => {
    const w = world([dummy(13, 33)], { primary: { runes: [R('pierce', 1)] } });
    const events = [...press(w, 0), ...until(w, 'hit')];
    // It burst on the foe, passed it, and flies on: its count is spent.
    expect(w.projectiles.filter((p) => p.form === 'bolt')).toHaveLength(1);
    events.push(...run(w, 1.5));
    expect(w.projectiles).toHaveLength(0);
    expect(events.filter((e) => e.kind === 'explode')).toHaveLength(1);
  });
});
