import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import delveData from '../src/data/delve.json';
import { BalanceConfigSchema, DelveDataSchema } from '../src/data/schemas.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { bal, gear, registry } from './fixtures/arena.js';

// See the chain feel spec. The fixture arena's hero stands at (13, 36) facing up (−y);
// `dummy(x, y)` is a sturdy Fire foe that doesn't fight back.

const TEMPO: Record<string, number> = {
  wand: 0.8,
  dagger: 0.85,
  bow: 0.95,
  sword: 1,
  staff: 1.05,
  axe: 1.15,
  maul: 1.3,
};

describe('balance: tempo, hold stages and beats', () => {
  it('loads the numbers', () => {
    expect(bal.hero.tempo).toBe(1);
    expect(bal.chains.holdStages).toEqual([0.5, 1]);
    expect(bal.chains.beat).toEqual({ light: 0.25, medium: 0.4, heavy: 0.6, hold: 0.8 });
    expect(bal.chains.beatSlot).toEqual({ primary: 1, defensive: 0.75, ultimate: 1.5 });
    const weapons = registry.getGearBasesForSlot('weapon');
    expect(Object.fromEntries(weapons.map((b) => [b.id, b.tempo]))).toEqual(TEMPO);
  });

  it('refuses a stage past full charge, a beat or tempo that is not positive, and a weapon with no tempo', () => {
    const chains = (o: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: { ...balanceData.delve, chains: { ...balanceData.delve.chains, ...o } },
      }).success;
    const hero = (o: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: { ...balanceData.delve, hero: { ...balanceData.delve.hero, ...o } },
      }).success;
    expect(chains({})).toBe(true);
    expect(chains({ holdStages: [0.5, 1.1] })).toBe(false);
    expect(chains({ holdStages: [1, 1] })).toBe(false);
    expect(chains({ beat: { ...bal.chains.beat, heavy: 0 } })).toBe(false);
    expect(chains({ beatSlot: { ...bal.chains.beatSlot, ultimate: -1 } })).toBe(false);
    expect(hero({ tempo: 0 })).toBe(false);

    const bases = (edit: (b: Record<string, unknown>) => Record<string, unknown>) =>
      DelveDataSchema.safeParse({
        ...delveData,
        bases: delveData.bases.map((b) => (b.id === 'maul' ? edit(b) : b)),
      }).success;
    expect(bases((b) => b)).toBe(true);
    expect(bases(({ tempo: _tempo, ...b }) => b)).toBe(false);
    expect(bases((b) => ({ ...b, tempo: 0 }))).toBe(false);
  });
});

describe('tempo', () => {
  it("is the weapon's, and the hero's unarmed", () => {
    for (const [baseId, tempo] of Object.entries(TEMPO)) {
      const weapon = gear('fire', 'weapon', baseId);
      expect(computeHeroStats({ weapon }, registry).tempo, baseId).toBe(tempo);
    }
    expect(computeHeroStats({}, registry).tempo).toBe(bal.hero.tempo);
  });
});
