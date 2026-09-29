import { describe, it, expect } from 'vitest';
import { hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import { impact } from '../src/arpg/abilities/impact.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { ManaType } from '../src/types/mana.js';
import { STEP, arena, dummy, gear, moveOf, press, registry, run } from './fixtures/arena.js';

// The fixture arena's hero starts at (13, 36), facing up (-y).

type Of<K extends ArpgEvent['kind']> = Extract<ArpgEvent, { kind: K }>;
function only<K extends ArpgEvent['kind']>(events: ArpgEvent[], kind: K): Of<K>[] {
  return events.filter((e): e is Of<K> => e.kind === kind);
}

const CASES = [
  { slot: 0, form: 'lance', kind: 'beam' },
  { slot: 0, form: 'strike', kind: 'slash' },
  { slot: 0, form: 'bolt', kind: 'explode' },
  { slot: 1, form: 'blink', kind: 'dash' },
  { slot: 2, form: 'nova', kind: 'explode' },
] as const;

/** Cast the case's form, built from `elements`, at a foe 2 units above the hero, and let it land. */
function cast(c: (typeof CASES)[number], elements: ManaType[]): ArpgEvent[] {
  const build = { form: c.form, elements, payment: 'mana' as const };
  const w = arena([dummy(13, 34)], {
    noBasic: true,
    primary: c.slot === 0 ? build : undefined,
    defensive: c.slot === 1 ? build : undefined,
    ultimate: c.slot === 2 ? build : undefined,
  });
  return [...press(w, c.slot, { x: 13, y: 34 }), ...run(w, 1)];
}

describe('basic attacks', () => {
  it('draw no infusion: a blow has one element, and so does its burst', () => {
    const staff = { weapon: gear('fire', 'weapon', 'staff') };
    const w = arena([dummy(13, 30)], { equipped: staff });
    w.hero.stats = computeHeroStats(staff, registry, {
      pair: { primary: 'fire', secondary: 'storm' },
    });
    w.hero.attackCount = 2;
    w.hero.lastBasicAt = 0;
    const events = run(w, 1.5);
    const bursts = only(events, 'explode');
    expect(bursts.length).toBeGreaterThan(0);
    for (const e of bursts) expect(e.infusion).toBeNull();
  });
});

describe('ability events carry the infusion', () => {
  it.each(CASES)('$form: its $kind carries the second element, and null with one', (c) => {
    const infused = only(cast(c, ['fire', 'storm']), c.kind);
    const plain = only(cast(c, ['fire']), c.kind);
    expect(infused.length).toBeGreaterThan(0);
    expect(plain.length).toBeGreaterThan(0);
    for (const e of infused) expect(e.infusion).toBe('storm');
    for (const e of plain) expect(e.infusion).toBeNull();
  });

  it("a tick impact's explode (an ember) carries null; the same impact landing carries it", () => {
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { elements: ['fire', 'storm'] } });
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    impact(ctx, moveOf(w, 0), 13, 30, 1.1, 1, { tick: true });
    impact(ctx, moveOf(w, 0), 13, 30, 1.1, 1);
    // The landing's Fire meets the Storm the tick left: Overload, whose blast carries null.
    expect(only(events, 'explode').map((e) => e.infusion)).toEqual([null, 'storm', null]);
  });

  it('monster slams, Overload, Combust and Hellfire Brand carry null', () => {
    const w = arena([dummy(13, 30), dummy(14, 30)], { noBasic: true });
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    const [a, b] = w.monsters;
    a.status.stacks.fire = 1;
    hitMonster(ctx, a, 1, 'storm', { source: 'skill' }); // Overload
    b.status.stacks.nature = 2;
    hitMonster(ctx, b, 1, 'fire', { source: 'skill' }); // Combust
    a.status.brandUntil = w.t + 5;
    killMonster(ctx, a); // Hellfire Brand
    w.zones.push({
      id: 999,
      owner: 'monster',
      source: null,
      ability: null,
      x: 13,
      y: 36,
      radius: 2,
      born: w.t,
      until: w.t + 1,
      tick: 0,
      nextTick: 0,
      damage: 1,
      element: 'fire',
      detonateAt: w.t,
      dead: false,
    }); // a boss slam, landing next tick
    events.push(...run(w, STEP));
    const explodes = only(events, 'explode');
    expect(explodes).toHaveLength(4);
    for (const e of explodes) expect(e.infusion).toBeNull();
  });
});
