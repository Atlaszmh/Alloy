import { describe, it, expect, beforeEach } from 'vitest';
import { generateItem, SeededRNG } from '@alloy/engine';
import { useDelveStore, DELVE_SAVE_KEY, loadDelveProfile } from './delveStore';
import { getDelveRegistry } from '@/features/delve/registry';

const registry = getDelveRegistry();

describe('delveStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234);
  });

  it('starts a fresh profile with starter gear', () => {
    const { profile } = useDelveStore.getState();
    expect(profile.equipped.weapon).toBeDefined();
    expect(profile.bag).toHaveLength(0);
  });

  it('persists every profile change to localStorage', () => {
    useDelveStore.getState().startDive(1);
    const saved = JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!);
    expect(saved.dive.depth).toBe(1);
    expect(loadDelveProfile()?.dive?.depth).toBe(1);
  });

  it('falls back to a new profile when the save is corrupt', () => {
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":1,"broken":true}');
    expect(loadDelveProfile()).toBeNull();
    localStorage.setItem(DELVE_SAVE_KEY, 'not json');
    expect(loadDelveProfile()).toBeNull();
  });

  it('equips from the bag and tracks new items', () => {
    const item = generateItem(
      registry,
      { uid: 'x1', ilvl: 3, rarity: 'rare', slot: 'helm' },
      new SeededRNG(1),
    );
    const s = useDelveStore.getState();
    s.setProfile({ ...s.profile, bag: [item] });
    s.markNew(['x1']);
    expect(useDelveStore.getState().newUids.x1).toBe(true);
    useDelveStore.getState().equip('x1');
    expect(useDelveStore.getState().profile.equipped.helm?.uid).toBe('x1');
    expect(useDelveStore.getState().newUids.x1).toBeUndefined();
  });

  it('salvage returns scrap gained', () => {
    const item = generateItem(
      registry,
      { uid: 'x2', ilvl: 3, rarity: 'magic', slot: 'ring' },
      new SeededRNG(2),
    );
    const s = useDelveStore.getState();
    s.setProfile({ ...s.profile, bag: [item] });
    const scrap = useDelveStore.getState().salvage(['x2']);
    expect(scrap).toBeGreaterThan(0);
    expect(useDelveStore.getState().profile.scrap).toBe(scrap);
  });

  it('upgrade reports failure reasons', () => {
    const uid = useDelveStore.getState().profile.equipped.weapon!.uid;
    const res = useDelveStore.getState().upgrade(uid);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/scrap/i);
  });

  it('cycles playback speed 1 → 2 → 4 → 1 and persists it', () => {
    const s = useDelveStore.getState();
    s.setSpeed(1);
    useDelveStore.getState().cycleSpeed();
    expect(useDelveStore.getState().speed).toBe(2);
    useDelveStore.getState().cycleSpeed();
    expect(useDelveStore.getState().speed).toBe(4);
    useDelveStore.getState().cycleSpeed();
    expect(useDelveStore.getState().speed).toBe(1);
    expect(localStorage.getItem('alloy:delve:speed')).toBe('1');
  });
});
