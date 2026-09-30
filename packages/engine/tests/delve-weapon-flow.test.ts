import { describe, it, expect } from 'vitest';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { MOVE_KINDS } from '../src/types/ability.js';
import { bal, gear, registry } from './fixtures/arena.js';

// See the weapon flow spec. The fixture arena's hero stands at (13, 36) facing up (−y);
// `dummy(x, y)` is a sturdy Fire foe that doesn't fight back.

const weapons = registry.getGearBasesForSlot('weapon');
/** Each weapon's `key` by kind (light, medium, heavy, hold), 0 where a row leaves it out. */
const byKind = (key: 'move' | 'side' | 'hop') =>
  Object.fromEntries(weapons.map((b) => [b.id, MOVE_KINDS.map((k) => b.feel![k][key] ?? 0)]));
const NONE = [0, 0, 0, 0];

describe('data: weapon styles', () => {
  it('loads the feel numbers', () => {
    expect(bal.feel.stepSeconds).toBe(0.15);
    expect(bal.feel.actionMove).toBe(0.6);
    expect(bal.feel.sideSteer).toBe(0.3);
  });

  it("each weapon's side steps, hops and sway", () => {
    expect(byKind('side')).toEqual({
      dagger: NONE,
      sword: NONE,
      axe: NONE,
      maul: NONE,
      staff: [0.5, 0.7, 1.0, 1.3],
      wand: [0.35, 0.45, 0.6, 0.8],
      bow: NONE,
    });
    expect(byKind('hop')).toEqual({
      dagger: [0, 0, 0.8, 0.8],
      sword: NONE,
      axe: NONE,
      maul: NONE,
      staff: NONE,
      wand: NONE,
      bow: NONE,
    });
    expect(Object.fromEntries(weapons.map((b) => [b.id, b.sway ?? 'alternate']))).toEqual({
      dagger: 'alternate',
      sword: 'alternate',
      axe: 'alternate',
      maul: 'alternate',
      staff: 'alternate',
      wand: 'orbit',
      bow: 'alternate',
    });
    // Unarmed keeps its small lunge, and has no step.
    for (const k of MOVE_KINDS) {
      expect(bal.hero.feel[k].side ?? 0).toBe(0);
      expect(bal.hero.feel[k].hop ?? 0).toBe(0);
    }
  });

  it("the hero's weapon carries its sway", () => {
    const sway = (baseId: string) =>
      computeHeroStats({ weapon: gear('fire', 'weapon', baseId) }, registry).weapon.sway;
    expect(sway('wand')).toBe('orbit');
    expect(sway('staff')).toBe('alternate');
    expect(computeHeroStats({}, registry).weapon.sway).toBe('alternate');
  });
});
