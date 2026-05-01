// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { groupEventsIntoSwings } from '../combat-log-grouper.js';

describe('combat-log-grouper - compound triggers', () => {
  it('groups compound_trigger + same-frame trigger_proc/dot_apply under a single banner group', () => {
    const events = [
      { time: 1, event: { type: 'attack' as const, attacker: 0 as const, breakdown: {} as never } },
      { time: 1, event: { type: 'compound_trigger' as const, player: 0 as const, compoundId: 'frostbite', displayName: 'FROSTBITE!' } },
      { time: 1, event: { type: 'dot_apply' as const, target: 1 as const, element: 'cold' as const, dps: 10, duration: 6 } },
      { time: 1, event: { type: 'trigger_proc' as const, player: 0 as const, triggerId: 'frostbite', effectDescription: 'apply_slow' } },
    ];

    const groups = groupEventsIntoSwings(events);

    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('attack');
    expect(groups[0].events.some((e) => e.event.type === 'compound_trigger')).toBe(true);
    expect(groups[0].events.some((e) => e.event.type === 'dot_apply')).toBe(true);
    expect(groups[0].events.some((e) => e.event.type === 'trigger_proc')).toBe(true);
  });
});
