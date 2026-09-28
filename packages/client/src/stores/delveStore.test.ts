import { describe, it, expect, beforeEach } from 'vitest';
import { generateItem, SeededRNG } from '@alloy/engine';
import { useDelveStore, DELVE_SAVE_KEY, MANUAL_ATTACK_KEY, loadDelveProfile } from './delveStore';
import { getDelveRegistry } from '@/features/delve/registry';

const registry = getDelveRegistry();

describe('delveStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234, 'fire');
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
    expect(loadDelveProfile()?.profile.dive?.depth).toBe(1);
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

  it('remembers the basic attack mode on this device', () => {
    expect(useDelveStore.getState().manualAttack).toBe(false);
    useDelveStore.getState().setManualAttack(true);
    expect(useDelveStore.getState().manualAttack).toBe(true);
    expect(localStorage.getItem(MANUAL_ATTACK_KEY)).toBe('1');
    useDelveStore.getState().setManualAttack(false);
    expect(localStorage.getItem(MANUAL_ATTACK_KEY)).toBe('0');
  });

  it('sets an ability build and persists it', () => {
    useDelveStore
      .getState()
      .setAbility('primary', { form: 'burst', elements: ['fire'], weight: 1, payment: 'cast' });
    expect(useDelveStore.getState().profile.abilities.primary).toMatchObject({
      form: 'burst',
      elements: ['fire'],
    });
    expect(loadDelveProfile()?.profile.abilities.primary.form).toBe('burst');
  });

  it('refuses a form from another slot', () => {
    expect(() =>
      useDelveStore
        .getState()
        .setAbility('primary', { form: 'nova', elements: ['fire'], weight: 0, payment: 'mana' }),
    ).toThrow(/primary/);
    expect(useDelveStore.getState().profile.abilities.primary.form).toBe('bolt');
  });

  it('a reset takes a primary; without one the choice is still to make', () => {
    expect(useDelveStore.getState().profile.pair).toEqual({ primary: 'fire', secondary: null });
    useDelveStore.getState().resetProfile(99);
    expect(useDelveStore.getState().profile.pair.primary).toBeNull();
  });

  it('reads an older save back migrated, with the builds it fixed', () => {
    const { pair: _pair, manaDust: _dust, ...rest } = useDelveStore.getState().profile;
    const frostWard = { ...rest.abilities.defensive, elements: ['frost'] };
    localStorage.setItem(
      DELVE_SAVE_KEY,
      JSON.stringify({
        ...rest,
        version: 3,
        abilities: { ...rest.abilities, defensive: frostWard },
      }),
    );
    const loaded = loadDelveProfile()!;
    expect(loaded.profile).toMatchObject({
      version: 4,
      pair: { primary: 'fire', secondary: null },
    });
    expect(loaded.fixed.map((f) => f.slot)).toEqual(['defensive']);
  });
});
