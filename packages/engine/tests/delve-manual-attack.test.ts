import { describe, it, expect } from 'vitest';
import { stepWorld } from '../src/arpg/step.js';
import type { ArpgEvent, ArpgInput, ArpgWorld, Vec } from '../src/types/arpg.js';
import { arena, bal, damaged, dummy, registry, STEP } from './fixtures/arena.js';

// The hero starts at (13, 36) with a sword (melee, reach 1.9, 120° arc).
function hold(w: ArpgWorld, seconds: number, attack: boolean, aim: Vec | null = null): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  const input: ArpgInput = { move: { x: 0, y: 0 }, attack, attackAim: aim };
  for (let i = 0; i < Math.round(seconds / STEP); i++)
    events.push(...stepWorld(registry, w, input, STEP));
  return events;
}
const basics = (events: ArpgEvent[]) => events.filter((e) => e.kind === 'basic').length;

describe('manual basic attacks', () => {
  it('does nothing until the attack is held, even with a foe in reach', () => {
    const w = arena([dummy(13, 34.6)]);
    expect(basics(hold(w, 1, false))).toBe(0);
    expect(damaged(w.monsters[0])).toBe(false);
  });

  it('held with no aim point, it attacks the nearest foe on the weapon timer', () => {
    const w = arena([dummy(13, 34.6)]);
    const n = basics(hold(w, 2, true));
    expect(n).toBeGreaterThanOrEqual(Math.floor(2 / w.hero.stats.attackInterval));
    expect(damaged(w.monsters[0])).toBe(true);
  });

  it('a tap between frames still swings once', () => {
    const w = arena([dummy(13, 34.6)]);
    const once = stepWorld(registry, w, { move: { x: 0, y: 0 }, attack: true }, STEP);
    expect(basics(once)).toBe(1);
    expect(basics(hold(w, 1, false))).toBe(0);
  });

  it('aimed, it swings toward the aim point and misses what is behind', () => {
    const w = arena([dummy(13, 34.6), dummy(13, 37.4)]);
    hold(w, 0.1, true, { x: 13, y: 30 });
    expect(damaged(w.monsters[0])).toBe(true);
    expect(damaged(w.monsters[1])).toBe(false);
  });

  it('a whiff uses the timer but gives no mana', () => {
    const w = arena([dummy(13, 20)]);
    w.hero.mana = 0;
    w.hero.manaRegen = 0;
    expect(basics(hold(w, 0.1, true, { x: 20, y: 36 }))).toBe(1);
    expect(w.hero.nextAttackAt).toBeGreaterThan(w.t);
    expect(w.hero.mana).toBe(0);
  });
});

describe('the melee combo', () => {
  it('resets after a pause longer than the attack interval plus the grace', () => {
    const w = arena([dummy(13, 34.6)]);
    hold(w, w.hero.stats.attackInterval * 1.5, true);
    expect(w.hero.attackCount).toBe(2);
    hold(w, w.hero.stats.attackInterval + bal.hero.basicComboGrace + 0.1, false);
    hold(w, STEP, true);
    expect(w.hero.attackCount).toBe(1);
  });

  it('auto mode is unchanged: it attacks by itself', () => {
    const w = arena([dummy(13, 34.6)]);
    const events: ArpgEvent[] = [];
    for (let i = 0; i < 30; i++)
      events.push(...stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP));
    expect(basics(events)).toBeGreaterThan(0);
  });
});
