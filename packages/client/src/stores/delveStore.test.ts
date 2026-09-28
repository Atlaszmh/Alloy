import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateItem, SeededRNG, type BuildFix, type GearSlot } from '@alloy/engine';
import {
  useDelveStore,
  BIND_HINT,
  DELVE_SAVE_KEY,
  MANUAL_ATTACK_KEY,
  fixNotice,
  loadDelveProfile,
  overtakeNotice,
} from './delveStore';
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

  it('salvage returns the scrap and Mana Dust gained', () => {
    const item = generateItem(
      registry,
      { uid: 'x2', ilvl: 3, rarity: 'magic', slot: 'ring' },
      new SeededRNG(2),
    );
    const s = useDelveStore.getState();
    // Frost is outside the fire hero's pair, so it melts into Mana Dust too.
    s.setProfile({ ...s.profile, bag: [{ ...item, mana: 'frost' }] });
    const { scrap, dust } = useDelveStore.getState().salvage(['x2']);
    expect(scrap).toBeGreaterThan(0);
    expect(dust).toBe(registry.getDelveBalance().pair.salvageDust.magic);
    expect(useDelveStore.getState().profile).toMatchObject({ scrap, manaDust: dust });
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

  it('a new store migrates the save, writes it back and queues the fixed builds as notices', async () => {
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
    // A fresh module and no cached store, as on a page load.
    (globalThis as { __alloyStoreCache?: Map<string, unknown> }).__alloyStoreCache?.delete(
      'delveStore',
    );
    vi.resetModules();
    const fresh = (await import('./delveStore')).useDelveStore;
    expect(fresh.getState().notices).toEqual([
      BIND_HINT,
      "Your Ward used Frost, which isn't in your pair; it now uses Fire",
    ]);
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!).version).toBe(4);
  });

  it('a save that is already version 4 gets no bind hint', async () => {
    localStorage.setItem(DELVE_SAVE_KEY, JSON.stringify(useDelveStore.getState().profile));
    (globalThis as { __alloyStoreCache?: Map<string, unknown> }).__alloyStoreCache?.delete(
      'delveStore',
    );
    vi.resetModules();
    const fresh = (await import('./delveStore')).useDelveStore;
    expect(fresh.getState().notices).toEqual([]);
  });

  it('chooses the mana once, binds a second element, and remembers a declined bind this session', () => {
    const s = () => useDelveStore.getState();
    s().resetProfile(5);
    expect(s().chooseMana('frost').ok).toBe(true);
    expect(s().profile.pair.primary).toBe('frost');
    expect(loadDelveProfile()?.profile.pair.primary).toBe('frost');
    expect(s().chooseMana('fire').ok).toBe(false);
    expect(s().bindSecondary('storm').ok).toBe(true);
    expect(s().profile.pair).toEqual({ primary: 'frost', secondary: 'storm' });
    s().declineBind('nature');
    s().declineBind('nature');
    expect(s().bindDeclined).toEqual(['nature']);
    s().resetProfile(5);
    expect(s().bindDeclined).toEqual([]);
  });

  it('closing a dive lets an overtaking secondary swap in, with a notice', () => {
    const storm = (slot: GearSlot) =>
      generateItem(
        registry,
        { uid: `s-${slot}`, ilvl: 1, rarity: 'common', slot, mana: 'storm' },
        new SeededRNG(1),
      );
    const s = useDelveStore.getState();
    s.setProfile({
      ...s.profile,
      pair: { primary: 'fire', secondary: 'storm' },
      equipped: {
        ...s.profile.equipped,
        helm: storm('helm'),
        gloves: storm('gloves'),
        boots: storm('boots'),
      },
    }); // storm 3 > 1.2 × fire 2
    useDelveStore.getState().startDive(1);
    useDelveStore.getState().closeDive();
    expect(useDelveStore.getState().profile.pair).toEqual({ primary: 'storm', secondary: 'fire' });
    expect(useDelveStore.getState().takeNotices()).toEqual([
      'Storm now outweighs Fire: your basic attacks strike with Storm',
    ]);
    expect(useDelveStore.getState().takeNotices()).toEqual([]);
  });

  it('realign charges and says which builds it changed; re-attune spends Mana Dust', () => {
    const s = useDelveStore.getState();
    s.setProfile({
      ...s.profile,
      pair: { primary: 'fire', secondary: 'storm' },
      manaDust: 500,
      scrap: 500,
      abilities: {
        ...s.profile.abilities,
        ultimate: { form: 'maelstrom', elements: ['storm'], weight: 0, payment: 'charge' },
      },
    });
    expect(useDelveStore.getState().realign({ secondary: 'frost' }).ok).toBe(true);
    expect(useDelveStore.getState().profile.pair).toEqual({ primary: 'fire', secondary: 'frost' });
    expect(useDelveStore.getState().takeNotices()).toEqual([
      "Your Maelstrom used Storm, which isn't in your pair; it now uses Fire",
    ]);
    const uid = useDelveStore.getState().profile.equipped.weapon!.uid;
    const dust = useDelveStore.getState().profile.manaDust;
    expect(useDelveStore.getState().reattune(uid, 'frost').ok).toBe(true);
    expect(useDelveStore.getState().profile.equipped.weapon!.mana).toBe('frost');
    expect(useDelveStore.getState().profile.manaDust).toBe(
      dust - registry.getDelveBalance().pair.reattuneDust.common,
    );
  });

  it('words the notices plainly', () => {
    const fix: BuildFix = {
      slot: 'ultimate',
      removed: ['frost', 'storm'],
      build: { form: 'maelstrom', elements: ['fire'], weight: 0, payment: 'charge' },
    };
    expect(fixNotice(registry, fix)).toBe(
      "Your Maelstrom used Frost and Storm, which aren't in your pair; it now uses Fire",
    );
    expect(overtakeNotice(registry, 'storm', 'fire')).toBe(
      'Storm now outweighs Fire: your basic attacks strike with Storm',
    );
  });
});
