import { describe, it, expect } from 'vitest';
import { applyStatus, hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
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
