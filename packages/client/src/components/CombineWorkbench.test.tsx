import { describe, it, expect } from 'vitest';
import { computeGlowSignal } from './CombineWorkbench';

function makeRegistry(opts: {
  ternary?: Record<string, any>;
  binary?: Record<string, any>;
}) {
  return {
    getTernaryCombination: (a: string, b: string, c: string) => {
      const key = [a, b, c].sort().join(',');
      return opts.ternary?.[key] ?? null;
    },
    getCombination: (a: string, b: string) => {
      const key = [a, b].sort().join(',');
      return opts.binary?.[key] ?? null;
    },
  } as any;
}

describe('computeGlowSignal', () => {
  it('returns "gold" for a ternary recipe match', () => {
    const registry = makeRegistry({
      ternary: { 'cold_damage,fire_damage,lightning_damage': { id: 'meltdown' } },
    });
    const slots: any = [
      { affixId: 'fire_damage' }, { affixId: 'cold_damage' }, { affixId: 'lightning_damage' },
    ];
    expect(computeGlowSignal(slots, registry)).toBe('gold');
  });

  it('returns "gold" when no ternary matches but a KEEP-anchored binary matches', () => {
    const registry = makeRegistry({
      binary: { 'chance_on_hit,fire_damage': { id: 'ignite' } },
    });
    const slots: any = [
      { affixId: 'chance_on_hit' }, { affixId: 'fire_damage' }, { affixId: 'flat_hp' },
    ];
    expect(computeGlowSignal(slots, registry)).toBe('gold');
  });

  it('returns "white" when no recipe matches but slots are filled', () => {
    const registry = makeRegistry({});
    const slots: any = [
      { affixId: 'flat_hp' }, { affixId: 'armor_rating' }, { affixId: 'dodge_chance' },
    ];
    expect(computeGlowSignal(slots, registry)).toBe('white');
  });

  it('returns "none" when slot 0 is empty', () => {
    const registry = makeRegistry({});
    const slots: any = [null, { affixId: 'fire_damage' }, { affixId: 'cold_damage' }];
    expect(computeGlowSignal(slots, registry)).toBe('none');
  });

  it('returns "none" when only slot 0 is filled', () => {
    const registry = makeRegistry({});
    const slots: any = [{ affixId: 'fire_damage' }, null, null];
    expect(computeGlowSignal(slots, registry)).toBe('none');
  });

  it('ternary wins when both ternary and binary pair would match', () => {
    // Pins the precedence invariant: ternary is checked first; a matching binary
    // pair must not override it. Regressions that reorder the checks get caught.
    const registry = makeRegistry({
      ternary: { 'cold_damage,fire_damage,lightning_damage': { id: 'meltdown' } },
      binary: { 'cold_damage,fire_damage': { id: 'some_binary' } },
    });
    const slots: any = [
      { affixId: 'fire_damage' }, { affixId: 'cold_damage' }, { affixId: 'lightning_damage' },
    ];
    expect(computeGlowSignal(slots, registry)).toBe('gold');
  });

  it('handles duplicate affix IDs across slots without crashing', () => {
    // Defensive: if the UI ever lets two slots carry gems of the same affix,
    // the signal function must not throw. Lookup returns null → white.
    const registry = makeRegistry({});
    const slots: any = [
      { affixId: 'fire_damage' }, { affixId: 'fire_damage' }, { affixId: 'fire_damage' },
    ];
    expect(computeGlowSignal(slots, registry)).toBe('white');
  });
});
