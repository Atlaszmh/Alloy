import { describe, it, expect } from 'vitest';
import {
  addMaterial,
  bankWorld,
  beginFloor,
  createDelveProfile,
  emptyHaul,
  startDive,
  type WorldPending,
} from '@alloy/engine';
import { BANK_EVERY, banksNow, clearFloor, diveWorldKey } from '../arena/useArena';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

const pending = (over: Partial<WorldPending> = {}): WorldPending => ({
  items: [],
  scrap: 0,
  kills: 0,
  reactions: [],
  runes: [],
  haul: emptyHaul(),
  patterns: [],
  questEvents: [],
  newFloor: false,
  ...over,
});
const IRON = { kind: 'metal', metal: 'iron' } as const;

describe("banking the dive's pickups", () => {
  it('banks an item, a rune, a pattern, an essence or a new reaction at once', () => {
    const ess = addMaterial(emptyHaul(), { kind: 'essence', essence: 'pyroclasm' });
    expect(banksNow(pending({ runes: [{ id: 'split', tier: 1 }] }), 0)).toBe(true);
    expect(banksNow(pending({ reactions: ['melt'] }), 0)).toBe(true);
    expect(banksNow(pending({ reactions: ['melt', 'overload'] }), 0, ['melt'])).toBe(true);
    // A pattern is learned and an essence seen as it is picked up (the crafting spec's S1).
    expect(banksNow(pending({ patterns: ['maul'] }), 0)).toBe(true);
    expect(banksNow(pending({ haul: ess }), 0)).toBe(true);
  });

  it('banks materials and scrap at most every BANK_EVERY seconds (each bank writes the save); kills alone wait', () => {
    const bar = pending({ haul: addMaterial(emptyHaul(), IRON) });
    expect(banksNow(bar, BANK_EVERY / 2)).toBe(false);
    expect(banksNow(bar, BANK_EVERY)).toBe(true);
    expect(banksNow(pending({ scrap: 3 }), BANK_EVERY / 2)).toBe(false);
    expect(banksNow(pending({ scrap: 3 }), BANK_EVERY)).toBe(true);
    expect(banksNow(pending({ kills: 3 }), 10)).toBe(false);
  });

  it('a reaction already seen rides the BANK_EVERY throttle (it fires every frame in a fight)', () => {
    const melt = pending({ reactions: ['melt'] });
    expect(banksNow(melt, BANK_EVERY / 2, ['melt'])).toBe(false);
    expect(banksNow(melt, BANK_EVERY, ['melt'])).toBe(true);
  });

  it('banks quest events at most every BANK_EVERY seconds too, so the HUD tracker moves as they come', () => {
    const dodge = pending({ questEvents: [{ type: 'perfectDodge' }] });
    expect(banksNow(dodge, BANK_EVERY / 2)).toBe(false);
    expect(banksNow(dodge, BANK_EVERY)).toBe(true);
    const kill = { type: 'kill', kind: 'normal', biome: 'cinder_mines', element: 'fire' } as const;
    expect(banksNow(pending({ kills: 1, questEvents: [kill] }), BANK_EVERY)).toBe(true);
  });

  it('a burst of pickups over a second of frames banks a bounded number of times and loses nothing', () => {
    const registry = getDelveRegistry();
    let p = startDive(registry, createDelveProfile(registry, 7), 1);
    const world = beginFloor(registry, p);
    let banks = 0;
    let last = -Infinity;
    for (let frame = 0; frame < 60; frame++) {
      const now = frame / 60;
      world.pending.scrap += 2;
      world.pending.haul = addMaterial(world.pending.haul, IRON);
      if (banksNow(world.pending, now - last)) {
        p = bankWorld(registry, p, world).profile;
        banks++;
        last = now;
      }
    }
    // The floor's end always banks what waits.
    p = bankWorld(registry, p, world).profile;
    expect(banks).toBeLessThanOrEqual(Math.ceil(1 / BANK_EVERY) + 1);
    expect(p.dive!.haul.scrap).toBe(120);
    expect(p.dive!.haul.metals.iron).toBe(60);
  });
});

describe('a cleared floor', () => {
  it('completes on the save as the last bank left it, so nothing that bank took is lost', () => {
    const registry = getDelveRegistry();
    const store = useDelveStore.getState();
    store.setProfile(startDive(registry, createDelveProfile(registry, 7), 1));
    const world = beginFloor(registry, useDelveStore.getState().profile);
    world.pending.scrap = 25;
    world.pending.haul = addMaterial(emptyHaul(), IRON, 2);
    const bank = (w: typeof world) => {
      const s = useDelveStore.getState();
      s.setProfile(bankWorld(registry, s.profile, w).profile);
    };
    const { haul } = clearFloor(registry, world, bank);
    expect([haul.scrap, haul.metals.iron]).toEqual([25, 2]);
    const dive = useDelveStore.getState().profile.dive!;
    expect(dive.phase).toBe('choosing');
    expect([dive.banked.scrap, dive.banked.metals.iron]).toEqual([25, 2]);
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
