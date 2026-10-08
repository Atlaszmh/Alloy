import { describe, it, expect } from 'vitest';
import { stepWorld } from '../src/arpg/step.js';
import { basicStep } from '../src/arpg/basic.js';
import { chainProgress } from '../src/arpg/combo.js';
import { pressStep } from '../src/arpg/abilities/cast.js';
import { arena, bal, dummy, pressOnly, registry, STEP } from './fixtures/arena.js';

const still = { x: 0, y: 0 };

describe('mixing chains', () => {
  it("a skill's wind-up holds the basic chain's place: two blows, a cast, and the third blow follows", () => {
    const w = arena([dummy(13, 28)], { noBasic: true, primary: { payment: 'cast' } });
    const h = w.hero;
    // Two blows just struck.
    h.attackCount = 2;
    h.lastBasicAt = w.t;
    const from = h.lastBasicAt;
    pressOnly(w, 0);
    const start = h.windup!.start;
    while (h.windup) stepWorld(registry, w, { move: still }, STEP);
    const held = w.t - start;
    expect(held).toBeGreaterThan(0);
    // The window waited out the wind-up, a tick's slack either way.
    expect(h.lastBasicAt - from).toBeGreaterThan(held - 2 * STEP);
    expect(
      basicStep(h, h.lastBasicAt + h.stats.attackInterval + bal.hero.basicComboGrace - 0.01, bal),
    ).toBe(2 % h.stats.weapon.blows.length);
  });

  it("a basic swing holds a skill chain's place", () => {
    const w = arena([dummy(13, 34.6)], { primary: { payment: 'cast' } });
    const h = w.hero;
    h.comboStep[0] = 0;
    h.comboAt[0] = w.t;
    const from = h.comboAt[0];
    for (let i = 0; i < 60 && !h.swing; i++) stepWorld(registry, w, { move: still }, STEP);
    expect(h.swing).not.toBeNull();
    const swingFrom = w.t;
    while (h.swing) stepWorld(registry, w, { move: still }, STEP);
    expect(h.comboAt[0] - from).toBeGreaterThan(w.t - swingFrom - 2 * STEP);
    expect(
      pressStep(h, 0, h.comboAt[0] + bal.abilities.comboWindow - 0.01, bal.abilities.comboWindow),
    ).toBe(1 % h.chains[0]!.moves.length);
  });

  it('chainProgress reports each chain: its length, its next move and its window left', () => {
    const w = arena([], { noBasic: true });
    const h = w.hero;
    const fresh = chainProgress(h, w.t, bal);
    expect(fresh[0]).toMatchObject({ slot: 'basic', next: 0, left: 0 });
    expect(fresh.filter((c) => c.slot !== 'basic').map((c) => c.slot)).toEqual(
      h.chains.flatMap((c, i) => (c ? [i] : [])),
    );
    h.attackCount = 1;
    h.lastBasicAt = w.t;
    const now = chainProgress(h, w.t, bal)[0];
    expect(now.next).toBe(1 % h.stats.weapon.blows.length);
    expect(now.left).toBeCloseTo(1, 9);
    const window = h.stats.attackInterval + bal.hero.basicComboGrace;
    expect(chainProgress(h, w.t + window / 2, bal)[0].left).toBeCloseTo(0.5, 9);
    expect(chainProgress(h, w.t + window + 0.01, bal)[0]).toMatchObject({ next: 0, left: 0 });
  });
});
