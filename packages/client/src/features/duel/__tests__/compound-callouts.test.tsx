// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { groupEventsIntoSwings } from '../combat-log-grouper.js';
import { SwingGroupComponent } from '../SwingGroup.js';
import type { SwingGroup } from '../combat-log-grouper.js';

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

describe('SwingGroupComponent - compound suppression', () => {
  it('does not render redundant trigger_proc rows when a matching compound_trigger banner exists', () => {
    const group: SwingGroup = {
      type: 'attack',
      time: 1,
      attacker: 0,
      target: 1,
      events: [
        { time: 1, event: { type: 'attack', attacker: 0, breakdown: {
          dodged: false, physical: { raw: 50, armorPoints: 0, armorPenetration: 0, effectiveArmor: 0, reductionPct: 0, mitigated: 0, net: 50 },
          elemental: {}, blocked: 0, barrierAbsorbed: 0, totalRaw: 50, totalMitigated: 0, totalNet: 50, isCrit: false,
        } } },
        { time: 1, event: { type: 'compound_trigger', player: 0, compoundId: 'ignite', displayName: 'IGNITE!' } },
        { time: 1, event: { type: 'trigger_proc', player: 0, triggerId: 'ignite', effectDescription: 'compound_dot' } },
      ],
    };
    const { container } = render(<SwingGroupComponent group={group} />);
    const text = container.textContent ?? '';
    // Compound banner present
    expect(text).toContain('IGNITE!');
    // Redundant trigger_proc row absent (its effectDescription would say "compound_dot")
    expect(text).not.toContain('compound_dot');
  });

  it('still renders trigger_proc rows that have NO matching compound_trigger', () => {
    const group: SwingGroup = {
      type: 'attack',
      time: 1,
      attacker: 0,
      target: 1,
      events: [
        { time: 1, event: { type: 'attack', attacker: 0, breakdown: {
          dodged: false, physical: { raw: 50, armorPoints: 0, armorPenetration: 0, effectiveArmor: 0, reductionPct: 0, mitigated: 0, net: 50 },
          elemental: {}, blocked: 0, barrierAbsorbed: 0, totalRaw: 50, totalMitigated: 0, totalNet: 50, isCrit: false,
        } } },
        { time: 1, event: { type: 'trigger_proc', player: 0, triggerId: 'chance_on_hit', effectDescription: 'bonus_damage' } },
      ],
    };
    const { container } = render(<SwingGroupComponent group={group} />);
    expect(container.textContent ?? '').toContain('On Hit: bonus damage');
  });
});

describe('SwingGroupComponent — human-readable trigger labels', () => {
  it('renders Counter Strike trigger_proc as "Counter Strike: echo damage" (not raw kind)', () => {
    const group: SwingGroup = {
      type: 'attack',
      time: 1,
      attacker: 1, // enemy attacks player
      target: 0,
      events: [
        { time: 1, event: { type: 'attack', attacker: 1, breakdown: {
          dodged: false, physical: { raw: 50, armorPoints: 0, armorPenetration: 0, effectiveArmor: 0, reductionPct: 0, mitigated: 0, net: 50 },
          elemental: {}, blocked: 50, barrierAbsorbed: 0, totalRaw: 50, totalMitigated: 0, totalNet: 0, isCrit: false,
        } } },
        { time: 1, event: { type: 'trigger_proc', player: 0, triggerId: 'counter_strike', effectDescription: 'bonus_damage_scaled' } },
      ],
    };
    const { container } = render(<SwingGroupComponent group={group} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Counter Strike: echo damage');
    expect(text).not.toContain('bonus_damage_scaled');
  });
});

describe('SwingGroupComponent — compound banner + child rendering order', () => {
  it('renders compound_trigger banner BEFORE damage rows + dot_apply as indented child', () => {
    const group: SwingGroup = {
      type: 'attack',
      time: 1,
      attacker: 0,
      target: 1,
      events: [
        { time: 1, event: { type: 'attack', attacker: 0, breakdown: {
          dodged: false, physical: { raw: 50, armorPoints: 0, armorPenetration: 0, effectiveArmor: 0, reductionPct: 0, mitigated: 0, net: 50 },
          elemental: {}, blocked: 0, barrierAbsorbed: 0, totalRaw: 50, totalMitigated: 0, totalNet: 50, isCrit: false,
        } } },
        { time: 1, event: { type: 'compound_trigger', player: 0, compoundId: 'ignite', displayName: 'IGNITE!' } },
        { time: 1, event: { type: 'dot_apply', target: 1, element: 'fire', dps: 15, duration: 12 } },
      ],
    };
    const { container } = render(<SwingGroupComponent group={group} />);
    const text = container.textContent ?? '';
    expect(text).toContain('IGNITE!');
    // dot_apply row should render with the dps + duration
    expect(text).toMatch(/15.*dps|dps.*15/);
    expect(text).toMatch(/12s/);
    // banner appears before damage rows: find indices
    const bannerIdx = text.indexOf('IGNITE!');
    const damageIdx = text.indexOf('50 physical');
    expect(bannerIdx).toBeGreaterThanOrEqual(0);
    expect(damageIdx).toBeGreaterThan(bannerIdx); // banner first, then damage
  });
});
