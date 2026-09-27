import { describe, it, expect, beforeEach } from 'vitest';
import { createDelveProfile, generateItem, SeededRNG } from '@alloy/engine';
import { getDelveRegistry } from '@/features/delve/registry';
import {
  MAX_DUMMY_GROUPS,
  SANDBOX_DEFAULTS,
  SANDBOX_KEY,
  parseSandbox,
  sandboxEquipped,
  sandboxStats,
  useSandboxStore,
} from './sandboxStore';

const registry = getDelveRegistry();
const store = () => useSandboxStore.getState();

describe('sandboxStore', () => {
  beforeEach(() => {
    localStorage.clear();
    store().reset();
  });

  it('starts from the defaults: a rare fire sword, every toggle on, depth 5', () => {
    expect(parseSandbox(undefined)).toEqual(SANDBOX_DEFAULTS);
    expect(store()).toMatchObject({
      weapon: { baseId: 'sword', mana: 'fire', rarity: 'rare' },
      loadedWeapon: null,
      toggles: { infiniteMana: true, noCooldowns: true, invulnerable: true },
      depth: 5,
      slowmo: 1,
      dummyElement: null,
      dummies: [],
    });
    const stats = sandboxStats(registry, store());
    expect(stats.weapon.baseId).toBe('sword');
    expect(stats.weapon.element).toBe('fire');
  });

  it('saves every change under its own key and reads it back', () => {
    store().setDepth(9);
    store().setLegendary('glass_cannon', true);
    store().setAttunement('storm', 99);
    store().addDummyGroup({ layout: 'row', element: 'frost' });
    const saved = parseSandbox(JSON.parse(localStorage.getItem(SANDBOX_KEY)!));
    expect(saved.depth).toBe(9);
    expect(saved.legendaries).toEqual({ glass_cannon: registry.getLegendary('glass_cannon').max });
    expect(saved.attunement).toEqual({ storm: 15 });
    expect(saved.dummies).toEqual([{ layout: 'row', element: 'frost' }]);
    expect(localStorage.getItem('alloy:delve:v2')).toBeNull(); // never the Delve save
  });

  it('falls back field by field on bad or missing data', () => {
    expect(parseSandbox('not an object')).toEqual(SANDBOX_DEFAULTS);
    const s = parseSandbox({
      depth: 99,
      weapon: { baseId: 'spoon', mana: 'fire', rarity: 'rare' },
      slowmo: 0.5,
      toggles: { infiniteMana: false, noCooldowns: true, invulnerable: true },
      abilities: { primary: { form: 'ward', elements: ['fire'], weight: 0, payment: 'mana' } },
      legendaries: { not_a_power: 5 },
    });
    expect(s.depth).toBe(SANDBOX_DEFAULTS.depth);
    expect(s.weapon).toEqual(SANDBOX_DEFAULTS.weapon);
    expect(s.slowmo).toBe(0.5);
    expect(s.toggles.infiniteMana).toBe(false);
    expect(s.abilities).toEqual(SANDBOX_DEFAULTS.abilities);
    expect(s.legendaries).toEqual({});
    expect(parseSandbox({ weapon: null }).weapon).toBeNull();
    const nine = Array.from({ length: 9 }, () => ({ layout: 'single', element: null }));
    expect(parseSandbox({ dummies: nine }).dummies).toEqual(nine.slice(0, MAX_DUMMY_GROUPS));
  });

  it('keeps a saved loaded weapon only while the weapon choice still names it', () => {
    const bow = generateItem(
      registry,
      { uid: 'L1', ilvl: 9, rarity: 'legendary', slot: 'weapon', baseId: 'bow', mana: 'storm' },
      new SeededRNG(3),
    );
    const named = { baseId: 'bow', mana: 'storm', rarity: 'legendary' };
    expect(parseSandbox({ weapon: named, loadedWeapon: bow }).loadedWeapon).toEqual(bow);
    const other = { baseId: 'sword', mana: 'fire', rarity: 'rare' };
    expect(parseSandbox({ weapon: other, loadedWeapon: bow }).loadedWeapon).toBeNull();
    expect(parseSandbox({ weapon: null, loadedWeapon: bow }).loadedWeapon).toBeNull();
  });

  it(`keeps at most ${MAX_DUMMY_GROUPS} dummy groups`, () => {
    for (let i = 0; i < MAX_DUMMY_GROUPS + 1; i++)
      store().addDummyGroup({ layout: 'single', element: null });
    expect(store().dummies).toHaveLength(MAX_DUMMY_GROUPS);
  });

  it('Load my build copies the real weapon, the other gear and the builds, and clears the extras', () => {
    const profile = createDelveProfile(registry, 7);
    const bow = generateItem(
      registry,
      { uid: 'L1', ilvl: 9, rarity: 'legendary', slot: 'weapon', baseId: 'bow', mana: 'storm' },
      new SeededRNG(3),
    );
    store().setLegendary('glass_cannon', true);
    store().setAttunement('fire', 5);
    store().loadMyBuild({ ...profile, equipped: { ...profile.equipped, weapon: bow } });
    const s = store();
    expect(s.loadedWeapon).toEqual(bow);
    expect(s.weapon).toEqual({ baseId: 'bow', mana: 'storm', rarity: 'legendary' });
    expect(s.gear).toEqual({ chest: profile.equipped.chest });
    expect(s.abilities).toEqual(profile.abilities);
    expect(s.legendaries).toEqual({});
    expect(s.attunement).toEqual({});
    expect(sandboxEquipped(registry, s).weapon).toEqual(bow);
    expect(sandboxStats(registry, s).legendaries[bow.legendary!.id]).toBe(bow.legendary!.value);

    // Re-picking the same choice (the pressed chip) keeps the real weapon; any change drops it.
    s.setWeapon({ baseId: 'bow', mana: 'storm', rarity: 'legendary' });
    expect(store().loadedWeapon).toEqual(bow);
    s.setWeapon({ baseId: 'bow', mana: 'storm', rarity: 'rare' });
    expect(store().loadedWeapon).toBeNull();
    expect(sandboxEquipped(registry, store()).weapon?.legendary).toBeUndefined();
  });

  it('Load my build without a weapon leaves the hero unarmed', () => {
    const profile = createDelveProfile(registry, 7);
    const { weapon: _weapon, ...rest } = profile.equipped;
    store().loadMyBuild({ ...profile, equipped: rest });
    expect(store().weapon).toBeNull();
    expect(store().loadedWeapon).toBeNull();
    expect(sandboxEquipped(registry, store()).weapon).toBeUndefined();
    expect(sandboxStats(registry, store()).weapon.baseId).toBeNull();
  });
});
