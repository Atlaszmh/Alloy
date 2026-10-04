import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tutorialBlocksDive } from '@alloy/engine';
import { useDelveStore } from './delveStore';

// The runner is the tutorial's B1: each test says whether a lesson holds the Delve.
vi.mock('@alloy/engine', async (orig) => ({
  ...(await orig<typeof import('@alloy/engine')>()),
  tutorialBlocksDive: vi.fn(() => null),
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
});
