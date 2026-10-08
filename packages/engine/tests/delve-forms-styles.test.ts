import { describe, it, expect } from 'vitest';
import { makeCtx, hurtHero } from '../src/arpg/combat.js';
import { damagePerUse, expectedHit } from '../src/delve/hero-stats.js';
import { resolveChain } from '../src/arpg/abilities/resolve.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import type { Chain } from '../src/types/ability.js';
import {
  arena,
  bal,
  damaged,
  dummy,
  gear,
  moveOf,
  press,
  registry,
  run,
  STEP,
} from './fixtures/arena.js';

// The constructs spec §2 (forms), §2.3 (Detonate), §4 (cast styles). The hero starts at
// (13, 36) facing up (−y); the fixture's weapon is a sword (melee).

type Hit = Extract<ArpgEvent, { kind: 'hit' }>;
const hits = (events: ArpgEvent[], id: number) =>
  events.filter((e): e is Hit => e.kind === 'hit' && e.id === id);
const DETONATE = { id: 'detonate', tier: 3 } as const;

describe('Detonate (impact.ts)', () => {
  it("a Strike's contact hit blasts the foes round the foe it struck, never the foe itself twice", () => {
    const w = arena([dummy(13, 32.8), dummy(13, 31.3), dummy(13, 24)], {
      noBasic: true,
      primary: { form: 'strike', runes: [DETONATE] },
    });
    w.hero.stats = { ...w.hero.stats, critChance: 0 };
    const events = press(w, 0);
    const [near, behind, far] = w.monsters;
    // The sweep reaches the near foe only; its blast reaches the one behind it.
    expect(hits(events, near.id)).toHaveLength(1);
    expect(hits(events, behind.id)).toHaveLength(1);
    expect(damaged(far)).toBe(false);
    const k = moveOf(w, 0).knobs.detonate;
    expect(k).toBeGreaterThan(0);
    expect(hits(events, behind.id)[0].amount).toBeCloseTo(hits(events, near.id)[0].amount * k, 6);
  });

  it('a Bolt (no fit) and a tick never detonate; Power counts it', () => {
    const w = arena([dummy(13, 30), dummy(13, 28.2)], {
      noBasic: true,
      primary: { form: 'bolt', runes: [DETONATE] },
    });
    expect(moveOf(w, 0).knobs.detonate).toBe(0);
    const chain = (runes: (typeof DETONATE)[]): Chain => ({
      moves: [{ kind: 'medium', form: 'strike', elements: ['fire'], runes }],
      payment: 'mana',
    });
    const stats = w.hero.stats;
    const value = (c: Chain) =>
      damagePerUse(resolveChain(registry, stats, 'primary', c), expectedHit(stats), stats, bal);
    // Its blasts outweigh the rune's 0.9 power.
    expect(value(chain([DETONATE]))).toBeGreaterThan(value(chain([])));
  });
});
