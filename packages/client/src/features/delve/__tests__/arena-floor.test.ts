import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alcoveOffers,
  beginFloor,
  createDelveProfile,
  exitFloor,
  startDive,
  takeAlcove,
  takeBestAlcove,
  type ArpgEvent,
  type ArpgWorld,
  type DelveProfile,
} from '@alloy/engine';
import {
  alcoveTake,
  floorOver,
  retriesDeath,
  routeFloorEvents,
  type ArenaUiEvent,
} from '../arena/useArena';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

// The floor flow's ops (B3's) are stubs until it lands: each test says what they do.
vi.mock('@alloy/engine', async (orig) => ({
  ...(await orig<typeof import('@alloy/engine')>()),
  exitFloor: vi.fn(),
  alcoveOffers: vi.fn(),
  takeAlcove: vi.fn(),
  takeBestAlcove: vi.fn(),
}));

const registry = getDelveRegistry();

describe("a floor's end", () => {
  it('comes when the hero falls, takes the exit, or clears the open room and its loot', () => {
    const w = beginFloor(registry, startDive(registry, createDelveProfile(registry, 7), 1));
    expect(floorOver(w)).toBe(false);
    expect(floorOver({ ...w, exited: true })).toBe(true);
    expect(floorOver({ ...w, heroDead: true })).toBe(true);
    expect(floorOver({ ...w, cleared: true, drops: [] })).toBe(true);
    const loot = [{ id: 1 }] as ArpgWorld['drops'];
    expect(floorOver({ ...w, cleared: true, clearedAt: w.t, drops: loot })).toBe(false);
  });

  it('a fall goes to the retry screen while the guided start runs, never to the dive', () => {
    const p = startDive(registry, createDelveProfile(registry, 7), 1);
    const w = beginFloor(registry, p);
    const guided = { ...p, tutorial: { step: 'walk', count: 0, misses: 0 } };
    expect(retriesDeath(guided, { ...w, heroDead: true })).toBe(true);
    expect(retriesDeath(guided, w)).toBe(false);
    expect(retriesDeath(p, { ...w, heroDead: true })).toBe(false);
  });
});

describe("a generated floor's requests", () => {
  const world = {} as ArpgWorld;
  let calls: string[];
  let ui: ArenaUiEvent[];
  const route = (events: ArpgEvent[], autopilot = false) =>
    routeFloorEvents(registry, world, events, {
      autopilot,
      bank: () => calls.push('bank'),
      onUi: (e) => ui.push(e),
    });
  beforeEach(() => {
    calls = [];
    ui = [];
    vi.mocked(exitFloor).mockClear();
    vi.mocked(alcoveOffers).mockImplementation(() => (calls.push('offers'), ['slot', 'upgrade']));
  });

  it('asks the page before the exit; the autopilot takes it at once', () => {
    route([{ kind: 'exitRequest', roomsUnexplored: 3 }]);
    expect(ui).toEqual([{ kind: 'exitRequest', unexplored: 3 }]);
    expect(exitFloor).not.toHaveBeenCalled();
    ui = [];
    route([{ kind: 'exitRequest', roomsUnexplored: 3 }], true);
    expect(exitFloor).toHaveBeenCalledWith(world);
    expect(ui).toEqual([]);
  });

  it("opens an alcove's dialog with its offers, priced on the save as a bank leaves it", () => {
    route([{ kind: 'alcoveOpen', id: '2:4' }]);
    expect(calls).toEqual(['bank', 'offers']);
    expect(alcoveOffers).toHaveBeenCalledWith(
      registry,
      useDelveStore.getState().profile,
      world,
      '2:4',
    );
    expect(ui).toEqual([{ kind: 'alcove', offers: ['slot', 'upgrade'] }]);
  });

  it('an alcove with nothing to offer opens no dialog: a notice says so', () => {
    useDelveStore.getState().takeNotices();
    vi.mocked(alcoveOffers).mockReturnValue([]);
    route([{ kind: 'alcoveOpen', id: '2:4' }]);
    expect(ui).toEqual([]);
    expect(useDelveStore.getState().takeNotices()).toEqual(['Nothing to forge here yet']);
  });

  it("under the autopilot, the bot takes an alcove's power-up itself, on the save a bank leaves", () => {
    const store = useDelveStore.getState();
    const before = startDive(registry, createDelveProfile(registry, 7), 1);
    const taken: DelveProfile = { ...before, scrap: before.scrap - 25 };
    store.setProfile(before);
    vi.mocked(takeBestAlcove).mockReturnValue(taken);
    route([{ kind: 'alcoveOpen', id: '2:4' }], true);
    expect(calls).toEqual(['bank']);
    expect(takeBestAlcove).toHaveBeenCalledWith(registry, before, world, '2:4');
    expect(useDelveStore.getState().profile).toBe(taken);
    expect(ui).toEqual([]);
  });

  it('passes every other event by', () => {
    route([
      { kind: 'roomCleared', roomId: 1 },
      { kind: 'seal', roomId: 2 },
    ]);
    expect([calls, ui]).toEqual([[], []]);
  });
});

describe("taking an alcove's power-up", () => {
  it('banks first, runs takeAlcove on the save that bank left, and keeps what it gives', () => {
    const store = useDelveStore.getState();
    const before = startDive(registry, createDelveProfile(registry, 7), 1);
    store.setProfile(before);
    const banked: DelveProfile = { ...before, scrap: before.scrap + 40 };
    const after: DelveProfile = { ...banked, scrap: banked.scrap - 25 };
    vi.mocked(takeAlcove).mockReturnValue({ ok: true, profile: after });
    const world = {} as ArpgWorld;
    const action = { kind: 'upgrade', uid: 'h1' } as const;
    const res = alcoveTake(registry, world, action, () =>
      useDelveStore.getState().setProfile(banked),
    );
    expect(takeAlcove).toHaveBeenCalledWith(registry, banked, world, action);
    expect(res.ok).toBe(true);
    expect(useDelveStore.getState().profile).toEqual(after);
    vi.mocked(takeAlcove).mockReturnValue({ ok: false, profile: banked, reason: 'Used' });
    expect(alcoveTake(registry, world, action, () => {}).reason).toBe('Used');
    expect(useDelveStore.getState().profile).toEqual(after);
  });
});
