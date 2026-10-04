import { describe, it, expect, beforeEach, vi } from 'vitest';
import { retryTutorialDepth, tutorialBlocksDive, type DelveProfile } from '@alloy/engine';
import { useDelveStore } from './delveStore';

// The runner is the tutorial's B1: each test says whether a lesson holds the Delve, and a retry
// gives the save back as it is.
vi.mock('@alloy/engine', async (orig) => ({
  ...(await orig<typeof import('@alloy/engine')>()),
  tutorialBlocksDive: vi.fn(() => null),
  retryTutorialDepth: vi.fn((_r: unknown, p: DelveProfile) => p),
}));

const store = () => useDelveStore.getState();

describe('delveStore: the guided start', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(tutorialBlocksDive).mockReturnValue(null);
    store().resetProfile(1234, 'fire');
  });

  it("never starts a dive while Hesta's lesson holds the Delve", () => {
    vi.mocked(tutorialBlocksDive).mockReturnValue("Finish Hesta's lesson or skip it");
    expect(store().startDive(1)).toBe(false);
    expect(store().profile.dive).toBeNull();
    vi.mocked(tutorialBlocksDive).mockReturnValue(null);
    expect(store().startDive(1)).toBe(true);
    expect(store().profile.dive?.depth).toBe(1);
  });

  it("a retry forgets the floor's finds: the Found log keeps the dive's from before it", () => {
    store().startDive(1);
    store().pushDiveDrops(['a']);
    store().pushDiveRunes([{ id: 'split', tier: 1 }]);
    store().pushDivePatterns(['maul']);
    useDelveStore.setState({ floorDropsFrom: 1, floorRunesFrom: 0, floorPatternsFrom: 1 });
    store().pushDiveDrops(['b', 'c']);
    store().pushDiveRunes([{ id: 'quick', tier: 2 }]);
    store().retryTutorialDepth();
    expect(retryTutorialDepth).toHaveBeenCalledTimes(1);
    expect(store()).toMatchObject({ diveDrops: ['a'], diveRunes: [], divePatterns: ['maul'] });
  });
});
