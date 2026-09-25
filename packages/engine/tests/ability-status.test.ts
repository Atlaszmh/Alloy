import { describe, it, expect } from 'vitest';
import { applyStatus, hitMonster, makeCtx } from '../src/arpg/combat.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import { arena, bal, dummy, registry, run } from './fixtures/arena.js';

function setup(monsters = [dummy(13, 20)]) {
  const w = arena(monsters, { noBasic: true });
  const events: ArpgEvent[] = [];
  return { w, events, ctx: makeCtx(registry, w, events) };
}

describe('poison', () => {
  it('stacks up to the cap and ticks nature damage', () => {
    const { w, ctx } = setup();
    const m = w.monsters[0];
    for (let i = 0; i < 7; i++) applyStatus(ctx, m, 'poison', 100);
    expect(m.status.poisonStacks).toBe(bal.status.poisonMaxStacks);
    const before = m.hp;
    const events = run(w, 1.1);
    const ticks = events.filter((e) => e.kind === 'hit' && e.element === 'nature');
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(before - m.hp).toBeCloseTo(100 * bal.status.poisonDps * bal.status.poisonMaxStacks, 0);
  });

  it('wears off after its duration', () => {
    const { w, ctx } = setup();
    applyStatus(ctx, w.monsters[0], 'poison', 100);
    run(w, bal.status.poisonDuration + 0.6);
    const hp = w.monsters[0].hp;
    run(w, 1);
    expect(w.monsters[0].hp).toBe(hp);
  });

  it('Plaguebearer (10 Nature attunement) doubles the stack cap', () => {
    const { w, ctx } = setup();
    w.hero.stats.attunement.nature = bal.mana.masteryThreshold;
    for (let i = 0; i < 12; i++) applyStatus(ctx, w.monsters[0], 'poison', 100);
    expect(w.monsters[0].status.poisonStacks).toBe(bal.status.poisonMaxStacks * 2);
  });
});

describe('root', () => {
  it('stops a foe moving but not attacking', () => {
    const { w, ctx } = setup([
      { x: 13, y: 28, hp: 1e6, maxHp: 1e6, aggro: true },
      { x: 13, y: 34.9, hp: 1e6, maxHp: 1e6, aggro: true },
    ]);
    const [far, near] = w.monsters;
    applyStatus(ctx, far, 'root', 0);
    applyStatus(ctx, near, 'root', 0);
    const y0 = far.y;
    const hp0 = w.hero.hp;
    run(w, 1.2);
    expect(far.y).toBeCloseTo(y0, 5);
    expect(w.hero.hp).toBeLessThan(hp0);
  });

  it('cannot be reapplied straight after it ends', () => {
    const { w, ctx } = setup([{ x: 13, y: 20, aggro: true, hp: 1e6, maxHp: 1e6 }]);
    const m = w.monsters[0];
    applyStatus(ctx, m, 'root', 0);
    run(w, bal.status.rootDuration + 0.1);
    applyStatus(ctx, m, 'root', 0);
    expect(m.status.rootUntil).toBeLessThan(w.t);
  });
});

describe('crowd-control immunity', () => {
  it('a foe cannot be staggered again right after a stagger ends', () => {
    const { w, ctx } = setup();
    const m = w.monsters[0];
    applyStatus(ctx, m, 'stagger', 0);
    run(w, bal.status.staggerDuration + 0.1);
    applyStatus(ctx, m, 'stagger', 0);
    expect(m.status.staggerUntil).toBeLessThan(w.t);
    run(w, bal.status.staggerImmunity);
    applyStatus(ctx, m, 'stagger', 0);
    expect(m.status.staggerUntil).toBeGreaterThan(w.t);
  });
});

describe('new reactions', () => {
  it('Combust: fire on a poisoned foe detonates the poison around it', () => {
    const { w, ctx, events } = setup([dummy(13, 20), dummy(14, 20)]);
    const [a, b] = w.monsters;
    applyStatus(ctx, a, 'poison', 100);
    hitMonster(ctx, a, 50, 'fire', { source: 'skill' });
    expect(events.some((e) => e.kind === 'reaction' && e.reaction === 'combust')).toBe(true);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(a.status.poisonStacks).toBe(0);
  });

  it('Blight: shadow on a poisoned foe spreads its poison to neighbours', () => {
    const { w, ctx, events } = setup([dummy(13, 20), dummy(14.5, 20), dummy(13, 10)]);
    const [a, b, far] = w.monsters;
    for (let i = 0; i < 3; i++) applyStatus(ctx, a, 'poison', 100);
    hitMonster(ctx, a, 10, 'shadow', { source: 'skill' });
    expect(events.some((e) => e.kind === 'reaction' && e.reaction === 'blight')).toBe(true);
    expect(b.status.poisonStacks).toBe(3);
    expect(far.status.poisonStacks).toBe(0);
  });
});
