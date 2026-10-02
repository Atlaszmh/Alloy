import { describe, it, expect } from 'vitest';
import {
  createDelveProfile,
  startDive,
  type ArpgEvent,
  type ArpgWorld,
  type DropKind,
} from '@alloy/engine';
import { banksNow, diveWorldKey } from '../arena/useArena';
import { getDelveRegistry } from '../registry';

const world = (over: object = {}) =>
  ({
    pending: { items: [], scrap: 0, kills: 0, reactions: [], runes: [], ...over },
  }) as unknown as ArpgWorld;
const pickup = (dropKind: DropKind): ArpgEvent => ({
  kind: 'pickup',
  dropId: 1,
  dropKind,
  amount: 1,
});

describe("banking the dive's pickups", () => {
  it('banks a frame that picked up a material or scrap, or holds an item, a rune or a reaction', () => {
    expect(banksNow(world(), [pickup('material')])).toBe(true);
    expect(banksNow(world(), [pickup('scrap')])).toBe(true);
    expect(banksNow(world({ runes: [{ id: 'split', tier: 1 }] }), [])).toBe(true);
    expect(banksNow(world({ reactions: ['melt'] }), [])).toBe(true);
  });

  it("waits on a frame of motes, health orbs or kills alone: they bank with the floor's next pickup", () => {
    expect(banksNow(world(), [pickup('mote'), pickup('orb')])).toBe(false);
    expect(banksNow(world({ kills: 3 }), [])).toBe(false);
  });
});

describe("the dive's arena key", () => {
  it('names a floor under way; none at a stop, at the end, or once an abandon has settled the dive', () => {
    const registry = getDelveRegistry();
    const dive = startDive(registry, createDelveProfile(registry, 7), 1).dive!;
    expect(diveWorldKey(dive)).toBe('fighting:1');
    expect(diveWorldKey({ ...dive, phase: 'choosing' })).toBeNull();
    expect(diveWorldKey({ ...dive, phase: 'dead' })).toBeNull();
    // Abandoned mid-floor: a dive again at depth 1 is a new key, so a fresh floor.
    expect(diveWorldKey({ ...dive, settled: true })).toBeNull();
    expect(diveWorldKey(null)).toBeNull();
  });
});
