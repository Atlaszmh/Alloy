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

describe('Whirl (forms.ts performTick)', () => {
  const whirl = { kind: 'medium', form: 'whirl', elements: ['fire'] } as const;

  it('spins: a sweep all round now and every tick for its duration, the hero walking slowed meanwhile', () => {
    const w = arena([dummy(13, 34.4), dummy(13, 37.8)], { noBasic: true, primary: { ...whirl } });
    const form = registry.getForm('whirl');
    const beats = Math.round(form.duration! / form.tick!);
    // A short walk (at `actionMove`, as a swing's), then standing: every beat still reaches both.
    const events = [
      ...press(w, 0),
      ...run(w, 0.2, { x: 1, y: 0 }),
      ...run(w, form.duration! - 0.1, { x: 0, y: 0 }),
    ];
    // The sweeps' own hits (the burn's ticks come as `dot` hits beside them).
    for (const m of w.monsters)
      expect(hits(events, m.id).filter((e) => e.source === 'skill')).toHaveLength(beats);
    const walked = w.hero.x - 13;
    expect(walked).toBeGreaterThan(0.3);
    expect(walked).toBeLessThan(w.hero.stats.moveSpeed * 0.2 * bal.feel.actionMove + 0.1);
    expect(w.hero.perform ?? null).toBeNull();
    expect(events.filter((e) => e.kind === 'slash' && e.arc === 360)).toHaveLength(beats);
  });

  it("its hits are direct (a chain's first move's stacks), and a second press starts the spin over", () => {
    const w = arena([dummy(13, 34.4)], { noBasic: true, primary: { ...whirl } });
    const events = press(w, 0);
    expect(w.monsters[0].status.stacks.fire).toBe(moveOf(w, 0).stacks);
    expect(hits(events, w.monsters[0].id)[0].source).toBe('skill');
    run(w, 0.3);
    w.hero.cooldowns[0][0] = 0;
    w.hero.beatUntil[0] = 0;
    press(w, 0);
    expect(w.hero.perform?.struck).toBe(1);
  });
});

describe('Repel (forms.ts)', () => {
  it('pulses: the foes round the hero are hit, knocked back and chilled; the Defensive up ends', () => {
    const w = arena([dummy(13, 34), dummy(13, 24)], {
      noBasic: true,
      // A ranged form: on a staff (`ArenaOpts.weapon` comes with Task 5).
      equipped: { weapon: gear('fire', 'weapon', 'staff') },
      defensive: {
        moves: [
          { kind: 'medium', form: 'ward', elements: ['fire'] },
          { kind: 'medium', form: 'repel', elements: ['fire'] },
        ],
      },
    });
    press(w, 1);
    expect(w.hero.ward).not.toBeNull();
    run(w, bal.chains.beat.medium * bal.chains.beatSlot.defensive + 0.1);
    w.hero.cooldowns[1][1] = 0;
    const events = press(w, 1);
    const [near, far] = w.monsters;
    expect(w.hero.ward).toBeNull();
    expect(w.hero.defend).toBeNull();
    expect(hits(events, near.id)).toHaveLength(1);
    expect(damaged(far)).toBe(false);
    expect(near.kby).toBeLessThan(0);
    expect(near.status.stacks.frost).toBeGreaterThan(0);
    expect(events.some((e) => e.kind === 'explode' && e.x === w.hero.x)).toBe(true);
  });
});

describe('Onslaught (forms.ts performTick, combat.ts hurtHero)', () => {
  const onslaught = { form: 'onslaught', payment: 'mana' } as const;
  const form = () => registry.getForm('onslaught');

  it('darts between the foes in the area, striking count times, never the same foe twice running', () => {
    const w = arena([dummy(13, 29), dummy(15, 28), dummy(13, 16)], {
      noBasic: true,
      ultimate: { ...onslaught },
    });
    const events = [...press(w, 2, { x: 13, y: 28 }), ...run(w, form().duration! + 0.1)];
    const [a, b, far] = w.monsters;
    // The darts' own hits (the burn's ticks come as `dot` hits beside them).
    const struck = (id: number) => hits(events, id).filter((e) => e.source === 'skill').length;
    expect(struck(a.id) + struck(b.id)).toBe(form().count);
    expect(struck(a.id)).toBeGreaterThan(0);
    expect(struck(b.id)).toBeGreaterThan(0);
    expect(damaged(far)).toBe(false);
    expect(events.filter((e) => e.kind === 'dash')).toHaveLength(form().count);
    expect(w.hero.perform ?? null).toBeNull();
    // It stands by its last foe.
    const gaps = w.monsters.slice(0, 2).map((m) => Math.hypot(m.x - w.hero.x, m.y - w.hero.y));
    expect(Math.min(...gaps)).toBeLessThan(2);
  });

  it('is invulnerable while darting, then takes effect less damage for onslaughtGuard seconds', () => {
    const w = arena([dummy(13, 29)], { noBasic: true, ultimate: { ...onslaught } });
    press(w, 2, { x: 13, y: 29 });
    const ctx = makeCtx(registry, w, []);
    const hp = w.hero.hp;
    hurtHero(ctx, 30, null, null);
    expect(w.hero.hp).toBe(hp);
    run(w, form().duration! + STEP);
    const guard = w.hero.onslaughtGuard!;
    expect(guard.until).toBeCloseTo(w.t + bal.abilities.defend.onslaughtGuard, 1);
    const plain = arena([dummy(13, 29)], { noBasic: true });
    hurtHero(makeCtx(registry, plain, []), 30, null, null, { unavoidable: true });
    hurtHero(ctx, 30, null, null, { unavoidable: true });
    const lost = (x: ArpgWorld) => x.hero.stats.maxHp - x.hero.hp;
    expect(lost(w)).toBeCloseTo(lost(plain) * (1 - moveOf(w, 2).effect), 6);
  });
});
