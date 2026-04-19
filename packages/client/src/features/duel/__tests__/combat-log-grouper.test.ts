import { describe, it, expect } from 'vitest';
import { groupEventsIntoSwings } from '../combat-log-grouper.js';

describe('groupEventsIntoSwings', () => {
  it('groups attack + heal into one swing group', () => {
    const events = [
      { time: 1.0, event: { type: 'attack', attacker: 0, breakdown: { dodged: false, physical: { raw: 40, armorPoints: 10, armorPenetration: 0, effectiveArmor: 10, reductionPct: 10, mitigated: 4, net: 36 }, elemental: {}, blocked: 0, barrierAbsorbed: 0, totalRaw: 40, totalMitigated: 4, totalNet: 36, isCrit: false } } },
      { time: 1.0, event: { type: 'heal', player: 0, breakdown: { source: 'lifesteal', rawHeal: 8, effectiveHeal: 8, overheal: 0 } } },
      { time: 1.0, event: { type: 'hp_change', player: 1, oldHP: 200, newHP: 164, maxHP: 200 } },
    ];
    const groups = groupEventsIntoSwings(events as any);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('attack');
    expect(groups[0].events).toHaveLength(3);
  });

  it('separates DOT ticks into their own groups', () => {
    const events = [
      { time: 2.0, event: { type: 'dot_tick', target: 1, breakdown: { element: 'fire', damagePerSecond: 5, stacks: 2, rawTotal: 10, resistPoints: 0, elementalPenetration: 0, effectiveResist: 0, reductionPct: 0, netDamage: 10 } } },
      { time: 3.0, event: { type: 'attack', attacker: 0, breakdown: { dodged: false, physical: { raw: 40, armorPoints: 0, armorPenetration: 0, effectiveArmor: 0, reductionPct: 0, mitigated: 0, net: 40 }, elemental: {}, blocked: 0, barrierAbsorbed: 0, totalRaw: 40, totalMitigated: 0, totalNet: 40, isCrit: false } } },
    ];
    const groups = groupEventsIntoSwings(events as any);
    expect(groups).toHaveLength(2);
    expect(groups[0].type).toBe('dot_tick');
    expect(groups[1].type).toBe('attack');
  });

  it('returns empty array for no events', () => {
    const groups = groupEventsIntoSwings([]);
    expect(groups).toHaveLength(0);
  });

  it('creates a death group', () => {
    const events = [
      { time: 3.3, event: { type: 'death', player: 1 } },
    ];
    const groups = groupEventsIntoSwings(events as any);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('death');
  });

  it('groups standalone heal (regen) into its own group', () => {
    const events = [
      { time: 1.7, event: { type: 'heal', player: 0, breakdown: { source: 'regen', rawHeal: 12, effectiveHeal: 12, overheal: 0 } } },
      { time: 1.7, event: { type: 'hp_change', player: 0, oldHP: 188, newHP: 200, maxHP: 200 } },
    ];
    const groups = groupEventsIntoSwings(events as any);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('heal');
    expect(groups[0].events).toHaveLength(2);
  });

  it('attaches hp_change / trigger_proc to current attack group at same time', () => {
    const events = [
      { time: 1.0, event: { type: 'attack', attacker: 1, breakdown: { dodged: false, physical: { raw: 20, armorPoints: 0, armorPenetration: 0, effectiveArmor: 0, reductionPct: 0, mitigated: 0, net: 20 }, elemental: {}, blocked: 0, barrierAbsorbed: 0, totalRaw: 20, totalMitigated: 0, totalNet: 20, isCrit: false } } },
      { time: 1.0, event: { type: 'trigger_proc', player: 1, triggerId: 'burn', effectDescription: 'Apply burn' } },
      { time: 1.0, event: { type: 'hp_change', player: 0, oldHP: 200, newHP: 180, maxHP: 200 } },
    ];
    const groups = groupEventsIntoSwings(events as any);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('attack');
    expect(groups[0].events).toHaveLength(3);
    expect(groups[0].attacker).toBe(1);
  });

  it('creates separate groups for events at different times', () => {
    const events = [
      { time: 1.0, event: { type: 'attack', attacker: 0, breakdown: { dodged: false, physical: { raw: 30, armorPoints: 0, armorPenetration: 0, effectiveArmor: 0, reductionPct: 0, mitigated: 0, net: 30 }, elemental: {}, blocked: 0, barrierAbsorbed: 0, totalRaw: 30, totalMitigated: 0, totalNet: 30, isCrit: false } } },
      { time: 2.0, event: { type: 'attack', attacker: 1, breakdown: { dodged: false, physical: { raw: 25, armorPoints: 0, armorPenetration: 0, effectiveArmor: 0, reductionPct: 0, mitigated: 0, net: 25 }, elemental: {}, blocked: 0, barrierAbsorbed: 0, totalRaw: 25, totalMitigated: 0, totalNet: 25, isCrit: false } } },
    ];
    const groups = groupEventsIntoSwings(events as any);
    expect(groups).toHaveLength(2);
    expect(groups[0].attacker).toBe(0);
    expect(groups[1].attacker).toBe(1);
  });

  it('attaches compound_trigger events to the same-time attack group', () => {
    const events = [
      { time: 1.0, event: { type: 'attack', attacker: 0, breakdown: { dodged: false, physical: { raw: 10, armorPoints: 0, armorPenetration: 0, effectiveArmor: 0, reductionPct: 0, mitigated: 0, net: 10 }, elemental: {}, blocked: 0, barrierAbsorbed: 0, totalRaw: 10, totalMitigated: 0, totalNet: 10, isCrit: false } } },
      { time: 1.0, event: { type: 'compound_trigger', player: 0, compoundId: 'ignite', displayName: 'IGNITE!' } },
      { time: 1.0, event: { type: 'dot_apply', target: 1, element: 'fire', dps: 6, duration: 12 } },
    ];
    const groups = groupEventsIntoSwings(events as any);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('attack');
    expect(groups[0].events).toHaveLength(3);
    const compoundEvent = groups[0].events.find(
      (e) => e.event.type === 'compound_trigger',
    );
    expect(compoundEvent).toBeDefined();
  });
});
